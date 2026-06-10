import { assertEquals } from "@std/assert";
import { buildGeneratePrompt, parseGenerateResponse } from "./prompt.ts";

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
  assertEquals(prompt.includes("最大5件"), true);
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
  assertEquals(prompt.includes("カーソル前の文脈"), false);
  assertEquals(prompt.includes("カーソル後の文脈"), false);
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
