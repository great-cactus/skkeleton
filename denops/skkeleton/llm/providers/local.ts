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

type CompletionChoice = {
  index: number;
  logprobs?: {
    tokens: string[];
    token_logprobs: (number | null)[];
  };
};

type CompletionResponse = {
  choices: CompletionChoice[];
};

/**
 * ローカル LLM プロバイダ（llama.cpp / OpenAI 互換 API）
 *
 * F2: /v1/completions + logprobs でバッチスコアリング
 * F1: /v1/chat/completions でかな→漢字候補を生成
 */
export class LocalLlmProvider implements LlmProvider {
  readonly name = "local";
  #endpoint: string;
  #model: string;
  #timeoutMs: number;
  #fallbackTimeoutMs: number;

  constructor(config: LlmProviderConfig) {
    this.#endpoint = config.endpoint.replace(/\/$/, "");
    this.#model = config.model;
    this.#timeoutMs = config.timeoutMs;
    this.#fallbackTimeoutMs = config.fallbackTimeoutMs;
  }

  /**
   * F2: logprobsバッチスコアリング
   * 全候補を1リクエストで評価し、スコア降順にソートして返す。
   */
  async scoreCandidates(req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    if (req.candidates.length === 0) return [];

    // 各候補をコンテキストに埋め込んだプロンプトを構築
    const prompts = req.candidates.map(
      (c) => `${req.contextBefore}${c}${req.contextAfter}`,
    );

    // contextBeforeのみのプロンプト（トークン数のベースライン計測用）
    const prefixPrompt = req.contextBefore;

    try {
      // バッチリクエスト: 全候補 + prefix を1リクエストで投げる
      const allPrompts = [prefixPrompt, ...prompts];
      const body = JSON.stringify({
        model: this.#model,
        prompt: allPrompts,
        max_tokens: 0,
        echo: true,
        logprobs: 1,
      });

      const resp = await deadline(
        fetch(`${this.#endpoint}/v1/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
        this.#timeoutMs,
      );

      if (!resp.ok) {
        await resp.body?.cancel();
        return [];
      }

      const json = await resp.json() as CompletionResponse;
      const choices = json.choices;

      if (!choices || choices.length < 2) return [];

      // choices[0] = prefix only → prefixのトークン数を取得
      const prefixChoice = choices.find((c) => c.index === 0);
      const prefixTokenCount = prefixChoice?.logprobs?.tokens?.length ?? 0;

      // 各候補のスコアを算出
      const scored: ScoredCandidate[] = [];
      for (let i = 0; i < req.candidates.length; i++) {
        const choice = choices.find((c) => c.index === i + 1);
        if (!choice?.logprobs) continue;

        const { token_logprobs } = choice.logprobs;
        const totalTokens = token_logprobs.length;

        // candidate部分 = prefixTokenCount から (totalTokens - afterTokens) まで
        // afterTokensの正確な計算は難しいため、
        // prefix部分のlogprobsを除いた全体からcontextAfter部分を推定する
        // 簡易方式: prefixTokenCount以降のlogprobsで、nullでないものを合計
        let sum = 0;
        let count = 0;
        for (let j = prefixTokenCount; j < totalTokens; j++) {
          const lp = token_logprobs[j];
          if (lp !== null) {
            sum += lp;
            count++;
          }
        }

        // contextAfterを含むため正確にはcandidate部分だけではないが、
        // 全候補で同じcontextAfterなので相対順序は正しい
        scored.push({
          value: req.candidates[i],
          logprobSum: sum,
          logprobAvg: count > 0 ? sum / count : -Infinity,
        });
      }

      // スコア降順にソート（logprobSumが大きいほど良い）
      scored.sort((a, b) => b.logprobSum - a.logprobSum);
      return scored;
    } catch {
      // タイムアウトやネットワークエラー時は空配列（辞書順にフォールバック）
      return [];
    }
  }

  /**
   * F1: Chat Completionによるかな→漢字候補生成
   */
  async generateCandidates(req: LlmGenerateRequest): Promise<string[]> {
    const prompt = buildGeneratePrompt(req);
    try {
      const content = await this.#chatCompletion(
        [{ role: "user", content: prompt }],
        this.#fallbackTimeoutMs,
      );
      return parseGenerateResponse(content);
    } catch {
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const resp = await deadline(
        fetch(`${this.#endpoint}/v1/models`),
        this.#timeoutMs,
      );
      await resp.body?.cancel();
      return resp.ok;
    } catch {
      return false;
    }
  }

  async #chatCompletion(messages: ChatMessage[], timeoutMs: number): Promise<string> {
    const body = JSON.stringify({
      model: this.#model,
      messages,
      max_tokens: 100,
      temperature: 0.3,
    });

    const resp = await deadline(
      fetch(`${this.#endpoint}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
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
