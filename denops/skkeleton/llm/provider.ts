import type { LlmCandidate, LlmHenkanRequest, LlmRerankRequest } from "./types.ts";

/** LLM プロバイダの抽象インターフェース */
export interface LlmProvider {
  /** プロバイダの名前（ログ・設定用） */
  readonly name: string;

  /**
   * 変換候補を生成する。
   * @param request - かな列、変換タイプ、周辺コンテキスト
   * @returns 候補文字列の配列（スコア降順）
   */
  generateCandidates(request: LlmHenkanRequest): Promise<LlmCandidate[]>;

  /**
   * 既存の候補をコンテキストに基づいてリランクする。
   * @param request - 既存候補 + コンテキスト
   * @returns リランク済み候補配列
   */
  rerankCandidates(request: LlmRerankRequest): Promise<LlmCandidate[]>;

  /** ヘルスチェック（起動時・設定変更時に呼ばれる） */
  healthCheck(): Promise<boolean>;
}

/** LLM プロバイダの設定 */
export type LlmProviderConfig = {
  /** プロバイダ種別 */
  type: "local" | "cloud";
  /** API エンドポイント URL */
  endpoint: string;
  /** API キー（クラウド使用時） */
  apiKey: string;
  /** モデル名 */
  model: string;
  /** リクエストタイムアウト (ms) */
  timeoutMs: number;
};
