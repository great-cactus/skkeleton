import { assertEquals } from "jsr:@std/assert@1/equals";
import { henkanStateToString, type HenkanState } from "./state.ts";
import { config } from "./config.ts";

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
    candidates: ["漢字", "感じ"],
    candidateIndex: 0,
    llmCandidateIndices: new Set(),
    ...overrides,
  } as HenkanState;
}

Deno.test("henkanStateToString - normal candidate has no LLM tag", () => {
  const state = makeHenkanState({
    candidates: ["漢字", "感じ"],
    candidateIndex: 0,
    llmCandidateIndices: new Set(),
  });
  const result = henkanStateToString(state);
  assertEquals(result, `${config.markerHenkanSelect}漢字`);
});

Deno.test("henkanStateToString - LLM candidate has [LLM] tag", () => {
  const state = makeHenkanState({
    candidates: ["漢字", "感じ"],
    candidateIndex: 1,
    llmCandidateIndices: new Set([1]),
  });
  const result = henkanStateToString(state);
  assertEquals(result, `${config.markerHenkanSelect}感じ[LLM]`);
});

Deno.test("henkanStateToString - LLM tag with okuri", () => {
  const state = makeHenkanState({
    candidates: ["走"],
    candidateIndex: 0,
    llmCandidateIndices: new Set([0]),
    okuriFeed: "る",
  });
  const result = henkanStateToString(state);
  assertEquals(result, `${config.markerHenkanSelect}走[LLM]る`);
});
