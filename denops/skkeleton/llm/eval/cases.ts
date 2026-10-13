/**
 * LLM 補助の評価用テストケース。
 *
 * ※ これらのケースはまだ実際の zenz で一度も実行していない。
 *   ケースと評価方法の計画が固まったら、ローカルで動かした zenz サーバに対して
 *   eval_test.ts を実行する（手順は README.md）。
 *
 * candidates は SKK-JISYO.L (skk-dev/dict) の順に、注釈（; 以降）を除いて書いている。
 * SKKELETON_EVAL_JISYO に辞書のパスを渡すと、実行時に辞書から読み直す。
 * 文脈（before / after）は、変換済みの文がバッファにある状態を想定して漢字かな交じりで書く。
 */

/**
 * F2（リランキング）の分類
 * - homophone-sentence: 同音異義語。正解の手がかりが変換中の文の中にある
 * - homophone-document: 同音異義語。手がかりが主に前の文にある（topic で拾えるかを見る）
 */
export type F2Category = "homophone-sentence" | "homophone-document";

export type F2Item = {
  /** カーソル前の文章。前の文を含めてよい（プロバイダ側で文単位に絞られる） */
  before: string;
  /** カーソル後の文章（送りありでは送り仮名より後ろ） */
  after?: string;
  /** 正解（送りありでは語幹） */
  expected: string;
  /** 手で与える話題。省略時は要約器が設定されていればそれで作る */
  topic?: string;
  note?: string;
};

/** 同じ読み・同じ辞書候補に対して、文脈を変えた複数のケース */
export type F2Group = {
  category: F2Category;
  /** 読み（送りありでは送り仮名を除いた部分。例: "はか"） */
  reading: string;
  /** 送り仮名（送りありのときだけ。例: "る"） */
  okuri?: string;
  /** 辞書が返す候補（辞書順。送りありでは語幹） */
  candidates: string[];
  items: F2Item[];
};

/**
 * F1（候補生成）の分類
 * - proper-noun: 前の文で定義された固有名詞（文脈から写せるかを見る）
 * - okuri-missing: 送り仮名の区切りを入れずに入力した用言
 *   （送りなしの読み全体で辞書を引くので候補が 0 件になり、F1 が動く）
 */
export type F1Category = "proper-noun" | "okuri-missing";

