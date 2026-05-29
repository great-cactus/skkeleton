import { assertEquals } from "@std/assert";
import type { LlmProvider } from "./provider.ts";
import type { LlmGenerateRequest, LlmScoreRequest, ScoredCandidate } from "./types.ts";

/** テスト用モックプロバイダ */
class MockLlmProvider implements LlmProvider {
  readonly name = "mock";
  #healthy: boolean;
  #generateResult: string[];
  #scoreResult: ScoredCandidate[];
  generateCallCount = 0;
  scoreCallCount = 0;

  constructor(opts?: {
    healthy?: boolean;
    generateResult?: string[];
    scoreResult?: ScoredCandidate[];
  }) {
    this.#healthy = opts?.healthy ?? true;
    this.#generateResult = opts?.generateResult ?? [];
    this.#scoreResult = opts?.scoreResult ?? [];
  }

  async scoreCandidates(_req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    this.scoreCallCount++;
    return this.#scoreResult;
  }

  async generateCandidates(_req: LlmGenerateRequest): Promise<string[]> {
    this.generateCallCount++;
    return this.#generateResult;
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
  const candidates = ["化学", "科学"];
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

Deno.test("MockLlmProvider - scoreCandidates returns configured results", async () => {
  const scored: ScoredCandidate[] = [
    { value: "化学", logprobSum: -5.0, logprobAvg: -1.0 },
    { value: "科学", logprobSum: -8.0, logprobAvg: -2.0 },
  ];
  const provider = new MockLlmProvider({ scoreResult: scored });

  const result = await provider.scoreCandidates({
    word: "かがく",
    type: "okurinasi",
    candidates: ["科学", "化学"],
    contextBefore: "有機化合物の",
    contextAfter: "反応において",
  });

  assertEquals(result, scored);
  assertEquals(provider.scoreCallCount, 1);
});

Deno.test("MockLlmProvider - unhealthy provider", async () => {
  const provider = new MockLlmProvider({ healthy: false });
  assertEquals(await provider.healthCheck(), false);
});
