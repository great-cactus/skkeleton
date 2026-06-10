import { assert, assertEquals } from "@std/assert";
import { buildZenzPrefix, hiraToKata, ZenzLlmProvider } from "./zenz.ts";

const MARKER_INPUT = "\uee00";
const MARKER_OUTPUT = "\uee01";
const MARKER_LEFT_CONTEXT = "\uee02";
const MARKER_RIGHT_CONTEXT = "\uee07";

/** テスト用モック HTTP サーバ */
function createMockServer(
  handler: (req: Request) => Response | Promise<Response>,
): { server: Deno.HttpServer; url: string; close: () => Promise<void> } {
  let port: number;
  const server = Deno.serve(
    { port: 0, onListen: (addr) => { port = addr.port; } },
    handler,
  );

  return {
    server,
    get url() {
      return `http://localhost:${port!}`;
    },
    close: () => server.shutdown(),
  };
}

function makeProvider(url: string): ZenzLlmProvider {
  return new ZenzLlmProvider({
    type: "zenz",
    endpoint: url,
    apiKey: "",
    model: "",
    timeoutMs: 5000,
    fallbackTimeoutMs: 5000,
  });
}

Deno.test("hiraToKata - converts hiragana, keeps others", () => {
  assertEquals(hiraToKata("のぼる"), "ノボル");
  assertEquals(hiraToKata("かがく"), "カガク");
  assertEquals(hiraToKata("ヴェんてぃA1"), "ヴェンティA1");
});

Deno.test("buildZenzPrefix - markers and context placement", () => {
  assertEquals(
    buildZenzPrefix("川を渡るには", "", "はし"),
    `${MARKER_LEFT_CONTEXT}川を渡るには${MARKER_INPUT}ハシ${MARKER_OUTPUT}`,
  );
  // 右文脈は左文脈の後・入力の前に置く (zenz-v3.2)
  assertEquals(
    buildZenzPrefix("机の", "に置く。", "はし"),
    `${MARKER_LEFT_CONTEXT}机の${MARKER_RIGHT_CONTEXT}に置く。${MARKER_INPUT}ハシ${MARKER_OUTPUT}`,
  );
});

Deno.test("buildZenzPrefix - strips newlines and truncates context", () => {
  const left = "あ".repeat(100) + "\n" + "い".repeat(100);
  const right = "う".repeat(100);
  const prefix = buildZenzPrefix(left, right, "よみ");
  assert(!prefix.includes("\n"));
  // 左は末尾 80 文字、右は先頭 40 文字
  assert(prefix.includes(MARKER_LEFT_CONTEXT + "い".repeat(80)));
  assert(prefix.includes(MARKER_RIGHT_CONTEXT + "う".repeat(40)));
  assert(!prefix.includes("う".repeat(41)));
});

Deno.test("ZenzLlmProvider - scoreCandidates ranks by logprob sum", async () => {
  // prefix は 3 トークン、各候補は 2 トークンとする
  const logprobsByCandidate: Record<string, number[]> = {
    "化学": [-0.5, -0.5], // sum = -1.0
    "科学": [-2.0, -2.0], // sum = -4.0
    "価額": [-5.0, -5.0], // sum = -10.0
  };
  const mock = createMockServer(async (req) => {
    const url = new URL(req.url);
    const body = await req.json();
    if (url.pathname === "/tokenize") {
      return Response.json({ tokens: [0, 1, 2] });
    }
    const prompt = body.prompt as string;
    const cand = Object.keys(logprobsByCandidate).find((c) =>
      prompt.endsWith(c)
    );
    if (!cand) {
      return new Response("unexpected prompt", { status: 400 });
    }
    const lps = [null, -1, -1, ...logprobsByCandidate[cand]];
    return Response.json({
      choices: [{ logprobs: { token_logprobs: lps } }],
      usage: { prompt_tokens: 5 },
    });
  });
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = makeProvider(mock.url);
    const result = await provider.scoreCandidates({
      word: "かがく",
      type: "okurinasi",
      candidates: ["科学", "化学", "価額"],
      contextBefore: "有機",
      contextAfter: "の実験",
      kanaReading: "かがく",
      okuriKana: "",
    });

    assertEquals(result.map((r) => r.value), ["化学", "科学", "価額"]);
    assertEquals(result[0].logprobSum, -1.0);
    assertEquals(result[0].logprobAvg, -0.5);
  } finally {
    await mock.close();
  }
});

Deno.test("ZenzLlmProvider - scoreCandidates scores surface form (okuriari)", async () => {
  const prompts: string[] = [];
  const mock = createMockServer(async (req) => {
    const url = new URL(req.url);
    const body = await req.json();
    if (url.pathname === "/tokenize") {
      return Response.json({ tokens: [0, 1, 2] });
    }
    prompts.push(body.prompt as string);
    return Response.json({
      choices: [{ logprobs: { token_logprobs: [null, -1, -1, -1, -1] } }],
      usage: { prompt_tokens: 5 },
    });
  });
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = makeProvider(mock.url);
    const result = await provider.scoreCandidates({
      word: "のぼr",
      type: "okuriari",
      candidates: ["上", "登"],
      contextBefore: "坂を",
      contextAfter: "",
      kanaReading: "のぼる",
      okuriKana: "る",
    });

    // スコアリングは表層形（候補+送り仮名）で行い、返す値は語幹のまま
    assert(prompts.some((p) => p.endsWith("上る")));
    assert(prompts.some((p) => p.endsWith("登る")));
    assert(prompts.every((p) => p.includes(MARKER_INPUT + "ノボル")));
    assertEquals(new Set(result.map((r) => r.value)), new Set(["上", "登"]));
  } finally {
    await mock.close();
  }
});

Deno.test("ZenzLlmProvider - scoreCandidates returns empty on server error", async () => {
  const mock = createMockServer(() =>
    new Response("Internal Server Error", { status: 500 })
  );
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = makeProvider(mock.url);
    const result = await provider.scoreCandidates({
      word: "かがく",
      type: "okurinasi",
      candidates: ["科学", "化学"],
      contextBefore: "",
      contextAfter: "",
    });
    assertEquals(result, []);
  } finally {
    await mock.close();
  }
});

Deno.test("ZenzLlmProvider - generateCandidates returns greedy conversion", async () => {
  const mock = createMockServer(async (req) => {
    const body = await req.json();
    assertEquals(body.temperature, 0);
    return Response.json({ choices: [{ text: "資料" }] });
  });
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = makeProvider(mock.url);
    const result = await provider.generateCandidates({
      word: "しりょう",
      type: "okurinasi",
      contextBefore: "この",
      contextAfter: "を見てください。",
      kanaReading: "しりょう",
    });
    assertEquals(result, ["資料"]);
  } finally {
    await mock.close();
  }
});

Deno.test("ZenzLlmProvider - generateCandidates strips okurigana", async () => {
  const mock = createMockServer((_req) =>
    Response.json({ choices: [{ text: "上る" }] })
  );
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = makeProvider(mock.url);
    const result = await provider.generateCandidates({
      word: "のぼr",
      type: "okuriari",
      contextBefore: "坂を",
      contextAfter: "",
      kanaReading: "のぼる",
      okuriKana: "る",
    });
    assertEquals(result, ["上"]);
  } finally {
    await mock.close();
  }
});
