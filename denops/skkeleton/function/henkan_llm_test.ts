import { assertEquals } from "jsr:@std/assert@1/equals";
import { config } from "../config.ts";
import type { HenkanState } from "../state.ts";
import { MockLlmProvider } from "../llm/provider_test.ts";
import {
  applyLlmFallbackCandidates,
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

Deno.test("shouldLlmRerank - true when 2+ candidates and LLM enabled", () => {
  const orig = { llmEnabled: config.llmEnabled };
  try {
    config.llmEnabled = true;
    assertEquals(shouldLlmRerank(2, new MockLlmProvider()), true);
  } finally {
    config.llmEnabled = orig.llmEnabled;
  }
});

Deno.test("shouldLlmRerank - false when only 1 candidate", () => {
  const orig = { llmEnabled: config.llmEnabled };
  try {
    config.llmEnabled = true;
    assertEquals(shouldLlmRerank(1, new MockLlmProvider()), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
  }
});

Deno.test("shouldLlmRerank - false when LLM disabled", () => {
  const orig = { llmEnabled: config.llmEnabled };
  try {
    config.llmEnabled = false;
    assertEquals(shouldLlmRerank(5, new MockLlmProvider()), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
  }
});

Deno.test("shouldLlmRerank - false when provider is null", () => {
  const orig = { llmEnabled: config.llmEnabled };
  try {
    config.llmEnabled = true;
    assertEquals(shouldLlmRerank(5, null), false);
  } finally {
    config.llmEnabled = orig.llmEnabled;
  }
});

// --- applyLlmFallbackCandidates ---

Deno.test("applyLlmFallbackCandidates - adds candidates and marks indices", () => {
  const state = makeHenkanState();
  applyLlmFallbackCandidates(state, ["漢字", "感じ"]);

  assertEquals(state.candidates, ["漢字", "感じ"]);
  assertEquals(state.llmCandidateIndices, new Set([0, 1]));
});

Deno.test("applyLlmFallbackCandidates - appends to existing candidates", () => {
  const state = makeHenkanState({ candidates: ["既存候補"] });
  applyLlmFallbackCandidates(state, ["LLM候補"]);

  assertEquals(state.candidates, ["既存候補", "LLM候補"]);
  assertEquals(state.llmCandidateIndices, new Set([1]));
});

Deno.test("applyLlmFallbackCandidates - empty array does nothing", () => {
  const state = makeHenkanState();
  applyLlmFallbackCandidates(state, []);
  assertEquals(state.candidates, []);
  assertEquals(state.llmCandidateIndices.size, 0);
});
