import type { HenkanType } from "../dictionary.ts";

/** F2: Logprobsスコアリングリクエスト */
export type LlmScoreRequest = {
  /** 変換対象のかな列（例: "かがく"） */
  word: string;
  /** "okuriari" | "okurinasi" */
  type: HenkanType;
  /** 辞書から得られた既存候補（元の順序、上位N件） */
  candidates: string[];
  /** カーソル前のテキスト */
  contextBefore: string;
  /** カーソル後のテキスト */
  contextAfter: string;
};

/** F2: スコアリング結果 */
export type ScoredCandidate = {
  /** 変換結果の文字列 */
  value: string;
  /** 候補部分のlogprobs合計（負の値、大きいほど良い） */
  logprobSum: number;
  /** トークン数で正規化したスコア */
  logprobAvg: number;
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
};
