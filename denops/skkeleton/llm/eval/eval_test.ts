/**
 * 実際の zenz サーバを使った LLM 補助の評価テスト。
 *
 * ※ ローカルで動かした zenz サーバに対して実行する前提のテスト。
 *   まだ実際の zenz では実行していない。手順と方針は README.md を参照。
 *
 * 環境変数 SKKELETON_ZENZ_ENDPOINT が無いときは実行しない（通常の deno task test では無視される）。
 *
 * 任意の環境変数:
 * - SKKELETON_TOPIC_ENDPOINT / SKKELETON_TOPIC_MODEL / SKKELETON_TOPIC_API_KEY:
 *     topic を省略したケースで、話題をこの要約器（chat completions API）で作る
 * - SKKELETON_EVAL_RERANK_K:
 *     並べ替える件数（既定は llmRerankMaxCandidates の既定値）。件数ごとの速さを比べるのに使う
 * - SKKELETON_EVAL_JISYO / SKKELETON_EVAL_JISYO_ENCODING (既定 euc-jp):
 *     F2 の candidates をこの SKK 辞書から読み直し、F1 の読みが辞書に無いことを確かめる
 *
 * 品質を見るためのテストなので、タイムアウトは実運用（100 ms / 500 ms）より長くとり、
 * かかった時間は表に出す。
 */
import { assert, assertEquals } from "@std/assert";
import { ZenzLlmProvider } from "../providers/zenz.ts";
import { assistCandidates, type AssistResult } from "../assist.ts";
import type { HenkanType } from "../../dictionary.ts";
import { TopicSummarizer } from "../topic.ts";
import { Dictionary as SkkDictionary } from "../../sources/skk_dictionary.ts";
import { getOkuriStr } from "../../okuri.ts";
import { config } from "../../config.ts";
import {
  type F1Case,
  f1Cases,
  type F2Group,
  f2Groups,
  type F2Item,
} from "./cases.ts";

const endpoint = Deno.env.get("SKKELETON_ZENZ_ENDPOINT") ?? "";
const topicEndpoint = Deno.env.get("SKKELETON_TOPIC_ENDPOINT") ?? "";
const jisyoPath = Deno.env.get("SKKELETON_EVAL_JISYO") ?? "";
const EVAL_TIMEOUT_MS = 10_000;

const rerankK = Deno.env.get("SKKELETON_EVAL_RERANK_K");
if (rerankK) {
  config.llmRerankMaxCandidates = Number(rerankK);
}

const provider = new ZenzLlmProvider({
  type: "zenz",
  endpoint: endpoint || "http://127.0.0.1:1",
  apiKey: "",
  model: "",
  timeoutMs: EVAL_TIMEOUT_MS,
  fallbackTimeoutMs: EVAL_TIMEOUT_MS,
});

const summarizer = topicEndpoint
  ? new TopicSummarizer({
    endpoint: topicEndpoint,
    apiKey: Deno.env.get("SKKELETON_TOPIC_API_KEY") ?? "",
    model: Deno.env.get("SKKELETON_TOPIC_MODEL") ?? "",
    timeoutMs: EVAL_TIMEOUT_MS,
  })
  : null;

/** SKK 辞書の注釈（; 以降）を除いた表記 */
const stripAnnotation = (c: string) => c.replace(/;.*$/, "");

/** ケースの話題。手で与えたものを優先し、無ければ要約器で作る */
async function resolveTopic(
  c: { before: string; after?: string; topic?: string },
): Promise<string | undefined> {
  if (c.topic) return c.topic;
  if (summarizer == null) return undefined;
  const topic = await summarizer.summarize(
    (c.before + (c.after ?? "")).replace(/\n/g, ""),
  );
  return topic || undefined;
}

async function timed<T>(f: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const v = await f();
  return [v, Math.round(performance.now() - t0)];
}

let dictionary: SkkDictionary | null = null;
/** SKKELETON_EVAL_JISYO の辞書を引く。辞書が無ければ null */
async function jisyoLookup(
  type: HenkanType,
  word: string,
): Promise<string[] | null> {
  if (!jisyoPath) return null;
  if (dictionary == null) {
    dictionary = new SkkDictionary();
    await dictionary.load(
      jisyoPath,
      Deno.env.get("SKKELETON_EVAL_JISYO_ENCODING") ?? "euc-jp",
    );
  }
  return await dictionary.getHenkanResult(type, word);
}

const dictKey = (reading: string, okuri: string | undefined) =>
  okuri ? getOkuriStr(reading, okuri) : reading;

