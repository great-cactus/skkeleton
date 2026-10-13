import { modifyCandidate } from "../candidate.ts";
import { config } from "../config.ts";
import type { Context } from "../context.ts";
import { handleKey } from "../keymap.ts";
import { keyToNotation } from "../notation.ts";
import { assistCandidates } from "../llm/assist.ts";
import { currentTopic } from "../llm/topic.ts";
import { getOkuriStr } from "../okuri.ts";
import { HenkanState } from "../state.ts";
import { currentLibrary, currentLlmProvider } from "../store.ts";
import { kakutei } from "./common.ts";
import { registerWord } from "./dictionary.ts";
import { acceptResult, henkanPoint, kakuteiFeed, kanaInput } from "./input.ts";

import { Mutex } from "@core/asyncutil/mutex";
import type { Denops } from "@denops/std";
import * as fn from "@denops/std/function";

const mutex = new Mutex();

export async function henkanFirst(context: Context, key: string) {
  if (context.state.type !== "input") {
    return;
  }

  kakuteiFeed(context);

  if (context.state.mode === "direct") {
    // Note: ユーザーがkey単体にhenkanFirst振ってると無限ループ起こすので
    //       繰り返し呼ばれた場合は直接入力にフォールバックする
    if (mutex.locked) {
      context.kakutei(key);
    } else {
      using _lock = await mutex.acquire();
      await kanaInput(context, key);
    }
    return;
  }

  if (context.state.henkanFeed === "") {
    return;
  }

  const state = context.state as unknown as HenkanState;
  state.type = "henkan";
  state.candidates = [];
  state.candidateIndex = -1;
  state.llmCandidateIndices = new Set();

  const lib = await currentLibrary.get();
  const word = state.mode === "okurinasi"
    ? state.henkanFeed
    : getOkuriStr(state.henkanFeed, state.okuriFeed);
  state.word = word;
  if (
    state.affix == null &&
    !state.directInput &&
    ["okurinasi", "okuriari"].includes(state.mode)
  ) {
    // When user maunally uses henkanPoint,
    // henkanFeed like `>prefix` and `suffix>` may
    // reach here with undefined affix
    state.affix = state.henkanFeed.match(">$")
      ? "prefix"
      : state.henkanFeed.match("^>")
      ? "suffix"
      : undefined;
  }
  state.candidates = await lib.getHenkanResult(state.mode, word);

  // LLM 補助: 読みの分割・並べ替え・生成（同期・ブロッキング）。
  // 各段のタイムアウト内に終われば、その結果で候補を表示する
  if (config.llmEnabled && currentLlmProvider != null) {
    try {
      const denops = context.denops;
      const topic = denops ? await currentTopic(denops) : undefined;
      const result = await assistCandidates({
        provider: currentLlmProvider,
        lookup: (type, w) => lib.getHenkanResult(type, w),
        type: state.mode,
        word,
        kanaReading: state.mode === "okuriari"
          ? state.henkanFeed + state.okuriFeed
          : state.henkanFeed,
        okuriKana: state.mode === "okuriari" ? state.okuriFeed : "",
        candidates: state.candidates,
        getContext: () =>
          denops
            ? fetchBufferContext(denops, config.llmContextLines)
            : Promise.resolve({ before: "", after: "" }),
        topic,
        rerankK: config.llmRerankMaxCandidates,
        fallbackEnabled: config.llmFallbackEnabled,
        // 接頭辞・接尾辞・直接入力では読みを分割しない
        splitEnabled: state.affix == null && !state.directInput,
      });
      state.candidates = result.candidates;
      state.llmCandidateIndices = result.llmIndices;
    } catch {
      // LLM エラー時は辞書の候補のまま
    }
  }

  await henkanForward(context);
}

/**
 * バッファからカーソル前後のコンテキストを取得する。
 * 現在行はカーソル位置で before/after に分割し、変換中のプレエディット
 * （markerHenkan 以降の「▽はし」など）は before から取り除く。
 */
