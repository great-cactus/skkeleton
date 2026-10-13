import type { HenkanType } from "../dictionary.ts";
import { getOkuriStr } from "../okuri.ts";

/**
 * 読みの末尾を送り仮名・助詞として切り分け、辞書を引き直して候補を作る。
 *
 * 送り仮名を区切らずに入力した「ながい」は、送りなしの見出しとして引かれ、
 * 永井・長井のような別の語しか返らないことがある。末尾を切り分けて
 * 「なが＋い」→ 送りありの見出し「ながi」→「長い」のように候補を補う。
 * 「きょう＋か」→「今日か」のように、末尾の助詞を切り離す分割も行う。
 *
 * 文法的にありえない候補（「買いた」など）も混ざるので、
 * LLM による並べ替えで下位に落とす前提で使う。
 */

/** 切り分ける末尾の最大文字数 */
const MAX_TAIL_CHARS = 3;
/** 1 つの見出しから採る候補の数 */
const PER_KEY_LIMIT = 3;
/** 分割から加える候補の総数 */
export const SPLIT_CANDIDATES_LIMIT = 4;

/** 語の後ろに付く助詞（送りなしの見出しの後ろに切り離す） */
const PARTICLES = new Set([
  "か",
  "が",
  "は",
  "を",
  "に",
  "で",
  "と",
  "も",
  "の",
  "へ",
  "や",
  "ね",
  "よ",
  "から",
  "まで",
  "より",
]);

export type Lookup = (type: HenkanType, word: string) => Promise<string[]>;

const stripAnnotation = (c: string) => c.replace(/;.*$/, "");

/**
 * 分割から得た候補（表記に末尾のかなを付けたもの）を返す。
 * 末尾の短い分割を優先し、existing にある表記は除く。
 * @param reading 送りなしの読み（ひらがな）
 * @param existing 辞書がすでに返した候補
 */
export async function splitCandidates(
  lookup: Lookup,
  reading: string,
  existing: string[],
): Promise<string[]> {
  if (!/^[ぁ-ゖー]+$/.test(reading)) return [];
  const chars = [...reading];
  const seen = new Set(existing.map(stripAnnotation));
  const out: string[] = [];
  const add = (stems: string[], tail: string) => {
    for (const s of stems.slice(0, PER_KEY_LIMIT)) {
      const surface = stripAnnotation(s) + tail;
      if (!seen.has(surface)) {
        seen.add(surface);
        out.push(surface);
      }
    }
  };

  for (let t = 1; t <= MAX_TAIL_CHARS && t < chars.length; t++) {
    const stem = chars.slice(0, -t).join("");
    const tail = chars.slice(-t).join("");
    // 送り仮名としての分割（「なが」+「い」→ 見出し「ながi」）
    if (tail[0] !== "っ" || tail.length > 1) {
      const key = getOkuriStr(stem, tail);
      // 送り仮名にならない文字（ーなど）では英字 1 文字が付かない
      if (key.length === stem.length + 1 && /[a-z]$/.test(key)) {
        add(await lookup("okuriari", key), tail);
      }
    }
    // 助詞としての分割（「きょう」+「か」）
    if (PARTICLES.has(tail)) {
      add(await lookup("okurinasi", stem), tail);
    }
  }
  return out.slice(0, SPLIT_CANDIDATES_LIMIT);
}
