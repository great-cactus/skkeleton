import { assertEquals } from "@std/assert";
import type { HenkanType } from "../dictionary.ts";
import { assistCandidates, type AssistInput } from "./assist.ts";
import type { LlmProvider } from "./provider.ts";
import type { LlmScoreRequest, ScoredCandidate } from "./types.ts";

/** 表記ごとの点数を返し、生成では決まった文字列を返す偽のプロバイダ */
class FakeProvider implements LlmProvider {
  readonly name = "fake";
  scoreRequests: LlmScoreRequest[] = [];
  generateCount = 0;
  constructor(
    private scores: Record<string, number>,
    private generated: string[] = [],
    private fail = false,
  ) {}
  scoreCandidates(req: LlmScoreRequest): Promise<ScoredCandidate[]> {
    this.scoreRequests.push(req);
    if (this.fail) return Promise.resolve([]);
    const items: ScoredCandidate[] = req.candidates.map((c) => ({
      value: c,
      logprobSum: this.scores[c] ?? -100,
      logprobAvg: 0,
    }));
    if (req.readingBaseline) {
      items.push({
        value: req.kanaReading!,
        logprobSum: this.scores[req.kanaReading!] ?? -100,
        logprobAvg: 0,
        isBaseline: true,
      });
    }
    return Promise.resolve(items.sort((a, b) => b.logprobSum - a.logprobSum));
  }
  generateCandidates(): Promise<string[]> {
    this.generateCount++;
    return Promise.resolve(this.generated);
  }
  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

const DICT: Record<HenkanType, Record<string, string[]>> = {
  okuriari: { "ながi": ["長", "永"] },
  okurinasi: {},
};

function input(
  provider: LlmProvider,
  overrides: Partial<AssistInput>,
): AssistInput {
  return {
    provider,
    lookup: (type, word) => Promise.resolve(DICT[type][word] ?? []),
    type: "okurinasi",
    word: "ながい",
    kanaReading: "ながい",
    okuriKana: "",
    candidates: ["永井", "長井", "長居"],
    getContext: () => Promise.resolve({ before: "この橋は", after: "。" }),
    rerankK: 5,
    fallbackEnabled: true,
    splitEnabled: true,
    ...overrides,
  };
}

Deno.test("assistCandidates - split candidate wins the rerank", async () => {
  const p = new FakeProvider({ "長い": -1, "永井": -8, "ながい": -5 });
  const r = await assistCandidates(input(p, {}));
  assertEquals(r.trace.split, ["長い", "永い"]);
  assertEquals(r.candidates[0], "長い");
  assertEquals(r.trace.readingWon, false);
  assertEquals(p.generateCount, 0);
  // 分割の候補も採点対象に入る
  assertEquals(p.scoreRequests[0].candidates, [
    "永井",
    "長井",
    "長居",
    "長い",
    "永い",
  ]);
});

Deno.test("assistCandidates - reading beats all candidates → generate and put first", async () => {
  const p = new FakeProvider({ "ながい": -1, "永井": -8 }, ["長い"]);
  const r = await assistCandidates(input(p, {}));
  assertEquals(r.trace.readingWon, true);
  assertEquals(r.candidates[0], "長い");
  assertEquals([...r.llmIndices], [0]);
  // 分割で同じ表記が入っていても重複させない
  assertEquals(r.candidates.filter((c) => c === "長い").length, 1);
  // 比較用の読みは候補に出さない
  assertEquals(r.candidates.includes("ながい"), false);
});

Deno.test("assistCandidates - LLM failure keeps dictionary first, split after", async () => {
  const p = new FakeProvider({}, [], true);
  const r = await assistCandidates(input(p, {}));
  assertEquals(r.candidates, ["永井", "長井", "長居", "長い", "永い"]);
});

Deno.test("assistCandidates - no dictionary candidates → F1 generation", async () => {
  const p = new FakeProvider({}, ["蒼焔炉"]);
  const r = await assistCandidates(
    input(p, { candidates: [], word: "そうえんろ", kanaReading: "そうえんろ" }),
  );
  assertEquals(r.candidates, ["蒼焔炉"]);
  assertEquals([...r.llmIndices], [0]);
  assertEquals(p.scoreRequests.length, 0);
  // F1 では読みを分割しない
  assertEquals(r.trace.split, []);
});

Deno.test("assistCandidates - fallback disabled skips generation", async () => {
  const p = new FakeProvider({ "ながい": -1 }, ["長い"]);
  const r = await assistCandidates(input(p, { fallbackEnabled: false }));
  assertEquals(p.generateCount, 0);
  assertEquals(r.llmIndices.size, 0);
});

Deno.test("assistCandidates - split disabled and single candidate → untouched", async () => {
  const p = new FakeProvider({});
  const r = await assistCandidates(
    input(p, { candidates: ["永井"], splitEnabled: false }),
  );
  assertEquals(r.candidates, ["永井"]);
  assertEquals(p.scoreRequests.length, 0);
});

Deno.test("assistCandidates - keeps dictionary candidates beyond K after the scored ones", async () => {
  const p = new FakeProvider({ "b": -1, "a": -2 });
  const r = await assistCandidates(
    input(p, {
      candidates: ["a", "b", "c"],
      rerankK: 2,
      splitEnabled: false,
    }),
  );
  assertEquals(r.candidates, ["b", "a", "c"]);
});
