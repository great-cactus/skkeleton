/**
 * 実際の zenz サーバを使った LLM 補助の評価テスト。
 *
 * 環境変数 SKKELETON_ZENZ_ENDPOINT が無いときは実行しない（通常の deno task test では無視される）。
 *
 *   SKKELETON_ZENZ_ENDPOINT=http://127.0.0.1:8080 \
 *     deno test -A denops/skkeleton/llm/eval/
 *
 * 任意の環境変数:
 * - SKKELETON_TOPIC_ENDPOINT / SKKELETON_TOPIC_MODEL / SKKELETON_TOPIC_API_KEY:
 *     topic を省略したケースで、話題をこの要約器（chat completions API）で作る
 * - SKKELETON_EVAL_JISYO / SKKELETON_EVAL_JISYO_ENCODING (既定 euc-jp):
 *     F2 の candidates をこの SKK 辞書から読み直す
 *
 * 品質を見るためのテストなので、タイムアウトは実運用（100 ms / 500 ms）より長くとり、
 * かかった時間は表に出す。
 */
import { assertEquals } from "@std/assert";
import { ZenzLlmProvider } from "../providers/zenz.ts";
import { TopicSummarizer } from "../topic.ts";
import { Dictionary as SkkDictionary } from "../../sources/skk_dictionary.ts";
import { getOkuriStr } from "../../okuri.ts";
import { config } from "../../config.ts";
import { type F1Case, f1Cases, type F2Case, f2Cases } from "./cases.ts";

const endpoint = Deno.env.get("SKKELETON_ZENZ_ENDPOINT") ?? "";
const topicEndpoint = Deno.env.get("SKKELETON_TOPIC_ENDPOINT") ?? "";
const jisyoPath = Deno.env.get("SKKELETON_EVAL_JISYO") ?? "";
const EVAL_TIMEOUT_MS = 10_000;

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
async function dictionaryCandidates(c: F2Case): Promise<string[]> {
  if (!jisyoPath) return c.candidates;
  if (dictionary == null) {
    dictionary = new SkkDictionary();
    await dictionary.load(
      jisyoPath,
      Deno.env.get("SKKELETON_EVAL_JISYO_ENCODING") ?? "euc-jp",
    );
  }
  const type = c.okuri ? "okuriari" : "okurinasi";
  const key = c.okuri ? getOkuriStr(c.reading, c.okuri) : c.reading;
  return await dictionary.getHenkanResult(type, key);
}

/** henkanFirst と同じく、先頭 K 件だけ並べ替えて残りを後ろにつなぐ */
async function rerank(
  c: F2Case,
  candidates: string[],
  topic: string | undefined,
): Promise<{ order: string[]; ms: number }> {
  const k = config.llmRerankMaxCandidates;
  const okuri = c.okuri ?? "";
  const [scored, ms] = await timed(() =>
    provider.scoreCandidates({
      word: c.reading + okuri,
      type: c.okuri ? "okuriari" : "okurinasi",
      candidates: candidates.slice(0, k),
      contextBefore: c.before,
      contextAfter: c.after ?? "",
      kanaReading: c.reading + okuri,
      okuriKana: okuri,
      topic,
    })
  );
  if (scored.length === 0) {
    throw new Error("scoreCandidates returned no result (server error?)");
  }
  return {
    order: [...scored.map((s) => s.value), ...candidates.slice(k)],
    ms,
  };
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

const mark = (ok: boolean) => ok ? "○" : "×";

Deno.test({
  name: "eval F2: dictionary order vs LLM rerank",
  ignore: !endpoint,
  async fn(t) {
    const rows: Record<string, string | number>[] = [];
    for (const c of f2Cases) {
      await t.step(`${c.category} / ${c.id}`, async () => {
        const candidates = await dictionaryCandidates(c);
        const topic = await resolveTopic(c);
        const plain = await rerank(c, candidates, undefined);
        const withTopic = topic ? await rerank(c, candidates, topic) : plain;
        rows.push({
          id: c.id,
          category: c.category,
          expected: c.expected,
          dict: `${mark(candidates[0] === c.expected)} ${candidates[0] ?? ""}`,
          llm: `${mark(plain.order[0] === c.expected)} ${plain.order[0]}`,
          "llm+topic": topic
            ? `${mark(withTopic.order[0] === c.expected)} ${withTopic.order[0]}`
            : "-",
          topic: topic ?? "",
          ms: withTopic.ms,
        });
        assertEquals(withTopic.order[0], c.expected);
      });
    }
    printF2Summary(rows);
  },
});

Deno.test({
  name: "eval F1: generation uses context",
  ignore: !endpoint,
  async fn(t) {
    const rows: Record<string, string | number>[] = [];
    for (const c of f1Cases) {
      await t.step(`${c.category} / ${c.id}`, async () => {
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
          id: c.id,
          category: c.category,
          expected: c.expected,
          "with context": `${
            mark(withCtx.surface === c.expected)
          } ${withCtx.surface}`,
          "no context": `${
            mark(noCtx.surface === c.expected)
          } ${noCtx.surface}`,
          contextUsed,
          topic: topic ?? "",
          ms: withCtx.ms,
        });
        assertEquals(withCtx.surface, c.expected);
      });
    }
    console.table(rows);
  },
});

function printF2Summary(rows: Record<string, string | number>[]) {
  console.table(rows);
  const byCategory = new Map<
    string,
    { n: number; d: number; l: number; t: number }
  >();
  for (const r of rows) {
    const s = byCategory.get(r.category as string) ??
      { n: 0, d: 0, l: 0, t: 0 };
    s.n++;
    if (String(r.dict).startsWith("○")) s.d++;
    if (String(r.llm).startsWith("○")) s.l++;
    const lt = r["llm+topic"] === "-" ? r.llm : r["llm+topic"];
    if (String(lt).startsWith("○")) s.t++;
    byCategory.set(r.category as string, s);
  }
  console.table(
    [...byCategory].map(([category, s]) => ({
      category,
      cases: s.n,
      dict: `${s.d}/${s.n}`,
      llm: `${s.l}/${s.n}`,
      "llm+topic": `${s.t}/${s.n}`,
    })),
  );
}
