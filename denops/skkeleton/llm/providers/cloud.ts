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
 * クラウド LLM プロバイダ（OpenAI 互換 API + 認証）
 *
 * F2: /v1/completions + logprobs でバッチスコアリング
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

  async scoreCandidates(req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    if (req.candidates.length === 0) return [];

    const prompts = req.candidates.map(
      (c) => `${req.contextBefore}${c}${req.contextAfter}`,
    );
    const prefixPrompt = req.contextBefore;

    try {
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
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.#apiKey}`,
          },
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

      const prefixChoice = choices.find((c) => c.index === 0);
      const prefixAllTokens = prefixChoice?.logprobs?.tokens?.length ?? 0;
      const prefixTokenCount = Math.max(0, prefixAllTokens - 1);

      const scored: ScoredCandidate[] = [];
      for (let i = 0; i < req.candidates.length; i++) {
        const choice = choices.find((c) => c.index === i + 1);
        if (!choice?.logprobs) continue;

        const { token_logprobs } = choice.logprobs;
        const promptTokens = token_logprobs.length - 1;

        let sum = 0;
        let count = 0;
        for (let j = prefixTokenCount; j < promptTokens; j++) {
          const lp = token_logprobs[j];
          if (lp !== null && lp !== -Infinity) {
            sum += lp;
            count++;
          }
        }

        scored.push({
          value: req.candidates[i],
          logprobSum: sum,
          logprobAvg: count > 0 ? sum / count : -Infinity,
        });
      }

      scored.sort((a, b) => b.logprobSum - a.logprobSum);
      return scored;
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
        }),
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
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.#apiKey}`,
        },
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
