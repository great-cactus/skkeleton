import type { LlmProvider, LlmProviderConfig } from "../provider.ts";
import type { LlmCandidate, LlmHenkanRequest, LlmRerankRequest } from "../types.ts";
import { buildGeneratePrompt, buildRerankPrompt, parseGenerateResponse, parseRerankResponse } from "../prompt.ts";
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
 */
export class CloudLlmProvider implements LlmProvider {
  readonly name = "cloud";
  #endpoint: string;
  #apiKey: string;
  #model: string;
  #timeoutMs: number;

  constructor(config: LlmProviderConfig) {
    this.#endpoint = config.endpoint.replace(/\/$/, "");
    this.#apiKey = config.apiKey;
    this.#model = config.model;
    this.#timeoutMs = config.timeoutMs;
  }

  async generateCandidates(req: LlmHenkanRequest): Promise<LlmCandidate[]> {
    const prompt = buildGeneratePrompt(req);
    try {
      const content = await this.#chatCompletion([
        { role: "user", content: prompt },
      ]);
      const values = parseGenerateResponse(content);
      return values.map((value, i) => ({
        value,
        score: 1.0 - i * 0.1,
        isLlmGenerated: true,
      }));
    } catch {
      return [];
    }
  }

  async rerankCandidates(req: LlmRerankRequest): Promise<LlmCandidate[]> {
    const prompt = buildRerankPrompt(req);
    try {
      const content = await this.#chatCompletion([
        { role: "user", content: prompt },
      ]);
      const reordered = parseRerankResponse(content, req.candidates);
      return reordered.map((value, i) => ({
        value,
        score: 1.0 - i * (1.0 / reordered.length),
        isLlmGenerated: false,
      }));
    } catch {
      return req.candidates.map((value, i) => ({
        value,
        score: 1.0 - i * (1.0 / req.candidates.length),
        isLlmGenerated: false,
      }));
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

  async #chatCompletion(messages: ChatMessage[]): Promise<string> {
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
      this.#timeoutMs,
    );

    if (!resp.ok) {
      await resp.body?.cancel();
      throw new Error(`LLM API error: ${resp.status}`);
    }

    const json = await resp.json() as ChatCompletionResponse;
    return json.choices?.[0]?.message?.content ?? "";
  }
}
