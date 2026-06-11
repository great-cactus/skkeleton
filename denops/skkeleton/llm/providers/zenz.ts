import type { LlmProvider, LlmProviderConfig } from "../provider.ts";
import type {
  LlmGenerateRequest,
  LlmScoreRequest,
  ScoredCandidate,
} from "../types.ts";
import { deadline } from "@std/async/deadline";

// zenz (v3 系) かな漢字変換特化モデルの特殊マーカー
// フォーマット: <left><right><yomi_katakana><output></s>
// (右文脈マーカー  は v3.2 以降のみ。空のときは省略する)
const MARKER_INPUT = "\uee00";
const MARKER_OUTPUT = "\uee01";
const MARKER_LEFT_CONTEXT = "\uee02";
const MARKER_RIGHT_CONTEXT = "\uee07";

// プレフィル時間を抑えるための文脈の文字数上限
// (zenz-v3.2-small は CPU で 1000 tok/s 程度。文字レベルなので文字数 ≒ トークン数)
const LEFT_CONTEXT_MAX_CHARS = 80;
const RIGHT_CONTEXT_MAX_CHARS = 40;

type CompletionResponse = {
  choices?: Array<{
    text?: string;
    logprobs?: {
      token_logprobs?: Array<number | null>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
  };
};

/** ひらがなをカタカナに変換する（ひらがな以外はそのまま） */
export function hiraToKata(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    out += cp >= 0x3041 && cp <= 0x3096
      ? String.fromCodePoint(cp + 0x60)
      : ch;
  }
  return out;
}

/**
 * zenz 形式の条件付けプレフィックスを構成する。
 * 文脈は改行を除去し、直近の文字数だけを使う。
 */
export function buildZenzPrefix(
  contextBefore: string,
  contextAfter: string,
  yomiKana: string,
): string {
  const left = contextBefore.replaceAll("\n", "").slice(
    -LEFT_CONTEXT_MAX_CHARS,
  );
  const right = contextAfter.replaceAll("\n", "").slice(
    0,
    RIGHT_CONTEXT_MAX_CHARS,
  );
  const rightPart = right ? MARKER_RIGHT_CONTEXT + right : "";
  return MARKER_LEFT_CONTEXT + left + rightPart +
    MARKER_INPUT + hiraToKata(yomiKana) + MARKER_OUTPUT;
}

/**
 * zenz プロバイダ（llama.cpp / かな漢字変換特化モデル）
 *
 * F2: /v1/completions の echo+logprobs で各候補の条件付き対数尤度
 *     logP(候補 | 文脈, 読み) を求めてリランキングする。
 *     指示追従を要しないため 0.1B 級のモデルで動作する。
 * F1: 同じ条件付けで greedy 生成し、最良の変換を 1 候補返す。
 *
 * 想定サーバー: echo+logprobs 対応の llama-server + zenz-v3.2 系 GGUF
 */
export class ZenzLlmProvider implements LlmProvider {
  readonly name = "zenz";
  #endpoint: string;
  #timeoutMs: number;
  #fallbackTimeoutMs: number;

  constructor(config: LlmProviderConfig) {
    this.#endpoint = config.endpoint.replace(/\/$/, "");
    this.#timeoutMs = config.timeoutMs;
    this.#fallbackTimeoutMs = config.fallbackTimeoutMs;
  }

  /**
   * F2: 候補ごとに「プレフィックス+表層形」の echo+logprobs を取り、
   * 候補部分のトークン logprob 合計で順位付けする。
   */
  async scoreCandidates(req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    if (req.candidates.length === 0) return [];

    const kana = req.kanaReading ?? req.word;
    const okuri = req.okuriKana ?? "";
    const prefix = buildZenzPrefix(req.contextBefore, req.contextAfter, kana);

    try {
      return await deadline(
        this.#scoreAll(prefix, req.candidates, okuri),
        this.#timeoutMs,
      );
    } catch {
      return [];
    }
  }

