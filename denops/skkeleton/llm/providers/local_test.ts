import { assertEquals } from "@std/assert";
import { LocalLlmProvider } from "./local.ts";

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

Deno.test("LocalLlmProvider - generateCandidates parses response", async () => {
  const mock = createMockServer((_req) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content: "化学\n科学\n架空" } }],
      }),
      { headers: { "Content-Type": "application/json" } },
    )
  );
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
      fallbackTimeoutMs: 5000,
    });

    const result = await provider.generateCandidates({
      word: "かがく",
      type: "okurinasi",
      contextBefore: "有機化合物の",
      contextAfter: "反応において",
    });

    assertEquals(result, ["化学", "科学", "架空"]);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - generateCandidates returns empty on error", async () => {
  const mock = createMockServer((_req) =>
    new Response("Internal Server Error", { status: 500 })
  );
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
      fallbackTimeoutMs: 5000,
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

Deno.test("LocalLlmProvider - scoreCandidates scores and sorts by logprobSum", async () => {
  // Mock /v1/completions response with batch logprobs
  // choices[0] = prefix only, choices[1..N] = candidates with context
  const mock = createMockServer(async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/v1/models") {
      return new Response(JSON.stringify({ data: [] }));
    }
    // /v1/completions
    return new Response(
      JSON.stringify({
        choices: [
          // index 0: prefix only ("有機化合物の") — 3 tokens
          {
            index: 0,
            logprobs: {
              tokens: ["有機", "化合", "物の"],
              token_logprobs: [-1.0, -1.5, -0.8],
            },
          },
          // index 1: "有機化合物の科学反応において" — candidate "科学"
          {
            index: 1,
            logprobs: {
              tokens: ["有機", "化合", "物の", "科学", "反応", "において"],
              token_logprobs: [-1.0, -1.5, -0.8, -3.0, -1.2, -0.5],
            },
          },
          // index 2: "有機化合物の化学反応において" — candidate "化学" (better score)
          {
            index: 2,
            logprobs: {
              tokens: ["有機", "化合", "物の", "化学", "反応", "において"],
              token_logprobs: [-1.0, -1.5, -0.8, -0.5, -1.0, -0.3],
            },
          },
        ],
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
      fallbackTimeoutMs: 5000,
    });

    const result = await provider.scoreCandidates({
      word: "かがく",
      type: "okurinasi",
      candidates: ["科学", "化学"],
      contextBefore: "有機化合物の",
      contextAfter: "反応において",
    });

    assertEquals(result.length, 2);
    // 化学 has better logprob (-0.5 + -1.0 + -0.3 = -1.8) vs 科学 (-3.0 + -1.2 + -0.5 = -4.7)
    assertEquals(result[0].value, "化学");
    assertEquals(result[1].value, "科学");
    // Verify logprobSum ordering
    assertEquals(result[0].logprobSum > result[1].logprobSum, true);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - scoreCandidates returns empty on timeout", async () => {
  const mock = createMockServer(async (_req) => {
    await new Promise((r) => setTimeout(r, 2000));
    return new Response(JSON.stringify({ choices: [] }));
  });
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 100,
      fallbackTimeoutMs: 100,
    });

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

Deno.test("LocalLlmProvider - scoreCandidates returns empty on empty candidates", async () => {
  const provider = new LocalLlmProvider({
    type: "local",
    endpoint: "http://127.0.0.1:1",
    apiKey: "",
    model: "test-model",
    timeoutMs: 5000,
    fallbackTimeoutMs: 5000,
  });

  const result = await provider.scoreCandidates({
    word: "かがく",
    type: "okurinasi",
    candidates: [],
    contextBefore: "",
    contextAfter: "",
  });

  assertEquals(result, []);
});

Deno.test("LocalLlmProvider - healthCheck succeeds", async () => {
  const mock = createMockServer((_req) =>
    new Response(JSON.stringify({ data: [] }), { status: 200 })
  );
  await new Promise((r) => setTimeout(r, 50));

  try {
    const provider = new LocalLlmProvider({
      type: "local",
      endpoint: mock.url,
      apiKey: "",
      model: "test-model",
      timeoutMs: 5000,
      fallbackTimeoutMs: 5000,
    });

    assertEquals(await provider.healthCheck(), true);
  } finally {
    await mock.close();
  }
});

Deno.test("LocalLlmProvider - healthCheck fails on unreachable endpoint", async () => {
  const provider = new LocalLlmProvider({
    type: "local",
    endpoint: "http://127.0.0.1:1",
    apiKey: "",
    model: "test-model",
    timeoutMs: 200,
    fallbackTimeoutMs: 200,
  });

  assertEquals(await provider.healthCheck(), false);
});
