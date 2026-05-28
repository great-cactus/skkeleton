import { assertEquals } from "@std/assert";
import {
  buildGeneratePrompt,
  buildRerankPrompt,
  parseGenerateResponse,
  parseRerankResponse,
} from "./prompt.ts";

Deno.test("buildGeneratePrompt - with full context", () => {
  const prompt = buildGeneratePrompt({
    word: "かがく",
    type: "okurinasi",
    contextBefore: "有機化合物の",
    contextAfter: "反応において",
  });

  // プロンプトに必須要素が含まれていること
  assertEquals(prompt.includes("かがく"), true);
  assertEquals(prompt.includes("有機化合物の"), true);
  assertEquals(prompt.includes("反応において"), true);
  assertEquals(prompt.includes("5 candidates"), true);
});

Deno.test("buildGeneratePrompt - without context", () => {
  const prompt = buildGeneratePrompt({
    word: "てすと",
    type: "okurinasi",
    contextBefore: "",
    contextAfter: "",
  });

  assertEquals(prompt.includes("てすと"), true);
  // コンテキストのセクションヘッダが出ないこと
  assertEquals(prompt.includes("Context before"), false);
  assertEquals(prompt.includes("Context after"), false);
});

Deno.test("buildRerankPrompt - includes all candidates", () => {
  const prompt = buildRerankPrompt({
    word: "かがく",
    type: "okurinasi",
    candidates: ["科学", "化学", "架空"],
    contextBefore: "有機化合物の",
    contextAfter: "反応において",
  });

  assertEquals(prompt.includes("1. 科学"), true);
  assertEquals(prompt.includes("2. 化学"), true);
  assertEquals(prompt.includes("3. 架空"), true);
  assertEquals(prompt.includes("有機化合物の"), true);
});

Deno.test("parseGenerateResponse - plain list", () => {
  const candidates = parseGenerateResponse("科学\n化学\n架空\n加工\n歌学");
  assertEquals(candidates, ["科学", "化学", "架空", "加工", "歌学"]);
});

Deno.test("parseGenerateResponse - numbered list", () => {
  const candidates = parseGenerateResponse(
    "1. 科学\n2. 化学\n3. 架空",
  );
  assertEquals(candidates, ["科学", "化学", "架空"]);
});

Deno.test("parseGenerateResponse - numbered list with parenthesis", () => {
  const candidates = parseGenerateResponse(
    "1) 科学\n2) 化学\n3) 架空",
  );
  assertEquals(candidates, ["科学", "化学", "架空"]);
});

Deno.test("parseGenerateResponse - with blank lines", () => {
  const candidates = parseGenerateResponse(
    "\n科学\n\n化学\n\n",
  );
  assertEquals(candidates, ["科学", "化学"]);
});

Deno.test("parseGenerateResponse - truncates to 5", () => {
  const candidates = parseGenerateResponse(
    "a\nb\nc\nd\ne\nf\ng",
  );
  assertEquals(candidates.length, 5);
});

Deno.test("parseRerankResponse - normal reorder", () => {
  const result = parseRerankResponse(
    "2,1,3",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["化学", "科学", "架空"]);
});

Deno.test("parseRerankResponse - space separated", () => {
  const result = parseRerankResponse(
    "3 1 2",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["架空", "科学", "化学"]);
});

Deno.test("parseRerankResponse - partial response appends missing", () => {
  const result = parseRerankResponse(
    "2",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["化学", "科学", "架空"]);
});

Deno.test("parseRerankResponse - invalid indices ignored", () => {
  const result = parseRerankResponse(
    "2,99,1",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["化学", "科学", "架空"]);
});

Deno.test("parseRerankResponse - duplicate indices deduplicated", () => {
  const result = parseRerankResponse(
    "2,2,1,3",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["化学", "科学", "架空"]);
});

Deno.test("parseRerankResponse - garbage input returns original order", () => {
  const result = parseRerankResponse(
    "これは無効な出力です",
    ["科学", "化学", "架空"],
  );
  assertEquals(result, ["科学", "化学", "架空"]);
});
