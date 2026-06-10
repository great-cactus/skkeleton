import type { LlmGenerateRequest, LlmScoreRequest, ScoredCandidate } from "./types.ts";

/** LLM プロバイダの抽象インターフェース */
export interface LlmProvider {
  /** プロバイダの名前（ログ・設定用） */
  readonly name: string;

  /**
   * F2: 各候補のlogprobsスコアを算出し、リランクされた候補配列を返す。
   * バッチリクエストで全候補を並列評価する。
   * @param request - 候補一覧 + コンテキスト
   * @returns スコア降順にソートされた候補配列
   */
  scoreCandidates(request: LlmScoreRequest): Promise<ScoredCandidate[]>;

  /**
   * F1: 辞書に候補がない場合、LLMにかな→漢字変換候補を生成させる。
   * Chat Completion方式で候補を生成する。
   * @param request - かな列 + コンテキスト
   * @returns 候補文字列の配列（尤度降順）
   */
  generateCandidates(request: LlmGenerateRequest): Promise<string[]>;

  /** ヘルスチェック（起動時・設定変更時に呼ばれる） */
  healthCheck(): Promise<boolean>;
}

/** LLM プロバイダの設定 */
export type LlmProviderConfig = {
  /** プロバイダ種別 */
  type: "local" | "cloud" | "zenz";
  /** API エンドポイント URL */
  endpoint: string;
  /** API キー（クラウド使用時） */
  apiKey: string;
  /** モデル名 */
  model: string;
  /** F2リランキングのタイムアウト (ms) */
  timeoutMs: number;
  /** F1フォールバックのタイムアウト (ms) */
  fallbackTimeoutMs: number;
};
