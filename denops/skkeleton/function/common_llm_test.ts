import { assertEquals, assert } from "jsr:@std/assert";
import { config } from "../config.ts";
import { readLearningLog } from "../llm/learning.ts";
import { recordLlmLearning } from "./common.ts";

Deno.test("recordLlmLearning - writes learning record when enabled", async () => {
  const tmpFile = await Deno.makeTempFile({ suffix: ".jsonl" });
  const orig = {
    llmEnabled: config.llmEnabled,
    llmLearningEnabled: config.llmLearningEnabled,
    llmLearningLogPath: config.llmLearningLogPath,
  };
  try {
    config.llmEnabled = true;
    config.llmLearningEnabled = true;
    config.llmLearningLogPath = tmpFile;

    await recordLlmLearning({
      word: "かんじ",
      selected: "漢字",
      type: "okurinasi",
      candidates: ["漢字", "感じ"],
      selectedIndex: 0,
      contextBefore: "日本語の",
      contextAfter: "を変換する",
      source: "dictionary",
    });

    const records = await readLearningLog(tmpFile);
    assertEquals(records.length, 1);
    assertEquals(records[0].word, "かんじ");
    assertEquals(records[0].selected, "漢字");
    assertEquals(records[0].type, "okurinasi");
    assertEquals(records[0].contextBefore, "日本語の");
    assertEquals(records[0].contextAfter, "を変換する");
    assertEquals(records[0].source, "dictionary");
    assert(records[0].ts.length > 0); // ISO timestamp string
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmLearningEnabled = orig.llmLearningEnabled;
    config.llmLearningLogPath = orig.llmLearningLogPath;
    await Deno.remove(tmpFile);
  }
});

Deno.test("recordLlmLearning - does nothing when learning disabled", async () => {
  const tmpFile = await Deno.makeTempFile({ suffix: ".jsonl" });
  const orig = {
    llmEnabled: config.llmEnabled,
    llmLearningEnabled: config.llmLearningEnabled,
    llmLearningLogPath: config.llmLearningLogPath,
  };
  try {
    config.llmEnabled = true;
    config.llmLearningEnabled = false;
    config.llmLearningLogPath = tmpFile;

    await recordLlmLearning({
      word: "かんじ",
      selected: "漢字",
      type: "okurinasi",
      candidates: [],
      selectedIndex: 0,
      contextBefore: "",
      contextAfter: "",
      source: "dictionary",
    });

    const records = await readLearningLog(tmpFile);
    assertEquals(records.length, 0);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmLearningEnabled = orig.llmLearningEnabled;
    config.llmLearningLogPath = orig.llmLearningLogPath;
    await Deno.remove(tmpFile);
  }
});

Deno.test("recordLlmLearning - does nothing when LLM disabled", async () => {
  const tmpFile = await Deno.makeTempFile({ suffix: ".jsonl" });
  const orig = {
    llmEnabled: config.llmEnabled,
    llmLearningEnabled: config.llmLearningEnabled,
    llmLearningLogPath: config.llmLearningLogPath,
  };
  try {
    config.llmEnabled = false;
    config.llmLearningEnabled = true;
    config.llmLearningLogPath = tmpFile;

    await recordLlmLearning({
      word: "かんじ",
      selected: "漢字",
      type: "okurinasi",
      candidates: [],
      selectedIndex: 0,
      contextBefore: "",
      contextAfter: "",
      source: "dictionary",
    });

    const records = await readLearningLog(tmpFile);
    assertEquals(records.length, 0);
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmLearningEnabled = orig.llmLearningEnabled;
    config.llmLearningLogPath = orig.llmLearningLogPath;
    await Deno.remove(tmpFile);
  }
});

Deno.test("recordLlmLearning - records LLM source correctly", async () => {
  const tmpFile = await Deno.makeTempFile({ suffix: ".jsonl" });
  const orig = {
    llmEnabled: config.llmEnabled,
    llmLearningEnabled: config.llmLearningEnabled,
    llmLearningLogPath: config.llmLearningLogPath,
  };
  try {
    config.llmEnabled = true;
    config.llmLearningEnabled = true;
    config.llmLearningLogPath = tmpFile;

    await recordLlmLearning({
      word: "かんじ",
      selected: "感じ",
      type: "okurinasi",
      candidates: ["感じ"],
      selectedIndex: 0,
      contextBefore: "",
      contextAfter: "",
      source: "llm",
    });

    const records = await readLearningLog(tmpFile);
    assertEquals(records.length, 1);
    assertEquals(records[0].source, "llm");
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmLearningEnabled = orig.llmLearningEnabled;
    config.llmLearningLogPath = orig.llmLearningLogPath;
    await Deno.remove(tmpFile);
  }
});

Deno.test("recordLlmLearning - silently ignores write errors", async () => {
  const orig = {
    llmEnabled: config.llmEnabled,
    llmLearningEnabled: config.llmLearningEnabled,
    llmLearningLogPath: config.llmLearningLogPath,
  };
  try {
    config.llmEnabled = true;
    config.llmLearningEnabled = true;
    config.llmLearningLogPath = "/nonexistent/path/learning.jsonl";

    // Should not throw
    await recordLlmLearning({
      word: "かんじ",
      selected: "漢字",
      type: "okurinasi",
      candidates: [],
      selectedIndex: 0,
      contextBefore: "",
      contextAfter: "",
      source: "dictionary",
    });
  } finally {
    config.llmEnabled = orig.llmEnabled;
    config.llmLearningEnabled = orig.llmLearningEnabled;
    config.llmLearningLogPath = orig.llmLearningLogPath;
  }
});
