import { assertEquals } from "@std/assert";
import {
  appendLearningLog,
  buildContextRank,
  extractContextHints,
  type LearningRecord,
  readLearningLog,
  rerankByContextHints,
} from "./learning.ts";

const sampleRecord: LearningRecord = {
  ts: "2026-05-28T18:53:00+09:00",
  word: "かがく",
  type: "okurinasi",
  selected: "化学",
  candidates: ["科学", "化学", "架空"],
  selectedIndex: 1,
  contextBefore: "有機化合物の",
  contextAfter: "反応において",
  source: "reranked",
};

Deno.test("appendLearningLog and readLearningLog", async () => {
  const tmpFile = await Deno.makeTempFile({ suffix: ".jsonl" });
  try {
    await appendLearningLog(tmpFile, sampleRecord);
    await appendLearningLog(tmpFile, {
      ...sampleRecord,
      selected: "科学",
      selectedIndex: 0,
      contextBefore: "自然科学の",
    });

    const records = await readLearningLog(tmpFile);
    assertEquals(records.length, 2);
    assertEquals(records[0].selected, "化学");
    assertEquals(records[1].selected, "科学");
  } finally {
    await Deno.remove(tmpFile);
  }
});

Deno.test("readLearningLog - nonexistent file returns empty", async () => {
  const records = await readLearningLog("/tmp/nonexistent_log_12345.jsonl");
  assertEquals(records, []);
});

Deno.test("buildContextRank - counts and hints", () => {
  const records: LearningRecord[] = [
    { ...sampleRecord, selected: "化学", contextBefore: "有機化合物の" },
    { ...sampleRecord, selected: "化学", contextBefore: "無機化合物の" },
    { ...sampleRecord, selected: "科学", contextBefore: "自然科学の" },
  ];

  const rank = buildContextRank(records);
  const wordRank = rank.get("かがく")!;

  assertEquals(wordRank.get("化学")!.count, 2);
  assertEquals(wordRank.get("科学")!.count, 1);
  // 化学のヒントに "化合物" 系が含まれる
  assertEquals(wordRank.get("化学")!.contextHints.length > 0, true);
});

Deno.test("extractContextHints - extracts kanji and katakana", () => {
  // 注意: contextBefore + contextAfter を結合して走査するため、
  // 境界で漢字が連続すると1つのマッチになる
  const hints = extractContextHints("有機化合物のポリマーを", "分解する反応において");
  // 2文字以上の漢字連続
  assertEquals(hints.includes("有機化合物"), true);
  assertEquals(hints.includes("分解"), true);
  assertEquals(hints.includes("反応"), true);
  // カタカナ
  assertEquals(hints.includes("ポリマー"), true);
});

Deno.test("extractContextHints - single character excluded", () => {
  const hints = extractContextHints("力を入れる", "");
  // "力" は1文字なので含まれない
  assertEquals(hints.includes("力"), false);
});

Deno.test("rerankByContextHints - boosts matching context", () => {
  const records: LearningRecord[] = [
    {
      ...sampleRecord,
      selected: "化学",
      contextBefore: "有機化合物の",
      contextAfter: "反応",
    },
    {
      ...sampleRecord,
      selected: "化学",
      contextBefore: "有機化合物の",
      contextAfter: "実験",
    },
    {
      ...sampleRecord,
      selected: "科学",
      contextBefore: "自然科学の",
      contextAfter: "発展",
    },
  ];

  const rank = buildContextRank(records);

  // "化合物" がコンテキストに含まれるとき、"化学" がブーストされる
  const result = rerankByContextHints(
    "かがく",
    ["科学", "化学", "架空"],
    rank,
    "有機化合物の反応",
  );

  assertEquals(result[0], "化学"); // count=2 + context match boost
  assertEquals(result[1], "科学");
});

Deno.test("rerankByContextHints - unknown word returns original order", () => {
  const rank = buildContextRank([]);

  const result = rerankByContextHints(
    "みち",
    ["道", "未知", "満ち"],
    rank,
    "帰り道を歩く",
  );

  assertEquals(result, ["道", "未知", "満ち"]);
});
