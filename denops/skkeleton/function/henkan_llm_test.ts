import { assertEquals } from "jsr:@std/assert@1/equals";
import { config } from "../config.ts";
import type { HenkanState } from "../state.ts";
import { MockLlmProvider } from "../llm/provider_test.ts";
import {
  applyLlmFallbackCandidates,
  extractBufferContext,
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

// --- extractBufferContext ---

Deno.test("extractBufferContext - strips pre-edit marker from before-context", () => {
  // 「ラーメンを食べるときは▽はし」の末尾にカーソル（変換キー押下時の状態）
  const line = "ラーメンを食べるときは▽はし";
  const ctx = extractBufferContext([], line, [...line].length + 1, [], "▽");
  assertEquals(ctx.before, "ラーメンを食べるときは");
  assertEquals(ctx.after, "");
});

Deno.test("extractBufferContext - splits current line at cursor", () => {
  // 文中編集: 「これは▽はし|を渡る」（| がカーソル）
  const beforePart = "これは▽はし";
  const line = beforePart + "を渡る";
  const ctx = extractBufferContext(
    ["前の行"],
    line,
    [...beforePart].length + 1,
    ["次の行"],
    "▽",
  );
  assertEquals(ctx.before, "前の行\nこれは");
  assertEquals(ctx.after, "を渡る\n次の行");
});

Deno.test("extractBufferContext - no marker leaves text intact", () => {
  const line = "ただの文章";
  const ctx = extractBufferContext([], line, [...line].length + 1, [], "▽");
  assertEquals(ctx.before, "ただの文章");
  assertEquals(ctx.after, "");
});

Deno.test("extractBufferContext - empty marker does not strip anything", () => {
  const line = "abc";
  const ctx = extractBufferContext([], line, 4, [], "");
  assertEquals(ctx.before, "abc");
});