async function fetchBufferContext(
  denops: Denops,
  lines: number,
): Promise<{ before: string; after: string }> {
  try {
    const curLine = await fn.line(denops, ".") as number;
    const lastLine = await fn.line(denops, "$") as number;
    // 文字単位のカーソル位置（マルチバイト安全）
    const cursorCol = await denops.call("charcol", ".") as number;
    const startBefore = Math.max(1, curLine - lines);
    const endAfter = Math.min(lastLine, curLine + lines);

    const currentLine = await fn.getline(denops, ".") as string;
    const beforeLines = curLine > startBefore
      ? await fn.getline(denops, startBefore, curLine - 1) as string[]
      : [];
    const afterLines = curLine < lastLine
      ? await fn.getline(denops, curLine + 1, endAfter) as string[]
      : [];

    return extractBufferContext(
      beforeLines,
      currentLine,
      cursorCol,
      afterLines,
      config.markerHenkan,
    );
  } catch {
    return { before: "", after: "" };
  }
}

/**
 * カーソル前後の文脈を組み立てる（fetchBufferContext の純粋部分）。
 * @param beforeLines 現在行より前の行
 * @param currentLine 現在行のテキスト
 * @param cursorCol 文字単位のカーソル位置（1-based、挿入点）
 * @param afterLines 現在行より後の行
 * @param henkanMarker 変換マーカー（config.markerHenkan）。カーソル前の
 *   テキスト末尾にあるマーカー以降（変換中のプレエディット）を取り除く
 */
export function extractBufferContext(
  beforeLines: string[],
  currentLine: string,
  cursorCol: number,
  afterLines: string[],
  henkanMarker: string,
): { before: string; after: string } {
  const chars = [...currentLine];
  let beforeCursor = chars.slice(0, Math.max(0, cursorCol - 1)).join("");
  const afterCursor = chars.slice(Math.max(0, cursorCol - 1)).join("");
  if (henkanMarker.length > 0) {
    const idx = beforeCursor.lastIndexOf(henkanMarker);
    if (idx >= 0) {
      beforeCursor = beforeCursor.slice(0, idx);
    }
  }
  return {
    before: [...beforeLines, beforeCursor].join("\n"),
    after: [afterCursor, ...afterLines].join("\n"),
  };
}

export async function henkanForward(context: Context) {
  const state = context.state;
  if (state.type !== "henkan") {
    return;
  }
  const oldCandidateIndex = state.candidateIndex;
  if (state.candidateIndex >= config.showCandidatesCount) {
    state.candidateIndex += 7;
  } else {
    state.candidateIndex++;
  }
  if (state.candidates.length <= state.candidateIndex) {
    if (await registerWord(context)) {
      return;
    }
    state.candidateIndex = oldCandidateIndex;
    if (state.candidateIndex === -1) {
      context.state.type = "input";
    }
  }
  if (state.candidateIndex >= config.showCandidatesCount) {
    await showCandidates(context.denops!, state);
  }
}

export async function henkanBackward(context: Context) {
  const state = context.state;
  if (state.type !== "henkan") {
    return;
  }
  if (state.candidateIndex >= config.showCandidatesCount) {
    state.candidateIndex = Math.max(
      state.candidateIndex - 7,
      config.showCandidatesCount - 1,
    );
  } else {
    state.candidateIndex--;
  }
  if (state.candidateIndex < 0) {
    context.state.type = "input";
    return;
  }
  if (state.candidateIndex >= config.showCandidatesCount) {
    await showCandidates(context.denops!, state);
  }
}

async function showCandidates(denops: Denops, state: HenkanState) {
  const idx = state.candidateIndex;
  const candidates = state.candidates.slice(idx, idx + 7);
  const list = candidates.map((c, i) => {
    const modified = modifyCandidate(c, state.affix);
    const llmTag = state.llmCandidateIndices.has(idx + i) ? " [LLM]" : "";
    return `${config.selectCandidateKeys[i]}: ${modified}${llmTag}`;
  });
  await denops.call("skkeleton#popup#open", list);
}

export async function henkanInput(context: Context, key: string) {
  const state = context.state as HenkanState;
  if (state.candidateIndex >= config.showCandidatesCount) {
    const candIdx = config.selectCandidateKeys.indexOf(key);
    if (candIdx !== -1) {
      if (state.candidateIndex + candIdx < state.candidates.length) {
        state.candidateIndex += candIdx;
        await kakutei(context);
      }
      return;
    }
  }

  await kakutei(context);
  await handleKey(context, keyToNotation[key] ?? key);
}

export async function suffix(context: Context) {
  if (context.state.type !== "henkan") {
    return;
  }

  await kakutei(context);
  henkanPoint(context);
  await acceptResult(context, [">", ""], "");
  context.state.affix = "suffix";
}