/** 辞書が無いときは、ケースに書いた候補だけを引ける辞書として使う */
const caseDictionary = new Map(
  f2Groups.map((g) => [
    `${g.okuri ? "okuriari" : "okurinasi"}:${dictKey(g.reading, g.okuri)}`,
    g.candidates,
  ]),
);
async function lookup(type: HenkanType, word: string): Promise<string[]> {
  return await jisyoLookup(type, word) ??
    caseDictionary.get(`${type}:${word}`) ?? [];
}

type AssistRun = { top: string; result: AssistResult; ms: number };

/** henkanFirst と同じ assistCandidates を通して候補の並びを決める */
async function runAssist(
  g: F2Group,
  candidates: string[],
  before: string,
  after: string,
  topic: string | undefined,
): Promise<AssistRun> {
  const okuri = g.okuri ?? "";
  const [result, ms] = await timed(() =>
    assistCandidates({
      provider,
      lookup,
      type: g.okuri ? "okuriari" : "okurinasi",
      word: dictKey(g.reading, g.okuri),
      kanaReading: g.reading + okuri,
      okuriKana: okuri,
      candidates,
      getContext: () => Promise.resolve({ before, after }),
      topic,
      rerankK: config.llmRerankMaxCandidates,
      fallbackEnabled: true,
      splitEnabled: true,
    })
  );
  if (
    !result.trace.reranked && candidates.length + result.trace.split.length >= 2
  ) {
    throw new Error("scoreCandidates returned no result (server error?)");
  }
  return { top: stripAnnotation(result.candidates[0] ?? ""), result, ms };
}

/** 分割・予備の生成が働いたかを短く表す */
function route(r: AssistResult): string {
  const parts: string[] = [];
  if (r.trace.split.length > 0) parts.push(`分割+${r.trace.split.length}`);
  if (r.trace.readingWon) {
    parts.push(`読み1位→生成:${r.trace.generated[0] ?? "なし"}`);
  }
  return parts.join(" / ");
}

/**
 * 正解が並べ替えの対象に入らない理由（入るなら空文字）。
 * - 候補外: 辞書・分割・生成のどれにも正解が無い
 * - 上位K件外: 正解が並べ替えの対象（先頭 llmRerankMaxCandidates 件）より後ろにある
 */
function unreachableReason(
  candidates: string[],
  r: AssistResult,
  expected: string,
): string {
  const dict = candidates.map(stripAnnotation);
  const idx = dict.indexOf(expected);
  if (idx >= config.llmRerankMaxCandidates) {
    return `上位${config.llmRerankMaxCandidates}件外(${idx + 1}番目)`;
  }
  if (
    idx < 0 && !r.trace.split.includes(expected) &&
    !r.trace.generated.includes(expected)
  ) {
    return "候補外";
  }
  return "";
}

const mark = (ok: boolean) => ok ? "○" : "×";

type F2Row = {
  id: string;
  category: string;
  expected: string;
  dict: string;
  llm: string;
  "llm(前のみ)": string;
  "llm+topic": string;
  route: string;
  issue: string;
  topic: string;
  ms: number;
};

Deno.test({
  name: "eval F2: dictionary order vs LLM assist",
  ignore: !endpoint,
  async fn(t) {
    const rows: F2Row[] = [];
    for (const g of f2Groups) {
      const type = g.okuri ? "okuriari" : "okurinasi";
      const candidates = await jisyoLookup(type, dictKey(g.reading, g.okuri)) ??
        g.candidates;
      for (const [i, item] of g.items.entries()) {
        const id = `${g.reading}${g.okuri ?? ""}-${i + 1}`;
        await t.step({
          name: `${g.category} / ${id}`,
          // 読みの分割には辞書全体が要る
          ignore: g.category === "dict-mismatch" && !jisyoPath,
          fn: async () => {
            const row = await evalF2Item(g, item, candidates, id);
            rows.push(row);
            const final = row.topic ? row["llm+topic"] : row.llm;
            assert(
              final.startsWith("○"),
              `期待値 ${item.expected} に対して ${final}` +
                (row.issue ? ` [${row.issue}]` : ""),
            );
          },
        });
      }
    }
    printF2Summary(rows);
  },
});

