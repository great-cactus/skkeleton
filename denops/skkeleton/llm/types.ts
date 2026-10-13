import type { HenkanType } from "../dictionary.ts";

/** F2: Logprobsスコアリングリクエスト */
export type LlmScoreRequest = {
  /** 変換対象のかな列（例: "かがく"、okuriari は SKK 辞書キー形式 "のぼr"） */
  word: string;
  /** "okuriari" | "okurinasi" */
  type: HenkanType;
  /** 辞書から得られた既存候補（元の順序、上位N件。okuriari は語幹） */
  candidates: string[];
  /** カーソル前のテキスト */
  contextBefore: string;
  /** カーソル後のテキスト */
  contextAfter: string;
  /** 送り仮名込みの純かな読み（例: "のぼる"。okurinasi では word と同じ） */
  kanaReading?: string;
  /** 送り仮名のかな（okuriari の場合。候補の表層形 = 候補 + okuriKana） */
  okuriKana?: string;
  /** 文章全体の話題（llm/topic.ts が裏で要約したもの） */
  topic?: string;
  /**
   * 読み（ひらがな）そのものも比較用に採点する。
   * 読みが辞書のどの候補より文脈に合うなら、辞書の候補はどれも外れている可能性が高い
   */
  readingBaseline?: boolean;
};

/** F2: スコアリング結果 */
export type ScoredCandidate = {
  /** 変換結果の文字列 */
  value: string;
  /** 候補部分のlogprobs合計（負の値、大きいほど良い） */
  logprobSum: number;
  /** トークン数で正規化したスコア */
  logprobAvg: number;
  /** readingBaseline で加えた比較用の読み（候補としては表示しない） */
  isBaseline?: boolean;
};

/** F1: 候補生成リクエスト */
export type LlmGenerateRequest = {
  /** 変換対象のかな列（例: "かがく"） */
  word: string;
  /** "okuriari" | "okurinasi" */
  type: HenkanType;
  /** カーソル前のテキスト */
  contextBefore: string;
  /** カーソル後のテキスト */
  contextAfter: string;
  /** 送り仮名（okuriari の場合） */
  okuriStr?: string;
  /** 送り仮名込みの純かな読み（例: "のぼる"。okurinasi では word と同じ） */
  kanaReading?: string;
  /** 送り仮名のかな（okuriari の場合） */
  okuriKana?: string;
  /** 文章全体の話題（llm/topic.ts が裏で要約したもの） */
  topic?: string;
};
