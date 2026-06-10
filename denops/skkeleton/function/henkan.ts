import { modifyCandidate } from "../candidate.ts";
import { config } from "../config.ts";
import type { Context } from "../context.ts";
import { handleKey } from "../keymap.ts";
import { keyToNotation } from "../notation.ts";
import type { LlmProvider } from "../llm/provider.ts";
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

  // F2: LLM リランキング — 辞書候補が2件以上あるとき（同期・ブロッキング）
  // タイムアウト内にスコアリングが完了すれば並べ替えた状態で候補を表示する
  if (shouldLlmRerank(state.candidates.length, currentLlmProvider)) {
    try {
      const ctx = context.denops
        ? await fetchBufferContext(context.denops, config.llmContextLines)
        : { before: "", after: "" };
      const maxCandidates = config.llmRerankMaxCandidates;
      const toScore = state.candidates.slice(0, maxCandidates);
      const scored = await currentLlmProvider!.scoreCandidates({
        word,
        type: state.mode,
        candidates: toScore,
        contextBefore: ctx.before,
        contextAfter: ctx.after,
        kanaReading: state.mode === "okuriari"
          ? state.henkanFeed + state.okuriFeed
          : state.henkanFeed,
        okuriKana: state.mode === "okuriari" ? state.okuriFeed : "",
      });
      if (scored.length > 0) {
        const reranked = scored.map((s) => s.value);
        const remaining = state.candidates.slice(maxCandidates);
        state.candidates = [...reranked, ...remaining];
      }
    } catch {
      // スコアリング失敗時は辞書順のまま
    }
  }

  // F1: LLM フォールバック — 辞書に候補がないとき
  if (shouldLlmFallback(state.candidates.length, currentLlmProvider)) {
    try {
      const ctx = context.denops
        ? await fetchBufferContext(context.denops, config.llmContextLines)
        : { before: "", after: "" };
      const llmCandidates = await currentLlmProvider!.generateCandidates({
        word,
        type: state.mode,
        contextBefore: ctx.before,
        contextAfter: ctx.after,
        kanaReading: state.mode === "okuriari"
          ? state.henkanFeed + state.okuriFeed
          : state.henkanFeed,
        okuriKana: state.mode === "okuriari" ? state.okuriFeed : "",
      });
      applyLlmFallbackCandidates(state, llmCandidates);
    } catch {
      // LLM エラー時は無視して従来通り
    }
  }

  await henkanForward(context);
}

/**
 * バッファからカーソル前後のコンテキストを取得する
 */
async function fetchBufferContext(
  denops: Denops,
  lines: number,
): Promise<{ before: string; after: string }> {
  try {
    const curLine = await fn.line(denops, ".") as number;
    const lastLine = await fn.line(denops, "$") as number;
    const startBefore = Math.max(1, curLine - lines);
    const endAfter = Math.min(lastLine, curLine + lines);

    const beforeLines = await fn.getline(denops, startBefore, curLine) as string[];
    const afterLines = curLine < lastLine
      ? await fn.getline(denops, curLine + 1, endAfter) as string[]
      : [];

    return {
      before: beforeLines.join("\n"),
      after: afterLines.join("\n"),
    };
  } catch {
    return { before: "", after: "" };
  }
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

// --- テスト可能なヘルパー関数 ---

/**
 * F1 フォールバックの発動条件を判定する
 */
export function shouldLlmFallback(
  candidateCount: number,
  provider: LlmProvider | null,
): boolean {
  return (
    candidateCount === 0 &&
    config.llmEnabled &&
    config.llmFallbackEnabled &&
    provider != null
  );
}

/**
 * F2 リランキングの発動条件を判定する
 */
export function shouldLlmRerank(
  candidateCount: number,
  provider: LlmProvider | null,
): boolean {
  return (
    candidateCount >= 2 &&
    config.llmEnabled &&
    provider != null
  );
}

/**
 * F1 フォールバック結果を state に反映する
 */
export function applyLlmFallbackCandidates(
  state: HenkanState,
  llmCandidates: string[],
): void {
  const baseIndex = state.candidates.length;
  for (let i = 0; i < llmCandidates.length; i++) {
    state.candidates.push(llmCandidates[i]);
    state.llmCandidateIndices.add(baseIndex + i);
  }
}
