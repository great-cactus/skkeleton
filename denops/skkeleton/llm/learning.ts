import type { HenkanType } from "../dictionary.ts";

/** 学習ログの1レコード */
export type LearningRecord = {
  ts: string;
  word: string;
  type: HenkanType;
  selected: string;
  candidates: string[];
  selectedIndex: number;
  contextBefore: string;
  contextAfter: string;
  source: "dictionary" | "llm" | "reranked";
};

/** コンテキスト付きランクデータ */
export type ContextRankEntry = {
  count: number;
  contextHints: string[];
};

/** word → candidate → ContextRankEntry */
export type ContextRankMap = Map<string, Map<string, ContextRankEntry>>;

/**
 * 学習ログに追記する
 */
export async function appendLearningLog(
  path: string,
  record: LearningRecord,
): Promise<void> {
  const line = JSON.stringify(record) + "\n";
  await Deno.writeTextFile(path, line, { append: true });
}

/**
 * 学習ログを読み込む
 */
export async function readLearningLog(
  path: string,
): Promise<LearningRecord[]> {
  try {
    const content = await Deno.readTextFile(path);
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as LearningRecord);
  } catch {
    return [];
  }
}

/**
 * 学習ログからコンテキスト付きランクを構築する
 */
export function buildContextRank(records: LearningRecord[]): ContextRankMap {
  const rank: ContextRankMap = new Map();

  for (const record of records) {
    if (!rank.has(record.word)) {
      rank.set(record.word, new Map());
    }
    const wordRank = rank.get(record.word)!;

    const existing = wordRank.get(record.selected);
    if (existing) {
      existing.count++;
      // コンテキストからキーワードを抽出して追加
      const hints = extractContextHints(record.contextBefore, record.contextAfter);
      for (const hint of hints) {
        if (!existing.contextHints.includes(hint)) {
          existing.contextHints.push(hint);
        }
      }
    } else {
      wordRank.set(record.selected, {
        count: 1,
        contextHints: extractContextHints(record.contextBefore, record.contextAfter),
      });
    }
  }

  return rank;
}

/**
 * コンテキストヒントによる軽量リランキング（LLM なし）
 */
export function rerankByContextHints(
  word: string,
  candidates: string[],
  contextRank: ContextRankMap,
  currentContext: string,
): string[] {
  const wordRank = contextRank.get(word);
  if (!wordRank) return candidates;

  type ScoredCandidate = { value: string; score: number };

  const scored: ScoredCandidate[] = candidates.map((c) => {
    const entry = wordRank.get(c);
    if (!entry) return { value: c, score: 0 };

    // ベーススコア: 選択回数
    let score = entry.count;

    // コンテキストヒントとの一致でブースト
    for (const hint of entry.contextHints) {
      if (currentContext.includes(hint)) {
        score += 2;
      }
    }

    return { value: c, score };
  });

  // スコア降順でソート（同スコアは元の順序を維持）
  scored.sort((a, b) => b.score - a.score);

  return scored.map((s) => s.value);
}

/**
 * コンテキスト文字列からキーワードを抽出する
 * 日本語テキストから意味のある2文字以上の連続を抽出
 */
export function extractContextHints(
  contextBefore: string,
  contextAfter: string,
): string[] {
  const text = contextBefore + contextAfter;
  // 漢字の連続、カタカナの連続を抽出
  const kanjiPattern = /[\u4e00-\u9fff]{2,}/g;
  const katakanaPattern = /[\u30a0-\u30ff]{2,}/g;

  const hints: string[] = [];

  for (const match of text.matchAll(kanjiPattern)) {
    if (!hints.includes(match[0])) {
      hints.push(match[0]);
    }
  }
  for (const match of text.matchAll(katakanaPattern)) {
    if (!hints.includes(match[0])) {
      hints.push(match[0]);
    }
  }

  return hints;
}
