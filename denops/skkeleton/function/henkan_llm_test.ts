import { assertEquals } from "jsr:@std/assert@1/equals";
import { config } from "../config.ts";
import type { HenkanState } from "../state.ts";
import type { LlmCandidate } from "../llm/types.ts";
import { MockLlmProvider } from "../llm/provider_test.ts";
import {
  applyLlmFallbackCandidates,
  applyRerankResult,
  shouldLlmFallback,
  shouldLlmRerank,
} from "./henkan.ts";

// テスト用の最小限 HenkanState を作成するヘルパー
function makeHenkanState(overrides: Partial<HenkanState> = {}): HenkanState {
  return {
    type: "henkan",
    mode: "okurinasi",
    directInput: false,
    table: {},
    feed: "",
    henkanFeed: "かんじ",
    okuriFeed: "",
    previousFeed: false,
    word: "かんじ",
    candidates: [],
    candidateIndex: -1,
    llmCandidateIndices: new Set(),
    ...overrides,
  } as HenkanState;
}

// --- shouldLlmFallback ---

Deno.test("shouldLlmFallback - true when no candidates and LLM enabled", () => {
  const orig = { llmEnabled: config.llmEnabled, llmFallbackEnabled: config.llmFallbackEnabled };
  try {
    config.llmEnabled = true;
    config.llmFallbackEnabled = true;
    const provider = new MockLlmProvider();
    assertEquals(shouldLlmFallback(0, provider), true);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmFallbackEnabled = orig.llmFallbackEnabled;
  }
});

