import type { HenkanType } from "../dictionary.ts";
import type { LlmProvider } from "./provider.ts";
import { type Lookup, splitCandidates } from "./split.ts";

/**
 * 辞書の候補に LLM の補助をかけて、最終的な候補の並びを決める。
 * henkanFirst と評価テスト（llm/eval）の両方から使う。
 *
 * 1. 分割（主）: 送りなし変換で辞書に候補があるとき、読みの末尾を送り仮名・助詞として
 *    切り分けて辞書を引き直し、候補を補う（llm/split.ts）
 * 2. F2 並べ替え: 候補が 2 件以上なら、先頭 K 件と分割から得た候補を LLM で採点する
 * 3. 読みとの比較（予備）: 読みそのものが辞書のどの候補より高く採点されたら、
 *    候補はどれも外れているとみなして LLM に生成させ、その候補を先頭に置く
 * 4. F1 生成: 辞書の候補が 0 件なら、LLM に生成させた候補を加える
 */

export type AssistInput = {
  provider: LlmProvider;
  /** 辞書を引く関数（分割に使う） */
  lookup: Lookup;
  type: HenkanType;
  /** 辞書の見出し（okuriari は "のぼr" 形式） */
  word: string;
  /** 送り仮名込みの純かな読み */
  kanaReading: string;
  /** 送り仮名（okuriari のとき） */
  okuriKana: string;
  /** 辞書が返した候補 */
  candidates: string[];
  /** 文脈。必要になったときだけ呼ぶ */
  getContext: () => Promise<{ before: string; after: string }>;
  topic?: string;
  /** 並べ替える辞書候補の数 */
  rerankK: number;
  /** F1 生成（予備の生成を含む）を使うか */
  fallbackEnabled: boolean;
  /** 読みの分割を使うか（接頭辞・接尾辞の入力などでは使わない） */
  splitEnabled: boolean;
};

export type AssistTrace = {
  /** 分割から加えた候補 */
  split: string[];
  /** 並べ替えを行ったか（LLM が結果を返したか） */
  reranked: boolean;
  /** 読みが辞書のどの候補より高く採点されたか */
  readingWon: boolean;
  /** LLM が生成した候補 */
  generated: string[];
};

export type AssistResult = {
  candidates: string[];
  /** LLM が生成した候補のインデックス */
  llmIndices: Set<number>;
  trace: AssistTrace;
};

export async function assistCandidates(
  input: AssistInput,
): Promise<AssistResult> {
  const dict = input.candidates;
  const trace: AssistTrace = {
    split: [],
    reranked: false,
    readingWon: false,
    generated: [],
  };

  if (input.splitEnabled && input.type === "okurinasi" && dict.length > 0) {
    try {
      trace.split = await splitCandidates(
        input.lookup,
        input.kanaReading,
        dict,
      );
    } catch {
      // 分割の失敗は無視して辞書の候補だけで続ける
    }
  }

  // F1: 辞書に候補が無い
  if (dict.length === 0) {
    if (!input.fallbackEnabled) {
      return { candidates: [], llmIndices: new Set(), trace };
    }
    const generated = await generate(input);
    trace.generated = generated;
    return {
      candidates: generated,
      llmIndices: new Set(generated.map((_, i) => i)),
      trace,
    };
  }

  const k = input.rerankK;
  const toScore = [...dict.slice(0, k), ...trace.split];
  // LLM が失敗したときは辞書の候補を先、分割の候補を後ろに置く
  let order = [...dict, ...trace.split];
  if (toScore.length < 2) {
    return { candidates: order, llmIndices: new Set(), trace };
  }

  const ctx = await input.getContext();
  const scored = await input.provider.scoreCandidates({
    word: input.word,
    type: input.type,
    candidates: toScore,
    contextBefore: ctx.before,
    contextAfter: ctx.after,
    kanaReading: input.kanaReading,
    okuriKana: input.okuriKana,
    topic: input.topic,
    readingBaseline: true,
  });
  if (scored.length === 0) {
    return { candidates: order, llmIndices: new Set(), trace };
  }
  trace.reranked = true;
  trace.readingWon = scored[0].isBaseline === true;
  order = [
    ...scored.filter((s) => !s.isBaseline).map((s) => s.value),
    ...dict.slice(k),
  ];

  // 予備: 読みのほうが文脈に合う → 候補はどれも外れているとみなして生成する
  if (trace.readingWon && input.fallbackEnabled) {
    const generated = await generate(input, ctx);
    trace.generated = generated;
    if (generated.length > 0) {
      const g = generated[0];
      const rest = order.filter((c) => c.replace(/;.*$/, "") !== g);
      return { candidates: [g, ...rest], llmIndices: new Set([0]), trace };
    }
  }
  return { candidates: order, llmIndices: new Set(), trace };
}

async function generate(
  input: AssistInput,
  ctx?: { before: string; after: string },
): Promise<string[]> {
  const c = ctx ?? await input.getContext();
  try {
    return await input.provider.generateCandidates({
      word: input.word,
      type: input.type,
      contextBefore: c.before,
      contextAfter: c.after,
      kanaReading: input.kanaReading,
      okuriKana: input.okuriKana,
      topic: input.topic,
    });
  } catch {
    return [];
  }
}
