import { assertEquals } from "@std/assert";
import { extractBufferContext } from "./henkan.ts";

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