export type F1Case = {
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

export const f2Groups: F2Group[] = [
  // --- homophone-sentence ---
  {
    category: "homophone-sentence",
    reading: "はし",
    candidates: ["橋", "端", "箸", "梯", "觜"],
    items: [
      { before: "この", after: "渡るべからず", expected: "橋" },
      { before: "料理を", after: "で食べます", expected: "箸" },
      { before: "シーツの", after: "をつかんでたたみます", expected: "端" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "きょうか",
    candidates: ["強化", "教科", "教化", "狂歌", "供花", "鏡花"],
    items: [
      {
        before: "議論の内容は",
        after: "明日までにお送りします",
        expected: "今日か",
        note:
          "「今日か」は辞書の候補に無いので、並べ替えだけでは正解にできない",
      },
      { before: "彼は", after: "指定選手です", expected: "強化" },
      {
        before: "来年度までにこの部族の奴らを",
        after: "しなければならんのだ",
        expected: "教化",
      },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "かがく",
    candidates: ["科学", "化学", "価額", "下顎", "歌学"],
    items: [
      { before: "有機", after: "の実験で試薬を混ぜた", expected: "化学" },
      { before: "最新の", after: "技術で宇宙を探る", expected: "科学" },
      { before: "土地の", after: "を算定する", expected: "価額" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "きかい",
    candidates: ["機械", "機会", "器械", "奇怪", "喜界"],
    items: [
      { before: "工場の", after: "が故障した", expected: "機械" },
      { before: "またとない", after: "を逃した", expected: "機会" },
      { before: "体操の", after: "運動で金メダルを取った", expected: "器械" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "いし",
    candidates: ["石", "医師", "意思", "意志", "遺志"],
    items: [
      { before: "川原で平たい", after: "を拾った", expected: "石" },
      { before: "かかりつけの", after: "に相談した", expected: "医師" },
      { before: "本人の", after: "を確認してから契約する", expected: "意思" },
      { before: "彼は", after: "が強く、決して諦めない", expected: "意志" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "あつ",
    okuri: "い",
    candidates: ["熱", "暑", "厚", "篤"],
    items: [
      { before: "今日は", after: "ので冷房をつけた", expected: "暑" },
      { before: "このスープはまだ", after: "から気をつけて", expected: "熱" },
      { before: "辞書のように", after: "本を読んだ", expected: "厚" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "はか",
    okuri: "る",
    candidates: ["図", "測", "計", "量", "諮", "謀"],
    items: [
      { before: "メジャーで部屋の幅を", after: "。", expected: "測" },
      { before: "体重計で体重を", after: "。", expected: "量" },
      { before: "ストップウォッチで時間を", after: "。", expected: "計" },
      { before: "両国の関係改善を", after: "。", expected: "図" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "ほしょう",
    candidates: ["保証", "保障", "補償", "歩哨", "堡礁"],
    items: [
      {
        before: "この製品には一年間の",
        after: "が付いている",
        expected: "保証",
      },
      {
        before: "国民の安全を",
        after: "するのは国の責務だ",
        expected: "保障",
      },
      { before: "事故の被害者に損害を", after: "する", expected: "補償" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "たいしょう",
    candidates: ["対象", "大正", "大賞", "大将", "対照", "対称"],
    items: [
      { before: "この調査は高校生を", after: "に行った", expected: "対象" },
      {
        before: "左右",
        after: "の図形を描く",
        expected: "対称",
        note:
          "辞書の 6 番目なので、上位 5 件だけを並べ替える今の設定では届かない",
      },
      { before: "二人の性格は", after: "的だ", expected: "対照" },
    ],
  },

  // --- homophone-document ---
  {
    category: "homophone-document",
    reading: "すみ",
    candidates: ["隅", "炭", "墨", "角", "済", "済み", "須美", "須見"],
    items: [
      {
        before: "明日までに書類を提出してください。手続はすぐに",
        after: "ますからね",
        expected: "済み",
        note:
          "辞書の 6 番目なので、上位 5 件だけを並べ替える今の設定では届かない。" +
          "5 番目の「済」でも「済ますからね」と読める",
      },
      {
        before: "まだ見つからないのか！",
        after: "から隅まで探せ！",
        expected: "隅",
      },
      {
        before: "明日はついにBBQですね。",
        after: "の準備はできていますか？",
        expected: "炭",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "こうえん",
    candidates: ["公園", "講演", "公演", "後援", "高遠", "好演", "口演"],
    items: [
      {
        before: "来週、著名な物理学者が大学に来る。その",
        after: "は午後二時から始まる。",
        expected: "講演",
      },
      {
        before: "劇団の新作ミュージカルが初日を迎える。その",
        after: "は午後二時から始まる。",
        expected: "公演",
      },
      {
        before: "子供たちが外で遊びたがっている。近所の",
        after: "へ連れて行こう。",
        expected: "公園",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "かんしょう",
    candidates: ["鑑賞", "観賞", "干渉", "感傷", "完勝", "勧奨"],
    items: [
      {
        before: "美術館で印象派の展覧会が始まった。週末にゆっくり",
        after: "したい。",
        expected: "鑑賞",
      },
      {
        before: "庭の池に錦鯉を放した。毎朝ゆっくり",
        after: "している。",
        expected: "観賞",
      },
      {
        before: "隣国が我が国の内政に口を出してきた。これは明らかな",
        after: "だ。",
        expected: "干渉",
      },
      {
        before: "卒業式の帰りに母校の校舎を振り返った。少し",
        after: "的な気分になった。",
        expected: "感傷",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "きしゃ",
    candidates: ["記者", "汽車", "貴社", "帰社", "喜捨", "騎射"],
    items: [
      {
        before: "新聞社への就職が決まった。来月から",
        after: "として働く。",
        expected: "記者",
      },
      {
        before: "本日は直帰せず、会社に戻ります。十八時に",
        after: "する予定です。",
        expected: "帰社",
      },
      {
        before: "蒸気機関車の博物館を訪れた。昔の",
        after: "に乗れる展示もあった。",
        expected: "汽車",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "かいとう",
    candidates: ["回答", "解答", "解凍", "怪盗"],
    items: [
      {
        before: "数学の試験が終わりました。",
        after: "用紙を後ろから回してください。",
        expected: "解答",
      },
      {
        before: "冷凍庫から鶏肉を出した。電子レンジで",
        after: "してから焼く。",
        expected: "解凍",
      },
      {
        before: "アンケートへのご協力をお願いします。",
        after: "は来週まで受け付けます。",
        expected: "回答",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "しんちょう",
    candidates: ["慎重", "身長", "新潮", "伸長", "新調", "伸張"],
    items: [
      {
        before: "健康診断の結果が届いた。",
        after: "は去年より二センチ伸びていた。",
        expected: "身長",
      },
      {
        before: "来月、友人の結婚式がある。それに合わせてスーツを",
        after: "した。",
        expected: "新調",
      },
      {
        before: "この判断で会社の将来が決まる。",
        after: "に検討してほしい。",
        expected: "慎重",
      },
    ],
  },
];

export const f1Cases: F1Case[] = [
  {
    category: "proper-noun",
    before: "本研究では、新たに開発した燃焼器を蒼焔炉と名付けた。以下、",
    after: "の点火特性を示す。",
    reading: "そうえんろ",
    expected: "蒼焔炉",
  },
  {
    category: "proper-noun",
    before: "物語の主人公は霧島朔夜という高校生である。ある日、",
    after: "は奇妙な手紙を受け取った。",
    reading: "きりしまさくや",
    expected: "霧島朔夜",
  },
  {
    category: "proper-noun",
    before: "取引先は株式会社鳴瀬工機という。来週、",
    after: "の担当者が来社する。",
    reading: "なるせこうき",
    expected: "鳴瀬工機",
    note: "「なるせ」単独なら辞書に成瀬・鳴瀬があるが、読み全体では候補 0 件",
  },
  {
    category: "proper-noun",
    before: "新しい観測船の名前は雪嶺号に決まった。来月、",
    after: "が南極へ向けて出港する。",
    reading: "せつれいごう",
    expected: "雪嶺号",
  },
  {
    category: "okuri-missing",
    before: "その件については、もう少し",
    after: "必要がある。",
    reading: "かんがえる",
    expected: "考える",
  },
  {
    category: "okuri-missing",
    before: "古い手法に代わる",
    after: "方法を提案する。",
    reading: "あたらしい",
    expected: "新しい",
  },
  {
    category: "okuri-missing",
    before: "実験は来週",
    after: "予定です。",
    reading: "おこなう",
    expected: "行う",
  },
  {
    category: "okuri-missing",
    before: "重い机を一人で",
    after: "のは難しい。",
    reading: "うごかす",
    expected: "動かす",
  },
];
