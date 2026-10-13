import { assertEquals } from "@std/assert";
import {
  parseTopicResponse,
  sliceAroundCursor,
  TopicStore,
  TopicSummarizer,
} from "./topic.ts";

function createMockServer(
  handler: (req: Request) => Response | Promise<Response>,
): { url: string; close: () => Promise<void> } {
  let port: number;
  const server = Deno.serve(
    {
      port: 0,
      onListen: (addr) => {
        port = addr.port;
      },
    },
    handler,
  );
  return {
    get url() {
      return `http://localhost:${port!}`;
    },
    close: () => server.shutdown(),
  };
}

function makeSummarizer(url: string, apiKey = ""): TopicSummarizer {
  return new TopicSummarizer({
    endpoint: url,
    apiKey,
    model: "m",
    timeoutMs: 5000,
  });
}

Deno.test("parseTopicResponse - strips label, quotes and period", () => {
  assertEquals(parseTopicResponse("川沿いの散策"), "川沿いの散策");
  assertEquals(
    parseTopicResponse("\n話題: 「料理の作法」。\n余計な行"),
    "料理の作法",
  );
  assertEquals(parseTopicResponse("話題：決算報告"), "決算報告");
  assertEquals(parseTopicResponse(""), "");
  assertEquals(parseTopicResponse("あ".repeat(40)), "あ".repeat(25));
});

Deno.test("sliceAroundCursor - short text is kept, long text is cut near cursor", () => {
  assertEquals(sliceAroundCursor("短い文章", 2, 10), "短い文章");
  const text = "a".repeat(100) + "b".repeat(100);
  // カーソル前 8 割・後 2 割
  assertEquals(sliceAroundCursor(text, 100, 10), "a".repeat(8) + "b".repeat(2));
  // 先頭付近・末尾付近では範囲を内側に寄せる
  assertEquals(sliceAroundCursor(text, 0, 10), "a".repeat(10));
  assertEquals(sliceAroundCursor(text, 200, 10), "b".repeat(10));
});

Deno.test("TopicStore - needsUpdate follows changedtick and interval", async () => {
  const mock = createMockServer(() =>
    Response.json({ choices: [{ message: { content: "川沿いの散策" } }] })
  );
  await new Promise((r) => setTimeout(r, 50));
  try {
    const store = new TopicStore(1000);
    const s = makeSummarizer(mock.url);
    assertEquals(store.needsUpdate(1, 10, 0), true);
    assertEquals(store.get(1), undefined);

    await store.refresh(1, 10, "文章", s, 0);
    assertEquals(store.get(1), "川沿いの散策");
    // 変更なし
    assertEquals(store.needsUpdate(1, 10, 5000), false);
    // 変更ありだが最短間隔内
    assertEquals(store.needsUpdate(1, 11, 500), false);
    // 変更ありで最短間隔を過ぎた
    assertEquals(store.needsUpdate(1, 11, 1000), true);
    // 別のバッファは独立
    assertEquals(store.needsUpdate(2, 10, 0), true);
  } finally {
    await mock.close();
  }
});

Deno.test("TopicStore - keeps previous topic when summarizing fails", async () => {
  let fail = false;
  const mock = createMockServer(() =>
    fail
      ? new Response("error", { status: 500 })
      : Response.json({ choices: [{ message: { content: "決算報告" } }] })
  );
  await new Promise((r) => setTimeout(r, 50));
  try {
    const store = new TopicStore(0);
    const s = makeSummarizer(mock.url);
    await store.refresh(1, 1, "文章", s, 0);
    fail = true;
    await store.refresh(1, 2, "文章", s, 1);
    assertEquals(store.get(1), "決算報告");
  } finally {
    await mock.close();
  }
});

Deno.test("TopicSummarizer - sends prompt and auth header", async () => {
  let auth: string | null = null;
  let content = "";
  const mock = createMockServer(async (req) => {
    auth = req.headers.get("Authorization");
    content = (await req.json()).messages[0].content;
    return Response.json({ choices: [{ message: { content: "決算報告" } }] });
  });
  await new Promise((r) => setTimeout(r, 50));
  try {
    assertEquals(
      await makeSummarizer(mock.url, "KEY").summarize("本文です"),
      "決算報告",
    );
    assertEquals(auth, "Bearer KEY");
    assertEquals(content.endsWith("文章:\n本文です"), true);
    await makeSummarizer(mock.url).summarize("本文です");
    assertEquals(auth, null);
  } finally {
    await mock.close();
  }
});

Deno.test("TopicSummarizer - returns empty on unreachable endpoint", async () => {
  assertEquals(
    await makeSummarizer("http://127.0.0.1:1").summarize("本文"),
    "",
  );
});
