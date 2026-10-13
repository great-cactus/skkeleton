import { assertEquals } from "@std/assert";
import type { HenkanType } from "../dictionary.ts";
import { SPLIT_CANDIDATES_LIMIT, splitCandidates } from "./split.ts";

/** SKK-JISYO.L の該当部分を抜き出した小さな辞書 */
const DICT: Record<HenkanType, Record<string, string[]>> = {
  okuriari: {
    "ながi": ["長", "永"],
    "たかi": ["高"],
    "かi": ["買", "書", "描;絵を描く", "飼"],
    "まt": ["待", "舞"],
  },
  okurinasi: {
    "ながい": ["永井", "長井", "長居"],
    "きょう": ["今日", "京", "強", "狂"],
  },
};
const lookup = (type: HenkanType, word: string) =>
  Promise.resolve(DICT[type][word] ?? []);

Deno.test("splitCandidates - okurigana split (ながい → 長い)", async () => {
  assertEquals(
    await splitCandidates(lookup, "ながい", DICT.okurinasi["ながい"]),
    ["長い", "永い"],
  );
  assertEquals(await splitCandidates(lookup, "たかい", []), ["高い"]);
});

Deno.test("splitCandidates - longer okurigana with annotation stripped", async () => {
  // か + いた → 見出し「かi」。注釈（;絵を描く）は表記から除く
  assertEquals(
    await splitCandidates(lookup, "かいた", []),
    ["買いた", "書いた", "描いた"],
  );
});

Deno.test("splitCandidates - sokuon okurigana (まった → 待った)", async () => {
  assertEquals(await splitCandidates(lookup, "まった", []), [
    "待った",
    "舞った",
  ]);
});

Deno.test("splitCandidates - particle split (きょうか → 今日か)", async () => {
  const result = await splitCandidates(lookup, "きょうか", ["強化", "教化"]);
  assertEquals(result[0], "今日か");
  assertEquals(result.length <= SPLIT_CANDIDATES_LIMIT, true);
});

Deno.test("splitCandidates - skips existing candidates and non-hiragana", async () => {
  assertEquals(await splitCandidates(lookup, "ながい", ["長い"]), ["永い"]);
  assertEquals(await splitCandidates(lookup, "ながい>", []), []);
  assertEquals(await splitCandidates(lookup, "ナガイ", []), []);
});
