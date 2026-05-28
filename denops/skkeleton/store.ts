import { Context } from "./context.ts";
import { Library } from "./dictionary.ts";
import { Cell, LazyCell } from "./util.ts";
import { Dictionary as UserDictionary } from "./sources/user_dictionary.ts";
import type { LlmProvider } from "./llm/provider.ts";

export const currentContext = new Cell(() => new Context());
export const currentLibrary = new LazyCell(() =>
  new Library([], new UserDictionary())
);

/** 現在の LLM プロバイダ（未設定時は null） */
export let currentLlmProvider: LlmProvider | null = null;

export function setLlmProvider(provider: LlmProvider | null) {
  currentLlmProvider = provider;
}

export const variables = {
  lastMode: "hira",
};
