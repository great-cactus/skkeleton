/**
 * LLM 補助の評価用テストケース。
 *
 * eval_test.ts が実際の zenz サーバに対してこれらを実行する。
 * ここにある例は書式と評価の流れを確かめるためのもので、
 * candidates の辞書順は SKK-JISYO.L で確認していない。
 * SKKELETON_EVAL_JISYO に辞書のパスを渡すと、candidates を辞書から読み直す。
 */

/**
 * F2（リランキング）のケースの分類
 * - homophone-sentence: 同音異義語。正解の手がかりが変換中の文の中にある
 * - homophone-document: 同音異義語。手がかりが前の文にしかない（topic で拾えるかを見る）
 * - keep: 辞書の 1 位が正解。LLM が順位を崩さないことを確かめる
 */
export type F2Category =
  | "homophone-sentence"
  | "homophone-document"
  | "keep";

export type F2Case = {
  id: string;
  category: F2Category;
  /** カーソル前の文章。前の文を含めてよい（プロバイダ側で文単位に絞られる） */
  before: string;
  /** カーソル後の文章 */
  after?: string;
  /** 読み（送りありでは送り仮名を除いた部分。例: "のぼ"） */
  reading: string;
  /** 送り仮名（送りありのときだけ。例: "る"） */
  okuri?: string;
  /** 辞書が返す候補（辞書順。送りありでは語幹） */
  candidates: string[];
  /** 正解（送りありでは語幹） */
  expected: string;
  /** 手で与える話題。省略時は要約器が設定されていればそれで作る */
  topic?: string;
  note?: string;
};

/**
 * F1（候補生成）のケースの分類
 * - proper-noun: 前の文で定義された固有名詞（文脈から写せるかを見る）
 * - okuri-missing: 送り仮名を付けずに入力した用言（送りなしの読み全体を変換する）
 */
export type F1Category = "proper-noun" | "okuri-missing";

export type F1Case = {
  id: string;
  category: F1Category;
  before: string;
  after?: string;
  /** 読み（送りありでは送り仮名を除いた部分） */
  reading: string;
  /** 送り仮名（送りありのときだけ） */
  okuri?: string;
  /** 正解の表記（送りありでは送り仮名を含む全体） */
  expected: string;
  topic?: string;
  note?: string;
};

export const f2Cases: F2Case[] = [
  {
    id: "f2-hashi-chopsticks",
    category: "homophone-sentence",
    before: "食事のときは",
    after: "を使う。",
    reading: "はし",
    candidates: ["橋", "箸", "端"],
    expected: "箸",
  },
  {
    id: "f2-kagaku-chemistry",
    category: "homophone-sentence",
    before: "有機",
    after: "の実験を行った。",
    reading: "かがく",
    candidates: ["科学", "化学", "価額"],
    expected: "化学",
  },
  {
    id: "f2-kouen-lecture",
    category: "homophone-document",
    before: "来週、著名な物理学者が大学に来る。その",
    after: "を聴きに行く予定だ。",
    reading: "こうえん",
    candidates: ["公園", "講演", "公演", "後援"],
    expected: "講演",
    note: "「聴きに行く」だけでは公演と区別できない。物理学者は前の文にある",
  },
  {
    id: "f2-kanshou-art",
    category: "homophone-document",
    before: "美術館で印象派の展覧会が始まった。週末にゆっくり",
    after: "したい。",
    reading: "かんしょう",
    candidates: ["干渉", "観賞", "鑑賞", "感傷"],
    expected: "鑑賞",
    note: "変換中の文だけでは観賞・鑑賞を区別できない",
  },
  {
    id: "f2-kouen-park",
    category: "keep",
    before: "子供たちが",
    after: "で遊んでいる。",
    reading: "こうえん",
    candidates: ["公園", "講演", "公演", "後援"],
    expected: "公園",
  },
];

export const f1Cases: F1Case[] = [
  {
    id: "f1-proper-device",
    category: "proper-noun",
    before: "本研究では、新たに開発した燃焼器を蒼焔炉と名付けた。以下、",
    after: "の点火特性を示す。",
    reading: "そうえんろ",
    expected: "蒼焔炉",
  },
  {
    id: "f1-proper-person",
    category: "proper-noun",
    before: "物語の主人公は霧島朔夜という高校生である。ある日、",
    after: "は奇妙な手紙を受け取った。",
    reading: "きりしまさくや",
    expected: "霧島朔夜",
  },
  {
    id: "f1-okuri-kangaeru",
    category: "okuri-missing",
    before: "その件については、もう少し",
    after: "必要がある。",
    reading: "かんがえる",
    expected: "考える",
  },
];