  async #scoreAll(
    prefix: string,
    candidates: string[],
    okuri: string,
  ): Promise<ScoredCandidate[]> {
    const nPrefix = await this.#countTokens(prefix, this.#timeoutMs);
    const scored = await Promise.all(candidates.map(async (c) => {
      // SKK 辞書のアノテーション（"梯;梯子" の ; 以降）は表記ではないので
      // スコア対象から除く。返す値は元の候補文字列のまま
      const surface = c.replace(/;.*$/, "") + okuri;
      const { sum, count } = await this.#scoreSuffix(prefix, surface, nPrefix);
      return {
        value: c,
        logprobSum: sum,
        logprobAvg: count > 0 ? sum / count : -Infinity,
      };
    }));
    return scored.sort((a, b) => b.logprobSum - a.logprobSum);
  }

  /**
   * F1: greedy 生成による最良変換の取得（1 候補）。
   * okuriari の場合は生成された表層形から送り仮名を取り除いて語幹を返す。
   */
  async generateCandidates(req: LlmGenerateRequest): Promise<string[]> {
    const kana = req.kanaReading ?? req.word;
    const okuri = req.okuriKana ?? "";
    const prefix = buildZenzPrefix(req.contextBefore, req.contextAfter, kana);

    try {
      const json = await deadline(
        this.#post("/v1/completions", {
          prompt: prefix,
          max_tokens: 16,
          temperature: 0,
        }, this.#fallbackTimeoutMs),
        this.#fallbackTimeoutMs,
      ) as CompletionResponse;
      let text = (json.choices?.[0]?.text ?? "").trim();
      if (text === "") return [];
      if (okuri !== "" && text.endsWith(okuri)) {
        text = text.slice(0, -okuri.length);
      }
      return text === "" || text === kana ? [] : [text];
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await deadline(
        fetch(`${this.#endpoint}/v1/models`, {
          // タイムアウト時に接続自体を中断してリークを防ぐ
          signal: AbortSignal.timeout(this.#timeoutMs),
        }),
        this.#timeoutMs,
      );
      await resp.body?.cancel();
      return resp.ok;
    } catch {
      return false;
    }
  }

  async #countTokens(text: string, timeoutMs: number): Promise<number> {
    const json = await this.#post("/tokenize", {
      content: text,
      add_special: false,
      parse_special: true,
    }, timeoutMs) as { tokens?: unknown[] };
    return json.tokens?.length ?? 0;
  }

  /**
   * prefix+suffix の echo+logprobs から suffix 部分の logprob 合計を求める。
   * suffix のトークン範囲は [プレフィックストークン数, プロンプトトークン数)。
   */
  async #scoreSuffix(
    prefix: string,
    suffix: string,
    nPrefix: number,
  ): Promise<{ sum: number; count: number }> {
    const json = await this.#post("/v1/completions", {
      prompt: prefix + suffix,
      max_tokens: 0,
      echo: true,
      logprobs: 1,
      temperature: 0,
    }, this.#timeoutMs) as CompletionResponse;

    const lps = json.choices?.[0]?.logprobs?.token_logprobs ?? [];
    const nPrompt = json.usage?.prompt_tokens;
    if (nPrompt == null || nPrompt <= nPrefix || lps.length < nPrompt) {
      throw new Error("unexpected logprobs response");
    }

    let sum = 0;
    let count = 0;
    for (const v of lps.slice(nPrefix, nPrompt)) {
      if (typeof v !== "number") {
        throw new Error("missing logprob in candidate span");
      }
      sum += v;
      count++;
    }
    return { sum, count };
  }

  async #post(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<unknown> {
    const resp = await fetch(`${this.#endpoint}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // タイムアウト時に接続自体を中断してリークを防ぐ
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`zenz API error: ${resp.status}`);
    }
    return await resp.json();
  }
}
