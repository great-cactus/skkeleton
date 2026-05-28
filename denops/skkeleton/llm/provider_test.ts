import { assertEquals } from "@std/assert";
import type { LlmProvider } from "./provider.ts";
import type { LlmCandidate, LlmHenkanRequest, LlmRerankRequest } from "./types.ts";

/** テスト用モックプロバイダ */
class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  #healthy: boolean;
  #generateResult: LlmCandidate[];
  #rerankResult: LlmCandidate[];
  generateCallCount = 0;
  rerankCallCount = 0;

  constructor(opts?: {
    healthy?: boolean;
    generateResult?: LlmCandidate[];
    rerankResult?: LlmCandidate[];
  }) {
    this.#healthy = opts?.healthy ?? true;
    this.#generateResult = opts?.generateResult ?? [];
    this.#rerankResult = opts?.rerankResult ?? [];
  }

  async generateCandidates(_req: LlmHenkanRequest): Promise<LlmCandidate[]> {
    this.generateCallCount++;
    return this.#generateResult;
  }

  async rerankCandidates(_req: LlmRerankRequest): Promise<LlmCandidate[]> {
    this.rerankCallCount++;
    return this.#rerankResult;
  }

  async healthCheck(): Promise<boolean> {
    return this.#healthy;
  }
}

// Export for reuse in other tests
export { MockLlmProvider };

Deno.test("MockLlmProvider implements LlmProvider interface", async () => {
  const provider = new MockLlmProvider();
  assertEquals(provider.name, "mock");
  assertEquals(await provider.healthCheck(), true);
});

Deno.test("MockLlmProvider - generateCandidates returns configured results", async () => {
  const candidates: LlmCandidate[] = [
    { value: "化学", score: 0.9, isLlmGenerated: true },
    { value: "科学", score: 0.7, isLlmGenerated: true },
  ];
  const provider = new MockLlmProvider({ generateResult: candidates });

  const result = await provider.generateCandidates({
    word: "かがく",
    type: "okurinasi",
    contextBefore: "有機化合物の",
    contextAfter: "反応において",
  });

  assertEquals(result, candidates);
  assertEquals(provider.generateCallCount, 1);
});

Deno.test("MockLlmProvider - rerankCandidates returns configured results", async () => {
  const reranked: LlmCandidate[] = [
    { value: "化学", score: 0.95, isLlmGenerated: false },
    { value: "科学", score: 0.6, isLlmGenerated: false },
  ];
  const provider = new MockLlmProvider({ rerankResult: reranked });

  const result = await provider.rerankCandidates({
    word: "かがく",
    type: "okurinasi",
    candidates: ["科学", "化学"],
    contextBefore: "",
    contextAfter: "",
  });

  assertEquals(result, reranked);
  assertEquals(provider.rerankCallCount, 1);
});

Deno.test("MockLlmProvider - unhealthy provider", async () => {
  const provider = new MockLlmProvider({ healthy: false });
  assertEquals(await provider.healthCheck(), false);
});
