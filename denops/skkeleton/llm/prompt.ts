import type { LlmGenerateRequest } from "./types.ts";

/**
 * F1: 候補生成プロンプトを構築する（Chat Completion用）
 */
export function buildGeneratePrompt(req: LlmGenerateRequest): string {
  const lines: string[] = [
    "かな漢字変換器として動作してください。",
    "前後の文脈とひらがな文字列から、最も適切な漢字変換候補を出力してください。",
    "",
  ];

  if (req.contextBefore) {
    lines.push("カーソル前の文脈:");
    lines.push(req.contextBefore);
    lines.push("");
  }

  lines.push(`変換対象のひらがな: ${req.word}`);

  if (req.contextAfter) {
    lines.push("");
    lines.push("カーソル後の文脈:");
    lines.push(req.contextAfter);
  }

  lines.push("");
  lines.push(
    "候補を最大5件、1行に1件ずつ、可能性の高い順に出力してください。漢字・かなのテキストのみを出力し、それ以外は何も書かないでください。",
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
