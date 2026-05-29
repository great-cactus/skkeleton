import type { LlmGenerateRequest } from "./types.ts";

/**
 * F1: 候補生成プロンプトを構築する（Chat Completion用）
 */
export function buildGeneratePrompt(req: LlmGenerateRequest): string {
  const lines: string[] = [
    "You are a Japanese kana-to-kanji converter.",
    "Given the surrounding context and a hiragana string, output the most likely kanji conversion candidates.",
    "",
  ];

  if (req.contextBefore) {
    lines.push("Context before cursor:");
    lines.push(req.contextBefore);
    lines.push("");
  }

  lines.push(`Hiragana to convert: ${req.word}`);

  if (req.contextAfter) {
    lines.push("");
    lines.push("Context after cursor:");
    lines.push(req.contextAfter);
  }

  lines.push("");
  lines.push(
    "Output up to 5 candidates, one per line, most likely first. Output only the kanji/kana text, nothing else.",
  );

  return lines.join("\n");
}

/**
 * LLM レスポンスから候補文字列を抽出する
 */
export function parseGenerateResponse(response: string): string[] {
  return response
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // 番号付きリスト（"1. 科学"）のプレフィックスを除去
    .map((line) => line.replace(/^\d+[\.\)]\s*/, ""))
    .filter((line) => line.length > 0)
    // 最大5件
    .slice(0, 5);
}
