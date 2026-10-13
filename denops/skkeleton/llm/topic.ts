import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";

/**
 * 文章全体の話題（zenz の topic 条件）を裏で要約し、バッファごとに保持する。
 *
 * 要約は OpenAI 互換の chat completions API（ローカル・クラウドどちらでも可）で行う。
 * 変換時にはキャッシュを読むだけで、要約の完了は待たない。
 */

/** 要約に渡す本文の文字数上限（カーソル付近を切り出す） */
export const TOPIC_SOURCE_MAX_CHARS = 2000;

/** 同じバッファで要約をやり直すまでの最短間隔 (ms) */
export const TOPIC_MIN_INTERVAL_MS = 30_000;

/** zenz の条件は末尾 25 文字で切られるため、要約もこの長さに収める */
const TOPIC_MAX_CHARS = 25;

export type TopicSummarizerConfig = {
  endpoint: string;
  /** 空文字なら Authorization ヘッダを付けない */
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

/** 話題を要約させるプロンプト（user メッセージ）を作る */
export function buildTopicPrompt(text: string): string {
  return [
    "次の文章の話題を、10〜20字程度の名詞句で1つだけ答えてください。",
    "文章中の固有名詞や専門用語は、表記を変えずにそのまま使ってください。",
    "話題以外は何も書かないでください。",
    "",
    "文章:",
    text,
  ].join("\n");
}

/** 応答から話題の文字列を取り出す。取り出せなければ空文字 */
export function parseTopicResponse(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0) ?? "";
  return line
    .replace(/^話題\s*[:：]\s*/, "")
    .replace(/^[「『"']+|[」』"'。．]+$/g, "")
    .trim()
    .slice(0, TOPIC_MAX_CHARS);
}

export class TopicSummarizer {
  #endpoint: string;
  #apiKey: string;
  #model: string;
  #timeoutMs: number;

  constructor(config: TopicSummarizerConfig) {
    this.#endpoint = config.endpoint.replace(/\/$/, "");
    this.#apiKey = config.apiKey;
    this.#model = config.model;
    this.#timeoutMs = config.timeoutMs;
  }

  /** 文章の話題を返す。失敗時は空文字 */
  async summarize(text: string): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.#apiKey) {
      headers["Authorization"] = `Bearer ${this.#apiKey}`;
    }
    try {
      const resp = await fetch(`${this.#endpoint}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.#model,
          messages: [{ role: "user", content: buildTopicPrompt(text) }],
          max_tokens: 40,
          temperature: 0,
        }),
        // タイムアウト時に接続自体を中断してリークを防ぐ
        signal: AbortSignal.timeout(this.#timeoutMs),
      });
      if (!resp.ok) {
        await resp.body?.cancel();
        return "";
      }
      const json = await resp.json() as ChatCompletionResponse;
      return parseTopicResponse(json.choices?.[0]?.message?.content ?? "");
    } catch {
      return "";
    }
  }
}

type TopicEntry = {
  topic: string;
  /** 要約したときの b:changedtick */
  tick: number;
  /** 最後に要約を始めた時刻 (ms) */
  startedAt: number;
  pending: boolean;
};

/** バッファ番号ごとの話題のキャッシュ */
export class TopicStore {
  #entries = new Map<number, TopicEntry>();
  #minIntervalMs: number;

  constructor(minIntervalMs = TOPIC_MIN_INTERVAL_MS) {
    this.#minIntervalMs = minIntervalMs;
  }

  /** 保持している話題（未要約なら undefined） */
  get(bufnr: number): string | undefined {
    const topic = this.#entries.get(bufnr)?.topic;
    return topic ? topic : undefined;
  }

  /**
   * 要約をやり直すべきか。
   * バッファが変更されていて、要約中でなく、前回の開始から最短間隔が過ぎていれば真。
   */
  needsUpdate(bufnr: number, tick: number, now: number): boolean {
    const e = this.#entries.get(bufnr);
    if (e == null) return true;
    if (e.pending || e.tick === tick) return false;
    return now - e.startedAt >= this.#minIntervalMs;
  }

  /** 要約を実行して結果を保存する。失敗時は前の話題を残す */
  async refresh(
    bufnr: number,
    tick: number,
    text: string,
    summarizer: TopicSummarizer,
    now: number,
  ): Promise<void> {
    const prev = this.#entries.get(bufnr);
    this.#entries.set(bufnr, {
      topic: prev?.topic ?? "",
      tick: prev?.tick ?? -1,
      startedAt: now,
      pending: true,
    });
    const topic = await summarizer.summarize(text);
    this.#entries.set(bufnr, {
      topic: topic || (prev?.topic ?? ""),
      tick,
      startedAt: now,
      pending: false,
    });
  }

  clear() {
    this.#entries.clear();
  }
}

/**
 * 要約に渡す本文を切り出す。文書が長いときはカーソル付近
 * （カーソル前を 8 割、後を 2 割）を maxChars 文字まで使う。
 * @param text バッファ全体
 * @param cursorOffset カーソル位置（text 中の文字オフセット）
 */
export function sliceAroundCursor(
  text: string,
  cursorOffset: number,
  maxChars = TOPIC_SOURCE_MAX_CHARS,
): string {
  const chars = [...text];
  if (chars.length <= maxChars) return text;
  const beforeLen = Math.floor(maxChars * 0.8);
  let start = Math.max(0, cursorOffset - beforeLen);
  const end = Math.min(chars.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  return chars.slice(start, end).join("");
}

// --- プラグイン全体で共有する状態 ---

export const topicStore = new TopicStore();
let summarizer: TopicSummarizer | null = null;

export function setTopicSummarizer(s: TopicSummarizer | null) {
  summarizer = s;
  topicStore.clear();
}

/**
 * 現在のバッファの話題を返す。キャッシュが古ければ裏で要約をやり直す
 * （その完了は待たないので、更新後の話題は次の変換から使われる）。
 */
export async function currentTopic(
  denops: Denops,
): Promise<string | undefined> {
  if (summarizer == null) return undefined;
  try {
    const [bufnr, tick] = await denops.eval(
      "[bufnr('%'), b:changedtick]",
    ) as [number, number];
    scheduleTopicUpdate(denops, bufnr, tick);
    return topicStore.get(bufnr);
  } catch {
    return undefined;
  }
}

/** InsertLeave などから呼ぶ。必要なら裏で要約を始める */
export async function updateTopic(denops: Denops): Promise<void> {
  if (summarizer == null) return;
  const [bufnr, tick] = await denops.eval(
    "[bufnr('%'), b:changedtick]",
  ) as [number, number];
  scheduleTopicUpdate(denops, bufnr, tick);
}

function scheduleTopicUpdate(denops: Denops, bufnr: number, tick: number) {
  const s = summarizer;
  if (s == null || !topicStore.needsUpdate(bufnr, tick, Date.now())) return;
  // 完了を待たない。失敗しても変換には影響させない
  (async () => {
    const text = await readBufferAroundCursor(denops, bufnr);
    if (text.trim() === "") return;
    await topicStore.refresh(bufnr, tick, text, s, Date.now());
  })().catch(() => {});
}

async function readBufferAroundCursor(
  denops: Denops,
  bufnr: number,
): Promise<string> {
  const lines = await fn.getbufline(denops, bufnr, 1, "$");
  const curLine = await fn.line(denops, ".");
  const cursorOffset = lines
    .slice(0, curLine)
    .reduce((n, l) => n + [...l].length, 0);
  // vim の文章は文の途中で折り返されることが多いので改行は詰める
  return sliceAroundCursor(lines.join(""), cursorOffset);
}
