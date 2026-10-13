/**
 * LLM 補助の評価用テストケース。
 *
 * ※ これらのケースはまだ実際の zenz で一度も実行していない。
 *   ケースと評価方法の計画が固まったら、ローカルで動かした zenz サーバに対して
 *   eval_test.ts を実行する（手順は README.md）。
 *
 * candidates は SKK-JISYO.L (skk-dev/dict) の先頭 10 件を、注釈（; 以降）を除いて辞書の順に書いている。
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
  {
    category: "homophone-sentence",
    reading: "はし",
    candidates: ["橋", "端", "箸", "梯", "觜", "枦", "走"],
    items: [
      { before: "この", after: "渡るべからず", expected: "橋" },
      { before: "料理を", after: "で食べます", expected: "箸" },
      { before: "シーツの", after: "をつかんでたたみます", expected: "端" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "きょうか",
    candidates: [
      "強化",
      "教科",
      "教化",
      "狂歌",
      "供花",
      "鏡花",
      "橋架",
      "凶禍",
      "莢果",
    ],
    items: [
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
    candidates: ["科学", "化学", "価額", "下顎", "歌学", "家学"],
    items: [
      { before: "有機", after: "の実験で試薬を混ぜた", expected: "化学" },
      { before: "最新の", after: "技術で宇宙を探る", expected: "科学" },
      { before: "土地の", after: "を算定する", expected: "価額" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "きかい",
    candidates: [
      "機械",
      "機会",
      "器械",
      "奇怪",
      "喜界",
      "貴会",
      "気塊",
      "棋界",
      "毀壊",
    ],
    items: [
      { before: "工場の", after: "が故障した", expected: "機械" },
      { before: "またとない", after: "を逃した", expected: "機会" },
      { before: "体操の", after: "運動で金メダルを取った", expected: "器械" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "いし",
    candidates: [
      "石",
      "医師",
      "意思",
      "意志",
      "遺志",
      "縊死",
      "遺址",
      "遺子",
      "頤使",
      "頤指",
    ],
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
    candidates: ["図", "測", "計", "量", "諮", "謀", "企", "圖"],
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
      { before: "国民の安全を", after: "するのは国の責務だ", expected: "保障" },
      { before: "事故の被害者に損害を", after: "する", expected: "補償" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "たいしょう",
    candidates: [
      "対象",
      "大正",
      "大賞",
      "大将",
      "対照",
      "対称",
      "大勝",
      "大笑",
      "対症",
      "隊商",
    ],
    items: [
      { before: "この調査は高校生を", after: "に行った", expected: "対象" },
      {
        before: "左右",
        after: "の図形を描く",
        expected: "対称",
        note: "辞書の 6 番目。並べ替える件数が 5 件だと届かない",
      },
      { before: "二人の性格は", after: "的だ", expected: "対照" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "かえ",
    okuri: "る",
    candidates: ["帰", "返", "還", "孵", "反", "替", "換", "歸", "皈"],
    items: [
      { before: "仕事を終えて家に", after: "。", expected: "帰" },
      { before: "温めていた卵がようやく", after: "。", expected: "孵" },
      { before: "名前を呼ばれてはっと我に", after: "。", expected: "返" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "あ",
    okuri: "う",
    candidates: ["合", "会", "遭", "逢", "遇", "會"],
    items: [
      { before: "駅で偶然友人に", after: "。", expected: "会" },
      { before: "旅行先でひどい事故に", after: "。", expected: "遭" },
      { before: "二人の意見がぴったり", after: "。", expected: "合" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "と",
    okuri: "る",
    candidates: ["取", "撮", "採", "摂", "捕", "獲", "録", "執", "盗", "穫"],
    items: [
      { before: "旅行先で記念の写真を", after: "。", expected: "撮" },
      { before: "夏休みに網で虫を", after: "。", expected: "捕" },
      { before: "今年は新卒を三名", after: "予定だ。", expected: "採" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "つと",
    okuri: "め",
    candidates: ["努", "務", "勤", "勉", "力"],
    items: [
      { before: "父は三十年間銀行に", after: "てきた。", expected: "勤" },
      { before: "今年は彼が会議の議長を", after: "る。", expected: "務" },
      { before: "問題の早期解決に", after: "ます。", expected: "努" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "おさ",
    okuri: "め",
    candidates: ["収", "納", "治", "修", "收"],
    items: [
      { before: "期限までに税金を", after: "る。", expected: "納" },
      { before: "昔、この国を", after: "ていた王がいた。", expected: "治" },
      { before: "大学で法学を", after: "た。", expected: "修" },
      { before: "新製品は大きな成功を", after: "た。", expected: "収" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "こうか",
    candidates: [
      "効果",
      "高価",
      "校歌",
      "硬化",
      "降下",
      "高架",
      "硬貨",
      "工科",
      "公課",
      "紅花",
    ],
    items: [
      { before: "薬の", after: "が現れてきた", expected: "効果" },
      {
        before: "自動販売機に百円",
        after: "を入れた",
        expected: "硬貨",
        note: "辞書の 7 番目。並べ替える件数が 5 件だと届かない",
      },
      { before: "卒業式で", after: "を歌った", expected: "校歌" },
      { before: "この宝石はとても", after: "だ", expected: "高価" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "じき",
    candidates: [
      "時期",
      "次期",
      "磁気",
      "磁器",
      "直",
      "時季",
      "自機",
      "時機",
      "自棄",
      "自記",
    ],
    items: [
      { before: "今はちょうど田植えの", after: "だ", expected: "時期" },
      {
        before: "カードの",
        after: "が弱くなって読み取れない",
        expected: "磁気",
      },
      { before: "彼は", after: "社長の最有力候補だ", expected: "次期" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "かんしん",
    candidates: [
      "関心",
      "感心",
      "汗疹",
      "歓心",
      "奸臣",
      "感震",
      "寒心",
      "甘心",
      "姦臣",
    ],
    items: [
      { before: "環境問題に強い", after: "を持っている", expected: "関心" },
      { before: "子供の礼儀正しさにすっかり", after: "した", expected: "感心" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "いがい",
    candidates: ["以外", "意外", "遺骸", "貽貝"],
    items: [
      { before: "関係者", after: "の立ち入りを禁止する", expected: "以外" },
      { before: "試験の結果は", after: "にも満点だった", expected: "意外" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "しゅうし",
    candidates: ["収支", "修士", "終始", "終止", "宗旨", "修史"],
    items: [
      { before: "今月の家計の", after: "は赤字だ", expected: "収支" },
      { before: "大学院で", after: "号を取った", expected: "修士" },
      { before: "会議は", after: "和やかな雰囲気だった", expected: "終始" },
    ],
  },
  {
    category: "homophone-sentence",
    reading: "せいかく",
    candidates: ["性格", "正確", "精確", "製革", "正格", "政客"],
    items: [
      {
        before: "この時計は一秒の狂いもなく",
        after: "に時を刻む",
        expected: "正確",
      },
      {
        before: "彼は明るい",
        after: "で誰とでも仲良くなれる",
        expected: "性格",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "すみ",
    candidates: [
      "隅",
      "炭",
      "墨",
      "角",
      "済",
      "済み",
      "須美",
      "須見",
      "陬",
      "純",
    ],
    items: [
      {
        before: "明日までに書類を提出してください。手続はすぐに",
        after: "ますからね",
        expected: "済み",
        note:
          "辞書の 6 番目。並べ替える件数が 5 件だと届かない。5 番目の「済」でも「済ますからね」と読める",
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
    candidates: [
      "公園",
      "講演",
      "公演",
      "後援",
      "高遠",
      "好演",
      "口演",
      "光塩",
      "高塩",
      "後縁",
    ],
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
    candidates: [
      "鑑賞",
      "観賞",
      "干渉",
      "感傷",
      "完勝",
      "勧奨",
      "緩衝",
      "環礁",
      "管掌",
      "観照",
    ],
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
    candidates: [
      "回答",
      "解答",
      "解凍",
      "怪盗",
      "会頭",
      "快投",
      "開頭",
      "快刀",
      "解糖",
      "解党",
    ],
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
    candidates: [
      "慎重",
      "身長",
      "新潮",
      "伸長",
      "新調",
      "伸張",
      "清朝",
      "志ん朝",
      "深長",
      "晨朝",
    ],
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
  {
    category: "homophone-document",
    reading: "きかん",
    candidates: [
      "期間",
      "機関",
      "基幹",
      "帰還",
      "器官",
      "季刊",
      "既刊",
      "気管",
      "旗艦",
      "軌間",
    ],
    items: [
      {
        before: "宇宙飛行士が半年ぶりに地球へ戻った。無事の",
        after: "を祝う式典が開かれた。",
        expected: "帰還",
      },
      {
        before: "風邪をひいて咳が止まらない。どうやら",
        after: "に炎症があるらしい。",
        expected: "気管",
        note: "辞書の 8 番目。並べ替える件数が 5 件だと届かない",
      },
      {
        before: "キャンペーンは来月から始まる。",
        after: "は三十日間だ。",
        expected: "期間",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "こうしょう",
    candidates: [
      "交渉",
      "公称",
      "高尚",
      "考証",
      "校章",
      "公証",
      "工商",
      "鉱床",
      "工廠",
      "哄笑",
    ],
    items: [
      {
        before: "労働組合が賃上げを要求している。会社との",
        after: "は来週から始まる。",
        expected: "交渉",
      },
      {
        before: "時代劇の衣装を作っている。細かな時代",
        after: "にもこだわった。",
        expected: "考証",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "しこう",
    candidates: [
      "思考",
      "施行",
      "施工",
      "指向",
      "志向",
      "試行",
      "嗜好",
      "至高",
      "歯垢",
      "紙工",
    ],
    items: [
      {
        before: "新しい法律が国会で成立した。来月から",
        after: "される。",
        expected: "施行",
      },
      {
        before: "うまくいくまで何度も試した。",
        after: "錯誤の連続だった。",
        expected: "試行",
        note: "辞書の 6 番目。並べ替える件数が 5 件だと届かない",
      },
      {
        before: "コーヒーや紅茶の好みは人それぞれだ。",
        after: "品の売上が伸びている。",
        expected: "嗜好",
        note: "辞書の 7 番目。並べ替える件数が 5 件だと届かない",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "ようけん",
    candidates: ["要件", "用件", "洋犬", "楊堅"],
    items: [
      {
        before: "お電話ありがとうございます。ご",
        after: "を伺います。",
        expected: "用件",
      },
      {
        before: "この奨学金には応募の条件がある。申請には",
        after: "を満たす必要がある。",
        expected: "要件",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "かいほう",
    candidates: [
      "開放",
      "解放",
      "会報",
      "解法",
      "介抱",
      "快方",
      "回報",
      "海法",
      "海北",
      "開法",
    ],
    items: [
      {
        before: "人質事件が解決した。全員が無事に",
        after: "された。",
        expected: "解放",
      },
      {
        before: "妹の熱がようやく下がってきた。",
        after: "に向かっている。",
        expected: "快方",
        note: "辞書の 6 番目。並べ替える件数が 5 件だと届かない",
      },
      {
        before: "酔いつぶれた友人を家まで送った。一晩中",
        after: "した。",
        expected: "介抱",
      },
      {
        before: "週末は地域の子供たちが学校に集まる。校庭を",
        after: "している。",
        expected: "開放",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "ほけん",
    candidates: ["保険", "保健"],
    items: [
      {
        before: "車を買い替えた。自動車",
        after: "の契約も見直した。",
        expected: "保険",
      },
      {
        before: "けがをした生徒がいた。すぐに",
        after: "室へ連れて行った。",
        expected: "保健",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "しょうかい",
    candidates: ["紹介", "照会", "商会", "詳解", "哨戒", "小海"],
    items: [
      {
        before: "新しい同僚が着任した。皆さんに",
        after: "します。",
        expected: "紹介",
      },
      {
        before: "口座の残高を確かめたい。銀行に",
        after: "した。",
        expected: "照会",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "せいき",
    candidates: [
      "世紀",
      "正規",
      "性器",
      "生気",
      "精気",
      "精機",
      "生起",
      "盛期",
      "西紀",
      "製機",
    ],
    items: [
      {
        before: "契約社員として三年働いた。来月から",
        after: "雇用になる。",
        expected: "正規",
      },
      {
        before: "徹夜明けで顔色が悪い。",
        after: "のない顔をしている。",
        expected: "生気",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "かてい",
    candidates: [
      "家庭",
      "過程",
      "課程",
      "仮定",
      "河底",
      "下底",
      "嘉禎",
      "河堤",
    ],
    items: [
      {
        before: "結果だけでなく努力も大事だ。その",
        after: "も評価したい。",
        expected: "過程",
      },
      {
        before: "この証明は背理法を使う。結論が偽だと",
        after: "する。",
        expected: "仮定",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "いじょう",
    candidates: ["以上", "異常", "異状", "移譲", "委譲", "移乗", "囲繞", "≧"],
    items: [
      {
        before: "検査の数値がおかしい。何らかの",
        after: "があるかもしれない。",
        expected: "異常",
      },
      {
        before: "権限の一部を地方に移すことになった。国からの",
        after: "が進む。",
        expected: "移譲",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "きこう",
    candidates: [
      "機構",
      "紀行",
      "気候",
      "寄稿",
      "寄港",
      "気功",
      "起工",
      "機工",
      "奇行",
      "帰港",
    ],
    items: [
      {
        before: "この地方は一年を通じて暖かい。温暖な",
        after: "で過ごしやすい。",
        expected: "気候",
      },
      {
        before: "旅先での出来事を本にまとめた。",
        after: "文として出版する。",
        expected: "紀行",
      },
      {
        before: "大型客船が横浜に着いた。三日間",
        after: "する予定だ。",
        expected: "寄港",
      },
      {
        before: "雑誌の編集者から依頼が来た。来月号に",
        after: "する。",
        expected: "寄稿",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "しじ",
    candidates: [
      "支持",
      "指示",
      "私事",
      "師事",
      "榻",
      "四時",
      "指事",
      "死児",
      "指似",
    ],
    items: [
      {
        before: "選挙の結果が発表された。新しい政党が若者の",
        after: "を集めた。",
        expected: "支持",
      },
      {
        before: "現場の作業員が困っている。上司の",
        after: "を待っている。",
        expected: "指示",
      },
      {
        before: "若い頃、有名な陶芸家に弟子入りした。十年間",
        after: "した。",
        expected: "師事",
      },
    ],
  },
  {
    category: "homophone-document",
    reading: "たいせい",
    candidates: [
      "体制",
      "大成",
      "態勢",
      "耐性",
      "体勢",
      "大勢",
      "大聖",
      "大政",
      "対生",
      "胎生",
    ],
    items: [
      {
        before: "細菌が抗生物質に慣れてしまった。薬への",
        after: "ができている。",
        expected: "耐性",
      },
      {
        before: "相手の技で倒されそうになった。",
        after: "を立て直した。",
        expected: "体勢",
      },
      {
        before: "台風が近づいている。万全の",
        after: "で備える。",
        expected: "態勢",
      },
    ],
  },
];

export const f1Cases: F1Case[] = [
  {
    category: "proper-noun",
    reading: "そうえんろ",
    before: "本研究では、新たに開発した燃焼器を蒼焔炉と名付けた。以下、",
    after: "の点火特性を示す。",
    expected: "蒼焔炉",
  },
  {
    category: "proper-noun",
    reading: "きりしまさくや",
    before: "物語の主人公は霧島朔夜という高校生である。ある日、",
    after: "は奇妙な手紙を受け取った。",
    expected: "霧島朔夜",
  },
  {
    category: "proper-noun",
    reading: "なるせこうき",
    before: "取引先は株式会社鳴瀬工機という。来週、",
    after: "の担当者が来社する。",
    expected: "鳴瀬工機",
  },
  {
    category: "proper-noun",
    reading: "せつれいごう",
    before: "新しい観測船の名前は雪嶺号に決まった。来月、",
    after: "が南極へ向けて出港する。",
    expected: "雪嶺号",
  },
  {
    category: "proper-noun",
    reading: "あまぎりみなと",
    before:
      "新しく赴任した教師の名前は天霧湊という。数学を担当する。生徒たちは",
    after: "先生の授業を楽しみにしている。",
    expected: "天霧湊",
  },
  {
    category: "proper-noun",
    reading: "しののめでんし",
    before: "当社の新しい取引先は東雲電子である。来月から",
    after: "と共同で開発を始める。",
    expected: "東雲電子",
  },
  {
    category: "proper-noun",
    reading: "くろがねやま",
    before: "登山部は夏に黒鉄山へ登る予定だ。",
    after: "の山頂からは海が見えるらしい。",
    expected: "黒鉄山",
  },
  {
    category: "proper-noun",
    reading: "ひいらぎそう",
    before: "今回の合宿では柊荘という民宿に泊まる。",
    after: "は駅から歩いて五分だ。",
    expected: "柊荘",
  },
  {
    category: "proper-noun",
    reading: "あおばねこうぼう",
    before: "この陶器は青羽工房で買った。",
    after: "の器は軽くて丈夫だ。",
    expected: "青羽工房",
  },
  {
    category: "proper-noun",
    reading: "みかがみこ",
    before: "村の北には水鏡湖という湖がある。冬になると",
    after: "は一面凍る。",
    expected: "水鏡湖",
  },
  {
    category: "proper-noun",
    reading: "つきしろりお",
    before: "主人公の幼なじみは月城理央という少女だ。",
    after: "は昔から絵が得意だった。",
    expected: "月城理央",
  },
  {
    category: "proper-noun",
    reading: "かざはやまる",
    before: "祖父の漁船は風早丸という。今朝も",
    after: "は港を出ていった。",
    expected: "風早丸",
  },
  {
    category: "proper-noun",
    reading: "はくようかい",
    before:
      "卒業生の同窓会は白楊会と呼ばれている。会員は三百人ほどいる。今年の",
    after: "の総会は五月に開く。",
    expected: "白楊会",
  },
  {
    category: "proper-noun",
    reading: "きつねびまつり",
    before: "この町では毎年秋に狐火祭が開かれる。今年の",
    after: "は三日間行われる。",
    expected: "狐火祭",
  },
  {
    category: "proper-noun",
    reading: "せいらんだいがく",
    before: "姉は青嵐大学に通っている。",
    after: "の図書館は夜十時まで開いている。",
    expected: "青嵐大学",
  },
  {
    category: "proper-noun",
    reading: "えんじゅかがく",
    before: "原料は槐化学から仕入れている。",
    after: "の製品は品質が安定している。",
    expected: "槐化学",
  },
  {
    category: "proper-noun",
    reading: "ほしかげどう",
    before: "駅前に星影堂という古本屋がある。店主は無口な老人だ。",
    after: "では珍しい本がよく見つかる。",
    expected: "星影堂",
  },
  {
    category: "proper-noun",
    reading: "あかつきさんごう",
    before: "新型の気象衛星は暁三号と名付けられた。",
    after: "は来年打ち上げられる。",
    expected: "暁三号",
  },
  {
    category: "proper-noun",
    reading: "しらぬいけんじ",
    before: "事件を担当したのは不知火賢治という刑事だった。",
    after: "はすぐに現場へ向かった。",
    expected: "不知火賢治",
  },
  {
    category: "proper-noun",
    reading: "こがねむぎ",
    before: "この地方で育てられている新しい品種の小麦は黄金麦と呼ばれる。",
    after: "は寒さに強い。",
    expected: "黄金麦",
  },
  {
    category: "proper-noun",
    reading: "るりかわ",
    before: "町の中心を瑠璃川が流れている。夏には",
    after: "で花火大会がある。",
    expected: "瑠璃川",
  },
  {
    category: "proper-noun",
    reading: "くもいでら",
    before: "山の中腹に雲居寺という古い寺がある。春になると",
    after: "の桜が見事に咲く。",
    expected: "雲居寺",
  },
  {
    category: "proper-noun",
    reading: "ひぐらしそう",
    before: "大学時代は蜩荘という古いアパートに住んでいた。",
    after: "の家賃は月に二万円だった。",
    expected: "蜩荘",
  },
  {
    category: "proper-noun",
    reading: "たかつきせいやく",
    before: "この薬は高槻製薬が開発した。",
    after: "は新しい工場を建てる予定だ。",
    expected: "高槻製薬",
  },
  {
    category: "proper-noun",
    reading: "みずはらりんか",
    before: "今回の主演は新人の水原凛花に決まった。",
    after: "は撮影前から役作りを始めた。",
    expected: "水原凛花",
  },
  {
    category: "proper-noun",
    reading: "かげろうしき",
    before: "この方式を陽炎式と呼ぶことにする。",
    after: "の利点は構造が単純なことだ。",
    expected: "陽炎式",
  },
  {
    category: "proper-noun",
    reading: "てんろうかく",
    before: "今夜の宿は天狼閣という旅館だ。",
    after: "の露天風呂は海に面している。",
    expected: "天狼閣",
  },
  {
    category: "proper-noun",
    reading: "こうさんそうち",
    before: "本研究では高温酸化試験装置（以下、高酸装置）を用いた。",
    after: "の温度は千度まで上げられる。",
    expected: "高酸装置",
  },
  {
    category: "proper-noun",
    reading: "ねむのきがくえん",
    before: "息子は合歓木学園という小学校に通っている。",
    after: "の運動会は十月にある。",
    expected: "合歓木学園",
  },
  {
    category: "proper-noun",
    reading: "しおさいせん",
    before: "海沿いを走る鉄道は潮騒線と呼ばれている。",
    after: "の車窓からは海がよく見える。",
    expected: "潮騒線",
  },
  {
    category: "proper-noun",
    reading: "すいふうどう",
    before: "お土産は翠風堂の和菓子にした。",
    after: "の羊羹は甘さ控えめだ。",
    expected: "翠風堂",
  },
  {
    category: "proper-noun",
    reading: "いわくらまこと",
    before:
      "新しい部長は岩倉真琴という人だ。前の会社では営業をしていたらしい。",
    after: "さんは今日から出社する。",
    expected: "岩倉真琴",
  },
  {
    category: "proper-noun",
    reading: "ぎんなんざか",
    before: "家の前の坂は銀杏坂と呼ばれている。秋になると",
    after: "は黄色く染まる。",
    expected: "銀杏坂",
  },
  {
    category: "proper-noun",
    reading: "ほむらりゅう",
    before: "祖母は焔流という生け花の流派に属している。",
    after: "の作品展が来月開かれる。",
    expected: "焔流",
  },
  {
    category: "proper-noun",
    reading: "こおりやまげんぞう",
    before: "物語の悪役は氷山源蔵という男だ。",
    after: "は町の金をすべて奪った。",
    expected: "氷山源蔵",
  },
  {
    category: "proper-noun",
    reading: "つばくろしょうてん",
    before: "米はいつも燕商店で買っている。",
    after: "は創業百年の老舗だ。",
    expected: "燕商店",
  },
  {
    category: "proper-noun",
    reading: "こはくしき",
    before: "この新しい保存法を琥珀式と名付けた。",
    after: "なら食品が一年もつ。",
    expected: "琥珀式",
  },
  {
    category: "proper-noun",
    reading: "てんしょうけいかく",
    before: "プロジェクトの名前は天翔計画に決まった。",
    after: "では新型の飛行機を開発する。",
    expected: "天翔計画",
  },
  {
    category: "proper-noun",
    reading: "みなせゆずる",
    before: "依頼人は水無瀬譲と名乗った。年齢は六十歳くらいに見えた。",
    after: "は古い屋敷に一人で住んでいるという。",
    expected: "水無瀬譲",
  },
  {
    category: "proper-noun",
    reading: "あさなぎまる",
    before: "島へ渡るフェリーは朝凪丸という。",
    after: "は一日に三便出ている。",
    expected: "朝凪丸",
  },
  {
    category: "proper-noun",
    reading: "ゆうげつかん",
    before: "結婚式は夕月館で挙げることにした。",
    after: "の庭園では四季折々の花が楽しめる。",
    expected: "夕月館",
  },
  {
    category: "proper-noun",
    reading: "じんらいでんき",
    before: "競合他社の迅雷電機が新製品を発表した。",
    after: "の製品は価格が安い。",
    expected: "迅雷電機",
  },
  {
    category: "proper-noun",
    reading: "のわきむら",
    before: "祖父母は野分村という山あいの村に住んでいる。",
    after: "には電車が通っていない。",
    expected: "野分村",
  },
  {
    category: "proper-noun",
    reading: "しらさぎだい",
    before: "新しい家は白鷺台という住宅地にある。",
    after: "は駅から少し遠い。",
    expected: "白鷺台",
  },
  {
    category: "proper-noun",
    reading: "おぼろぐさ",
    before: "この島には朧草という珍しい植物が生えている。",
    after: "は夜になると淡く光る。",
    expected: "朧草",
  },
  {
    category: "proper-noun",
    reading: "あかねぼし",
    before: "観測チームは新しい彗星を茜星と名付けた。",
    after: "は来月もっとも明るくなる。",
    expected: "茜星",
  },
  {
    category: "proper-noun",
    reading: "いずみさわこういち",
    before: "論文の共著者は泉沢晃一である。",
    after: "は実験の設計を担当した。",
    expected: "泉沢晃一",
  },
  {
    category: "proper-noun",
    reading: "へきかいこうこう",
    before: "弟は碧海高校に合格した。",
    after: "は県内でも有数の進学校だ。",
    expected: "碧海高校",
  },
  {
    category: "proper-noun",
    reading: "ほたるいしやき",
    before: "この町の名産は蛍石焼という陶器だ。",
    after: "の皿は青い色が美しい。",
    expected: "蛍石焼",
  },
  {
    category: "proper-noun",
    reading: "ぎんれいそう",
    before: "山小屋の名前は銀嶺荘という。標高二千メートルの尾根にある。",
    after: "には今夜十人が泊まる。",
    expected: "銀嶺荘",
  },
  {
    category: "okuri-missing",
    reading: "かんがえる",
    before: "その件については、もう少し",
    after: "必要がある。",
    expected: "考える",
  },
  {
    category: "okuri-missing",
    reading: "あたらしい",
    before: "古い手法に代わる",
    after: "方法を提案する。",
    expected: "新しい",
  },
  {
    category: "okuri-missing",
    reading: "おこなう",
    before: "実験は来週",
    after: "予定です。",
    expected: "行う",
  },
  {
    category: "okuri-missing",
    reading: "うごかす",
    before: "重い机を一人で",
    after: "のは難しい。",
    expected: "動かす",
  },
  {
    category: "okuri-missing",
    reading: "たべた",
    before: "昨日は友人と寿司を",
    after: "。",
    expected: "食べた",
  },
  {
    category: "okuri-missing",
    reading: "はしった",
    before: "駅まで全力で",
    after: "。",
    expected: "走った",
  },
  {
    category: "okuri-missing",
    reading: "おもいます",
    before: "その意見は正しいと",
    after: "。",
    expected: "思います",
  },
  {
    category: "okuri-missing",
    reading: "しらべる",
    before: "原因を詳しく",
    after: "必要がある。",
    expected: "調べる",
  },
  {
    category: "okuri-missing",
    reading: "うつくしい",
    before: "山頂から見た景色はとても",
    after: "。",
    expected: "美しい",
  },
  {
    category: "okuri-missing",
    reading: "むずかしい",
    before: "この問題は思ったより",
    after: "。",
    expected: "難しい",
  },
  {
    category: "okuri-missing",
    reading: "たのしかった",
    before: "昨日の旅行はとても",
    after: "。",
    expected: "楽しかった",
  },
  {
    category: "okuri-missing",
    reading: "はなした",
    before: "そのことは母にも",
    after: "。",
    expected: "話した",
  },
  {
    category: "okuri-missing",
    reading: "よんだ",
    before: "その本は学生時代に",
    after: "。",
    expected: "読んだ",
  },
  {
    category: "okuri-missing",
    reading: "おしえる",
    before: "週末は子供に算数を",
    after: "。",
    expected: "教える",
  },
  {
    category: "okuri-missing",
    reading: "つかう",
    before: "この道具は木を削るときに",
    after: "。",
    expected: "使う",
  },
  {
    category: "okuri-missing",
    reading: "はじめる",
    before: "来月から新しい研究を",
    after: "予定だ。",
    expected: "始める",
  },
  {
    category: "okuri-missing",
    reading: "おわった",
    before: "ようやく長い会議が",
    after: "。",
    expected: "終わった",
  },
  {
    category: "okuri-missing",
    reading: "ちいさい",
    before: "この部屋は思ったより",
    after: "。",
    expected: "小さい",
  },
  {
    category: "okuri-missing",
    reading: "あかるい",
    before: "南向きの部屋は日差しが入って",
    after: "。",
    expected: "明るい",
  },
  {
    category: "okuri-missing",
    reading: "さむかった",
    before: "今朝はとても",
    after: "。",
    expected: "寒かった",
  },
  {
    category: "okuri-missing",
    reading: "ねむい",
    before: "昨夜は遅くまで起きていたので",
    after: "。",
    expected: "眠い",
  },
  {
    category: "okuri-missing",
    reading: "いそがしい",
    before: "年度末は仕事が",
    after: "。",
    expected: "忙しい",
  },
  {
    category: "okuri-missing",
    reading: "あるいて",
    before: "駅から会社まで",
    after: "十分かかる。",
    expected: "歩いて",
  },
  {
    category: "okuri-missing",
    reading: "わすれた",
    before: "傘を電車に",
    after: "。",
    expected: "忘れた",
  },
  {
    category: "okuri-missing",
    reading: "おぼえる",
    before: "新しい単語を毎日十個",
    after: "。",
    expected: "覚える",
  },
  {
    category: "okuri-missing",
    reading: "えらぶ",
    before: "プレゼントを",
    after: "のに時間がかかった。",
    expected: "選ぶ",
  },
  {
    category: "okuri-missing",
    reading: "たすける",
    before: "困っている人を",
    after: "のは当然だ。",
    expected: "助ける",
  },
  {
    category: "okuri-missing",
    reading: "はこぶ",
    before: "重い荷物を二階まで",
    after: "。",
    expected: "運ぶ",
  },
  {
    category: "okuri-missing",
    reading: "あつめる",
    before: "子供の頃は切手を",
    after: "のが趣味だった。",
    expected: "集める",
  },
  {
    category: "okuri-missing",
    reading: "しずかな",
    before: "図書館は",
    after: "場所だ。",
    expected: "静かな",
  },
  {
    category: "okuri-missing",
    reading: "すばやく",
    before: "危険に気づいて",
    after: "身をかわした。",
    expected: "素早く",
  },
  {
    category: "okuri-missing",
    reading: "みじかい",
    before: "夏休みは思ったより",
    after: "。",
    expected: "短い",
  },
  {
    category: "okuri-missing",
    reading: "やすかった",
    before: "このシャツはセールで",
    after: "。",
    expected: "安かった",
  },
  {
    category: "okuri-missing",
    reading: "つよい",
    before: "今日は風が",
    after: "。",
    expected: "強い",
  },
  {
    category: "okuri-missing",
    reading: "おくった",
    before: "昨日、取引先に見積書を",
    after: "。",
    expected: "送った",
  },
  {
    category: "okuri-missing",
    reading: "うけとった",
    before: "注文した本を今朝",
    after: "。",
    expected: "受け取った",
  },
  {
    category: "okuri-missing",
    reading: "ならべる",
    before: "机を一列に",
    after: "。",
    expected: "並べる",
  },
  {
    category: "okuri-missing",
    reading: "くらべる",
    before: "二つの案を",
    after: "と、前者のほうが安い。",
    expected: "比べる",
  },
  {
    category: "okuri-missing",
    reading: "ふえた",
    before: "最近、外国人観光客が",
    after: "。",
    expected: "増えた",
  },
  {
    category: "okuri-missing",
    reading: "へった",
    before: "今年は売上が大きく",
    after: "。",
    expected: "減った",
  },
  {
    category: "okuri-missing",
    reading: "しんじる",
    before: "私は彼の言葉を",
    after: "。",
    expected: "信じる",
  },
  {
    category: "okuri-missing",
    reading: "わらった",
    before: "その冗談に皆が",
    after: "。",
    expected: "笑った",
  },
  {
    category: "okuri-missing",
    reading: "なげた",
    before: "ピッチャーが速い球を",
    after: "。",
    expected: "投げた",
  },
  {
    category: "okuri-missing",
    reading: "よろこんだ",
    before: "合格の知らせに家族みんなが",
    after: "。",
    expected: "喜んだ",
  },
  {
    category: "okuri-missing",
    reading: "かなしい",
    before: "友人との別れはとても",
    after: "。",
    expected: "悲しい",
  },
  {
    category: "okuri-missing",
    reading: "ならった",
    before: "子供の頃にピアノを",
    after: "。",
    expected: "習った",
  },
  {
    category: "okuri-missing",
    reading: "ひらいた",
    before: "部屋が暑いので窓を",
    after: "。",
    expected: "開いた",
  },
  {
    category: "okuri-missing",
    reading: "のぼった",
    before: "去年の夏に富士山に",
    after: "。",
    expected: "登った",
  },
  {
    category: "okuri-missing",
    reading: "かえした",
    before: "借りていた本を図書館に",
    after: "。",
    expected: "返した",
  },
  {
    category: "okuri-missing",
    reading: "やさしい",
    before: "彼女は誰にでも",
    after: "。",
    expected: "優しい",
  },
  {
    category: "okuri-missing",
    reading: "すわった",
    before: "公園のベンチに",
    after: "。",
    expected: "座った",
  },
  {
    category: "okuri-missing",
    reading: "うれしい",
    before: "合格できてとても",
    after: "。",
    expected: "嬉しい",
  },
  {
    category: "okuri-missing",
    reading: "はたらく",
    before: "来年から東京で",
    after: "ことになった。",
    expected: "働く",
  },
];
