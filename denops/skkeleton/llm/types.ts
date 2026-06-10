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
  /** 送り仮名込みの純かな読み（例: "のぼる"。okurinasi では word と同じ） */
  kanaReading?: string;
  /** 送り仮名のかな（okuriari の場合） */
  okuriKana?: string;
};
