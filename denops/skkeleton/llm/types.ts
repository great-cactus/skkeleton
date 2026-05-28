import type { HenkanType } from "../dictionary.ts";

/** LLM への変換候補生成リクエスト */
export type LlmHenkanRequest = {
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

/** LLM へのリランキングリクエスト */
export type LlmRerankRequest = {
  word: string;
  type: HenkanType;
  /** 辞書から得られた既存候補（元の順序） */
  candidates: string[];
  contextBefore: string;
  contextAfter: string;
};

/** LLM が返す候補 */
export type LlmCandidate = {
  /** 変換結果の文字列 */
  value: string;
  /** LLM の信頼度スコア（0.0–1.0） */
  score: number;
  /** この候補が LLM 由来であることを示すフラグ */
  isLlmGenerated: boolean;
};