async function evalF2Item(
  g: F2Group,
  item: F2Item,
  candidates: string[],
  id: string,
): Promise<F2Row> {
  const after = item.after ?? "";
  const topic = await resolveTopic(item);
  const dictTop = stripAnnotation(candidates[0] ?? "");
  const full = await runAssist(g, candidates, item.before, after, undefined);
  // 文章の末尾で入力しているときはカーソル後に文脈が無い。その場合の結果も見る
  const beforeOnly = after
    ? await runAssist(g, candidates, item.before, "", undefined)
    : full;
  const withTopic = topic
    ? await runAssist(g, candidates, item.before, after, topic)
    : null;
  const show = (s: string) => `${mark(s === item.expected)} ${s}`;
  return {
    id,
    category: g.category,
    expected: item.expected,
    dict: show(dictTop),
    llm: show(full.top),
    "llm(前のみ)": show(beforeOnly.top),
    "llm+topic": withTopic ? show(withTopic.top) : "-",
    route: route((withTopic ?? full).result),
    issue: unreachableReason(candidates, full.result, item.expected),
    topic: topic ?? "",
    ms: (withTopic ?? full).ms,
  };
}

function printF2Summary(rows: F2Row[]) {
  console.table(rows);
  type Stat = {
    n: number;
    dict: number;
    llm: number;
    beforeOnly: number;
    topic: number;
    improved: number;
    worsened: number;
  };
  const ok = (s: string) => s.startsWith("○");
  const stats = new Map<string, Stat>();
  for (const r of rows) {
    const s = stats.get(r.category) ?? {
      n: 0,
      dict: 0,
      llm: 0,
      beforeOnly: 0,
      topic: 0,
      improved: 0,
      worsened: 0,
    };
    const final = r["llm+topic"] === "-" ? r.llm : r["llm+topic"];
    s.n++;
    if (ok(r.dict)) s.dict++;
    if (ok(r.llm)) s.llm++;
    if (ok(r["llm(前のみ)"])) s.beforeOnly++;
    if (ok(final)) s.topic++;
    if (!ok(r.dict) && ok(final)) s.improved++;
    if (ok(r.dict) && !ok(final)) s.worsened++;
    stats.set(r.category, s);
  }
  console.table(
    [...stats].map(([category, s]) => ({
      category,
      cases: s.n,
      dict: `${s.dict}/${s.n}`,
      llm: `${s.llm}/${s.n}`,
      "llm(前のみ)": `${s.beforeOnly}/${s.n}`,
      "llm+topic": `${s.topic}/${s.n}`,
      "改善(辞書×→○)": s.improved,
      "改悪(辞書○→×)": s.worsened,
    })),
  );
}

async function generate(
  c: F1Case,
  withContext: boolean,
  topic: string | undefined,
): Promise<{ surface: string; ms: number }> {
  const okuri = c.okuri ?? "";
  const [result, ms] = await timed(() =>
    provider.generateCandidates({
      word: c.reading + okuri,
      type: c.okuri ? "okuriari" : "okurinasi",
      contextBefore: withContext ? c.before : "",
      contextAfter: withContext ? (c.after ?? "") : "",
      kanaReading: c.reading + okuri,
      okuriKana: okuri,
      topic: withContext ? topic : undefined,
    })
  );
  return { surface: result.length > 0 ? result[0] + okuri : "", ms };
}

Deno.test({
  name: "eval F1: generation uses context",
  ignore: !endpoint,
  async fn(t) {
    const rows: Record<string, string | number>[] = [];
    for (const [i, c] of f1Cases.entries()) {
      const id = `${c.reading}-${i + 1}`;
      await t.step(`${c.category} / ${id}`, async () => {
        // 辞書に候補があると、実際の変換では F1 ではなく F2 が動く
        const dict = await jisyoLookup(
          c.okuri ? "okuriari" : "okurinasi",
          dictKey(c.reading, c.okuri),
        );
        const issue = dict && dict.length > 0
          ? `辞書に候補あり(${dict.slice(0, 3).join("/")})`
          : "";
        const topic = await resolveTopic(c);
        const withCtx = await generate(c, true, topic);
        const noCtx = await generate(c, false, undefined);
        // 固有名詞のケースは、文脈なしで当たるならケースとして文脈を試せていない
        const contextUsed = c.category !== "proper-noun"
          ? "-"
          : noCtx.surface === c.expected
          ? "文脈なしでも正解（ケースが弱い）"
          : "yes";
        rows.push({
          id,
          category: c.category,
          expected: c.expected,
          "with context": `${
            mark(withCtx.surface === c.expected)
          } ${withCtx.surface}`,
          "no context": `${
            mark(noCtx.surface === c.expected)
          } ${noCtx.surface}`,
          contextUsed,
          issue,
          topic: topic ?? "",
          ms: withCtx.ms,
        });
        assertEquals(withCtx.surface, c.expected);
      });
    }
    console.table(rows);
  },
});
