import type { LlmProvider, LlmProviderConfig } from "../provider.ts";
import type { LlmGenerateRequest, LlmScoreRequest, ScoredCandidate } from "../types.ts";
import { buildGeneratePrompt, parseGenerateResponse } from "../prompt.ts";
import { deadline } from "@std/async/deadline";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
};

/**
 * クラウド LLM プロバイダ（OpenAI 互換 API + 認証）
 *
 * F2: /v1/chat/completions で文脈に基づく候補リランキング
 * F1: /v1/chat/completions でかな→漢字候補を生成
 */
export class CloudLlmProvider implements LlmProvider {
  readonly name = "cloud";
  #endpoint: string;
  #apiKey: string;
  #model: string;
  #timeoutMs: number;
  #fallbackTimeoutMs: number;

  constructor(config: LlmProviderConfig) {
    this.#endpoint = config.endpoint.replace(/\/$/, "");
    this.#apiKey = config.apiKey;
    this.#model = config.model;
    this.#timeoutMs = config.timeoutMs;
    this.#fallbackTimeoutMs = config.fallbackTimeoutMs;
  }

  /**
   * F2: Chat Completionによる候補リランキング
   * 文脈に最も適した候補をLLMに選ばせ、その候補を先頭に並べ替える。
   */
  async scoreCandidates(req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    if (req.candidates.length === 0) return [];

    const context = req.contextBefore + "___" + req.contextAfter;
    const candidateList = req.candidates
      .map((c, i) => `${i + 1}. ${c}`)
      .join("\n");

    try {
      const content = await this.#chatCompletion(
        [
          {
            role: "system",
            content:
              "日本語かな漢字変換のアシスタントです。文脈に最も適した候補の番号を1つだけ出力してください。",
          },
          {
            role: "user",
            content: `文脈: ${context}\nよみ: ${req.word}\n${candidateList}`,
          },
        ],
        this.#timeoutMs,
      );

      const bestIndex = parseBestIndex(content, req.candidates.length);
      if (bestIndex < 0) return [];

      return req.candidates.map((c, i) => ({
        value: c,
        logprobSum: i === bestIndex ? 0 : -(i < bestIndex ? i + 1 : i),
        logprobAvg: i === bestIndex ? 0 : -1,
      })).sort((a, b) => b.logprobSum - a.logprobSum);
    } catch {
      return [];
    }
  }

  async generateCandidates(req: LlmGenerateRequest): Promise<string[]> {
    const prompt = buildGeneratePrompt(req);
    try {
      const content = await this.#chatCompletion(
        [{ role: "user", content: prompt }],
        this.#fallbackTimeoutMs,
        100,
        0.3,
      );
      return parseGenerateResponse(content);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await deadline(
        fetch(`${this.#endpoint}/v1/models`, {
          headers: {
            "Authorization": `Bearer ${this.#apiKey}`,
          },
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

  async #chatCompletion(
    messages: ChatMessage[],
    timeoutMs: number,
    maxTokens = 2,
    temperature = 0,
  ): Promise<string> {
    const body = JSON.stringify({
      model: this.#model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    const resp = await deadline(
      fetch(`${this.#endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.#apiKey}`,
        },
        body,
        // タイムアウト時に接続自体を中断してリークを防ぐ
        signal: AbortSignal.timeout(timeoutMs),
      }),
      timeoutMs,
    );

    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`LLM API error: ${resp.status}`);
    }

    const json = await resp.json() as ChatCompletionResponse;
    return json.choices?.[0]?.message?.content ?? "";
  }
}

/**
 * LLMレスポンスから最良候補のインデックス（0-based）を抽出する。
 * "1" "1." "2" などの形式を想定。解析失敗時は -1。
 */
function parseBestIndex(content: string, maxCandidates: number): number {
  const match = content.trim().match(/^(\d+)/);
  if (!match) return -1;
  const num = parseInt(match[1], 10);
  if (num < 1 || num > maxCandidates) return -1;
  return num - 1;
}