Deno.test("shouldLlmFallback - false when candidates exist", () => {
  const orig = { llmEnabled: config.llmEnabled, llmFallbackEnabled: config.llmFallbackEnabled };
  try {
    config.llmEnabled = true;
    config.llmFallbackEnabled = true;
    const provider = new MockLlmProvider();
    assertEquals(shouldLlmFallback(3, provider), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmFallbackEnabled = orig.llmFallbackEnabled;
  }
});

Deno.test("shouldLlmFallback - false when LLM disabled", () => {
  const orig = { llmEnabled: config.llmEnabled, llmFallbackEnabled: config.llmFallbackEnabled };
  try {
    config.llmEnabled = false;
    config.llmFallbackEnabled = true;
    const provider = new MockLlmProvider();
    assertEquals(shouldLlmFallback(0, provider), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmFallbackEnabled = orig.llmFallbackEnabled;
  }
});

Deno.test("shouldLlmFallback - false when fallback disabled", () => {
  const orig = { llmEnabled: config.llmEnabled, llmFallbackEnabled: config.llmFallbackEnabled };
  try {
    config.llmEnabled = true;
    config.llmFallbackEnabled = false;
    assertEquals(shouldLlmFallback(0, new MockLlmProvider()), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmFallbackEnabled = orig.llmFallbackEnabled;
  }
});

Deno.test("shouldLlmFallback - false when provider is null", () => {
  const orig = { llmEnabled: config.llmEnabled, llmFallbackEnabled: config.llmFallbackEnabled };
  try {
    config.llmEnabled = true;
    config.llmFallbackEnabled = true;
    assertEquals(shouldLlmFallback(0, null), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmFallbackEnabled = orig.llmFallbackEnabled;
  }
});

// --- shouldLlmRerank ---

Deno.test("shouldLlmRerank - true when 2+ candidates and LLM rerank enabled", () => {
  const orig = { llmEnabled: config.llmEnabled, llmRerankEnabled: config.llmRerankEnabled };
  try {
    config.llmEnabled = true;
    config.llmRerankEnabled = true;
    assertEquals(shouldLlmRerank(2, new MockLlmProvider()), true);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmRerankEnabled = orig.llmRerankEnabled;
  }
});

Deno.test("shouldLlmRerank - false when only 1 candidate", () => {
  const orig = { llmEnabled: config.llmEnabled, llmRerankEnabled: config.llmRerankEnabled };
  try {
    config.llmEnabled = true;
    config.llmRerankEnabled = true;
    assertEquals(shouldLlmRerank(1, new MockLlmProvider()), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmRerankEnabled = orig.llmRerankEnabled;
  }
});

Deno.test("shouldLlmRerank - false when rerank disabled", () => {
  const orig = { llmEnabled: config.llmEnabled, llmRerankEnabled: config.llmRerankEnabled };
  try {
    config.llmEnabled = true;
    config.llmRerankEnabled = false;
    assertEquals(shouldLlmRerank(5, new MockLlmProvider()), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmRerankEnabled = orig.llmRerankEnabled;
  }
});

// --- applyLlmFallbackCandidates ---

Deno.test("applyLlmFallbackCandidates - adds candidates and marks indices", () => {
  const state = makeHenkanState();
  const llmCandidates: LlmCandidate[] = [
    { value: "漢字", score: 0.9, isLlmGenerated: true },
    { value: "感じ", score: 0.8, isLlmGenerated: true },
  ];

  applyLlmFallbackCandidates(state, llmCandidates);

  assertEquals(state.candidates, ["漢字", "感じ"]);
  assertEquals(state.llmCandidateIndices, new Set([0, 1]));
});

Deno.test("applyLlmFallbackCandidates - appends to existing candidates", () => {
  const state = makeHenkanState({ candidates: ["既存候補"] });
  const llmCandidates: LlmCandidate[] = [
    { value: "LLM候補", score: 0.7, isLlmGenerated: true },
  ];

  applyLlmFallbackCandidates(state, llmCandidates);

  assertEquals(state.candidates, ["既存候補", "LLM候補"]);
  assertEquals(state.llmCandidateIndices, new Set([1]));
});

Deno.test("applyLlmFallbackCandidates - empty array does nothing", () => {
  const state = makeHenkanState();
  applyLlmFallbackCandidates(state, []);
  assertEquals(state.candidates, []);
  assertEquals(state.llmCandidateIndices.size, 0);
});

// --- applyRerankResult ---

Deno.test("applyRerankResult - reorders when candidateIndex <= 0", () => {
  const state = makeHenkanState({
    candidates: ["A", "B", "C"],
    candidateIndex: 0,
  });
  const result: LlmCandidate[] = [
    { value: "C", score: 0.9, isLlmGenerated: false },
    { value: "A", score: 0.8, isLlmGenerated: false },
    { value: "B", score: 0.7, isLlmGenerated: false },
  ];

  applyRerankResult(state, result, ["A", "B", "C"], 10);

  assertEquals(state.candidates, ["C", "A", "B"]);
});

Deno.test("applyRerankResult - preserves remaining candidates beyond maxCandidates", () => {
  const state = makeHenkanState({
    candidates: ["A", "B", "C", "D", "E"],
    candidateIndex: -1,
  });
  const result: LlmCandidate[] = [
    { value: "B", score: 0.9, isLlmGenerated: false },
    { value: "A", score: 0.8, isLlmGenerated: false },
  ];
  // maxCandidates=2 means D,E are "remaining"
  applyRerankResult(state, result, ["A", "B", "C", "D", "E"], 2);

  assertEquals(state.candidates, ["B", "A", "C", "D", "E"]);
});

Deno.test("applyRerankResult - does not update when candidateIndex > 0", () => {
  const state = makeHenkanState({
    candidates: ["A", "B", "C"],
    candidateIndex: 1,
  });
  const result: LlmCandidate[] = [
    { value: "C", score: 0.9, isLlmGenerated: false },
    { value: "B", score: 0.8, isLlmGenerated: false },
    { value: "A", score: 0.7, isLlmGenerated: false },
  ];

  applyRerankResult(state, result, ["A", "B", "C"], 10);

  // Should NOT change because user already moved past first candidate
  assertEquals(state.candidates, ["A", "B", "C"]);
});

Deno.test("applyRerankResult - does not update when state is no longer henkan", () => {
  const state = makeHenkanState({
    candidates: ["A", "B"],
    candidateIndex: 0,
  });
  // Simulate user having confirmed (state type changed)
  (state as unknown as { type: string }).type = "input";

  const result: LlmCandidate[] = [
    { value: "B", score: 0.9, isLlmGenerated: false },
    { value: "A", score: 0.8, isLlmGenerated: false },
  ];

  applyRerankResult(state, result, ["A", "B"], 10);

  assertEquals(state.candidates, ["A", "B"]);
});
