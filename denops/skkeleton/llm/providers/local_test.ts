import { assertEquals } from "@std/assert";
import { LocalLlmProvider } from "./local.ts";

/** テスト用モック HTTP サーバ */
function createMockServer(
  responseBody: string,
  statusCode = 200,
  delay = 0,
): { server: Deno.HttpServer; url: string; close: () => Promise<void> } {
  let port: number;
  const server = Deno.serve({ port: 0, onListen: (addr) => { port = addr.port; } }, async (_req) => {
    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }
    const url = new URL(_req.url);
    if (url.pathname === "/v1/models") {
      return new Response(JSON.stringify({ data: [] }), { status: statusCode });
    }
    return new Response(responseBody, {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    });
  });

  // port is assigned synchronously via onListen in Deno.serve
  return {
    server,
    get url() {
      return `http://localhost:${port!}`;
    },
    close: () => server.shutdown(),
  };
}

Deno.test("LocalLlmProvider - generateCandidates parses response", async () => {
  const mockResponse = JSON.stringify({
    choices: [{
      message: { content: "化学\n科学\n架空" },
    }],
  });

  const mock = createMockServer(mockResponse);
  // Give the server a moment to bind
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
    });

    const result = await provider.generateCandidates({
      word: "かがく",
      type: "okurinasi",
      contextBefore: "有機化合物の",
      contextAfter: "反応において",
    });

    assertEquals(result.length, 3);
    assertEquals(result[0].value, "化学");
    assertEquals(result[0].isLlmGenerated, true);
    assertEquals(result[1].value, "科学");
    assertEquals(result[2].value, "架空");
    // スコアは降順
    assertEquals(result[0].score > result[1].score, true);
    assertEquals(result[1].score > result[2].score, true);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - generateCandidates returns empty on error", async () => {
  const mock = createMockServer("Internal Server Error", 500);
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
    });

    const result = await provider.generateCandidates({
      word: "かがく",
      type: "okurinasi",
      contextBefore: "",
      contextAfter: "",
    });

    assertEquals(result, []);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - rerankCandidates reorders", async () => {
  const mockResponse = JSON.stringify({
    choices: [{
      message: { content: "2,1,3" },
    }],
  });

  const mock = createMockServer(mockResponse);
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
    });

    const result = await provider.rerankCandidates({
      word: "かがく",
      type: "okurinasi",
      candidates: ["科学", "化学", "架空"],
      contextBefore: "有機化合物の",
      contextAfter: "反応において",
    });

    assertEquals(result.length, 3);
    assertEquals(result[0].value, "化学");
    assertEquals(result[1].value, "科学");
    assertEquals(result[2].value, "架空");
  } finally {
    await mock.close();
  }
});

Deno.test({ name: "LocalLlmProvider - rerankCandidates returns original on timeout", sanitizeResources: false, fn: async () => {
  // 応答に2秒かかるが、タイムアウトは200ms
  const mockResponse = JSON.stringify({
    choices: [{ message: { content: "2,1,3" } }],
  });
  const mock = createMockServer(mockResponse, 200, 2000);
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 200,
    });

    const result = await provider.rerankCandidates({
      word: "かがく",
      type: "okurinasi",
      candidates: ["科学", "化学", "架空"],
      contextBefore: "",
      contextAfter: "",
    });

    // タイムアウト時は元の順序
    assertEquals(result[0].value, "科学");
    assertEquals(result[1].value, "化学");
    assertEquals(result[2].value, "架空");
  } finally {
    await mock.close();
  }
} });

Deno.test("LocalLlmProvider - healthCheck succeeds", async () => {
  const mock = createMockServer("{}", 200);
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
    });

    assertEquals(await provider.healthCheck(), true);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - healthCheck fails on unreachable endpoint", async () => {
  const provider = new LocalLlmProvider({
    type: "local",
    endpoint: "http://127.0.0.1:1",  // 到達不能
    apiKey: "",
    model: "test-model",
    timeoutMs: 200,
  });

  assertEquals(await provider.healthCheck(), false);
});
