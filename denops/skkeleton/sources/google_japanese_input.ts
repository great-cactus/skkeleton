import { config } from "../config.ts";
import {
  Dictionary as BaseDictionary,
  HenkanType,
  Source as BaseSource,
} from "../dictionary.ts";
import type { CompletionData } from "../types.ts";

import { deadline } from "@std/async/deadline";

export class Source implements BaseSource {
  getDictionaries(): Promise<BaseDictionary[]> {
    return Promise.resolve([new Dictionary()]);
  }
}

// Circuit breaker: after a failure, skip requests for a while so that
// offline usage does not wait for the timeout on every conversion.
const COOLDOWN_MS = 60_000;

export class Dictionary implements BaseDictionary {
  #blockedUntil = 0;

  async connect() {}
  async getHenkanResult(_type: HenkanType, word: string): Promise<string[]> {
    // It should not work for "okuriari".
    return _type === "okuriari" ? [] : await this.getMidashis(word);
  }
  getCompletionResult(_prefix: string, _feed: string): Promise<CompletionData> {
    // Note: It does not support completions
    return Promise.resolve([]);
  }
  private async getMidashis(prefix: string): Promise<string[]> {
    if (Date.now() < this.#blockedUntil) {
      return [];
    }

    // Get midashis from prefix
    const params = new URLSearchParams({
      langpair: "ja-Hira|ja",
      text: `${prefix},`,
    });

    try {
      // Note: Google API access may be slow.
      const resp = await deadline(
        fetch(
          `http://www.google.com/transliterate?${params.toString()}`,
          {
            method: "GET",
          },
        ),
        500,
      );
      const respJson = await resp.json();
      return respJson[0][1];
    } catch (e) {
      this.#blockedUntil = Date.now() + COOLDOWN_MS;
      if (e instanceof DOMException) {
        // Ignore timeout error
      } else if (config.debug) {
        console.log(e);
      }
    }
    return [];
  }
  close() {}
}
