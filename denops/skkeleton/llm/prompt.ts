import type { LlmHenkanRequest, LlmRerankRequest } from "./types.ts";

/**
 * F1: 候補生成プロンプトを構築する
 */
export function buildGeneratePrompt(req: LlmHenkanRequest): string {
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
 * F2: リランキングプロンプトを構築する（logprobs 非対応モデル向けフォールバック）
 */
export function buildRerankPrompt(req: LlmRerankRequest): string {
  const candidateList = req.candidates
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return [
    `以下の文脈で「${req.word}」の変換として最も適切な順序に並べ替えてください。`,
    "番号をカンマ区切りで出力してください（例: 2,1,3）。番号のみを出力し、説明は不要です。",
    "",
    `文脈: ${req.contextBefore}＿＿＿${req.contextAfter}`,
    "",
    "候補:",
    candidateList,
  ].join("\n");
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

/**
 * リランキングレスポンスから順序を抽出し、候補を並べ替える
 */
export function parseRerankResponse(
  response: string,
  originalCandidates: string[],
): string[] {
  const indices = response
    .trim()
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10) - 1) // 1-indexed → 0-indexed
    .filter((i) => !isNaN(i) && i >= 0 && i < originalCandidates.length);

  // 重複排除
  const seen = new Set<number>();
  const ordered: string[] = [];
  for (const idx of indices) {
    if (!seen.has(idx)) {
      seen.add(idx);
      ordered.push(originalCandidates[idx]);
    }
  }

  // レスポンスに含まれなかった候補を末尾に追加
  for (let i = 0; i < originalCandidates.length; i++) {
    if (!seen.has(i)) {
      ordered.push(originalCandidates[i]);
    }
  }

  return ordered;
}
