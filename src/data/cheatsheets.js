// 第二種電気工事士試験 最重要暗記早見表マスターデータ
// 各問題の「試験直前！重要暗記ポイント」から深掘りして一覧で頭に入れるチートシート

export const CHEATSHEETS = {
  // 1. 電線の許容電流（単線・より線）
  wire_allowable_current: {
    id: 'wire_allowable_current',
    title: '電線の許容電流 早見表（単線・より線）',
    category: '電気理論・配線設計',
    badge: '最重要・必修',
    mnemonics: '「ニナ(27)・サンゴ(35)・シハ(48)」で覚える！',
    headers: ['種類', 'サイズ・公称断面積', '許容電流', '備考・覚え方'],
    rows: [
      { col1: '単線', col2: '直径 1.6 mm', col3: '27 A', col4: 'ニナ (27)', highlight: false },
      { col1: '単線', col2: '直径 2.0 mm', col3: '35 A', col4: 'サンゴ (35)', highlight: false },
      { col1: '単線', col2: '直径 2.6 mm', col3: '48 A', col4: 'シハ (48)', highlight: false },
      { col1: '単線', col2: '直径 3.2 mm', col3: '62 A', col4: 'ムニ (62)', highlight: false },
      { col1: 'より線', col2: '2.0 mm²', col3: '27 A', col4: '1.6mm単線と同等', highlight: false },
      { col1: 'より線', col2: '3.5 mm²', col3: '37 A', col4: 'ミナ (37) ★試験超頻出！', highlight: true },
      { col1: 'より線', col2: '5.5 mm²', col3: '49 A', col4: '2.0mm単線より上', highlight: false },
      { col1: 'より線', col2: '8.0 mm²', col3: '61 A', col4: '2.6mm単線より上', highlight: false }
    ],
    note: '※ 周囲温度30℃以下・絶縁電線（IV線）単体の場合。管に収める場合は「電流減少係数」を掛け算します。'
  },

  // 2. 電流減少係数
  current_reduction_factor: {
    id: 'current_reduction_factor',
    title: '電流減少係数 早見表（管内電線数）',
    category: '配線設計・計算',
    badge: '最重要・必修',
    mnemonics: '「ナナ・ロクサン・ゴロク・シク」',
    headers: ['同一管内の電線数', '電流減少係数', '覚え方のリズム'],
    rows: [
      { col1: '3 本 以下', col2: '0.70', col3: 'ナナ (0.70)', highlight: false },
      { col1: '4 本', col2: '0.63', col3: 'ロクサン (0.63) ★超頻出！', highlight: true },
      { col1: '5 〜 6 本', col2: '0.56', col3: 'ゴロク (0.56)', highlight: false },
      { col1: '7 〜 15 本', col2: '0.49', col3: 'シク (0.49)', highlight: false }
    ],
    note: '※ 電線数が多いほど熱がこもるため、流せる電流が小さくなります。計算結果の端数は「7捨8入」または通常切り捨てます。'
  },

  // 3. 幹線の許容電流判定
  mains_current: {
    id: 'mains_current',
    title: '幹線の許容電流（IA）計算判定ルール',
    category: '配線設計・計算',
    badge: '計算の定番',
    mnemonics: 'モーター合計（IM）が50A以下なら1.25倍、50A超なら1.1倍！',
    headers: ['条件判定', '幹線電線の許容電流（IA）の計算式'],
    rows: [
      { col1: 'IM ≦ IH（電熱器の方が多い）', col2: 'IA ≧ IM + IH（そのまま合算）', highlight: false },
      { col1: 'IM > IH かつ IM ≦ 50 A', col2: 'IA ≧ 1.25 × IM + IH ★超頻出！', highlight: true },
      { col1: 'IM > IH かつ IM > 50 A', col2: 'IA ≧ 1.10 × IM + IH', highlight: false }
    ],
    note: '※ IM: 電動機（モーター）の定格電流合計、IH: 電熱器等の定格電流合計。'
  },

  // 4. 分岐回路と電線太さ・コンセント定格
  branch_circuit: {
    id: 'branch_circuit',
    title: '分岐回路の過電流遮断器・電線太さ・コンセント定格 一覧表',
    category: '配線設計・保安',
    badge: '配線図・一般頻出',
    mnemonics: '遮断器定格とコンセント定格は「同じ」か「1ランク下」までOK！',
    headers: ['分岐回路の定格', '電線の最小太さ', '接続できるコンセント定格'],
    rows: [
      { col1: '15 A （ヒューズ）', col2: '直径 1.6 mm 以上', col3: '15 A 以下', highlight: false },
      { col1: '20 A （配線用遮断器）', col2: '直径 1.6 mm 以上 ★最頻出', col3: '20 A 以下（15A or 20A）', highlight: true },
      { col1: '30 A', col2: '直径 2.6 mm 以上 (5.5 mm²)', col3: '20 A 以上 30 A 以下', highlight: true },
      { col1: '40 A', col2: '8 mm² 以上', col3: '30 A 以上 40 A 以下', highlight: false },
      { col1: '50 A', col2: '14 mm² 以上', col3: '40 A 以上 50 A 以下', highlight: false }
    ],
    note: '※ 20A配線用遮断器の分岐回路には、通常の15Aコンセントも取り付けられます！'
  },

  // 5. 分岐遮断器の取付距離制限
  branch_breaker_distance: {
    id: 'branch_breaker_distance',
    title: '分岐箇所の過電流遮断器 取付距離ルール（3m・8m）',
    category: '配線設計・保安',
    badge: '頻出ルール',
    mnemonics: '「3m以内なら無制限」「8m以下なら35%」「8m超なら55%」',
    headers: ['幹線からの電線長さ', '分岐電線の許容電流（IW）条件'],
    rows: [
      { col1: '3 m 以下', col2: '制限なし（いくら細くてもOK）', highlight: false },
      { col1: '3 m 超 〜 8 m 以下', col2: '幹線の遮断器定格（IB）の 35 % 以上 ★頻出', highlight: true },
      { col1: '8 m を超える場合', col2: '幹線の遮断器定格（IB）の 55 % 以上', highlight: true }
    ],
    note: '※ 原則は3m以内ですが、太い電線を使えば遠くまで遮断器なしで引くことができます。'
  },

  // 6. リングスリーブ刻印マーク
  ring_sleeve_crimp: {
    id: 'ring_sleeve_crimp',
    title: 'リングスリーブ（E形）圧着マーク 組み合わせ早見表',
    category: '技能・工具・鑑別',
    badge: '鑑別・技能 最重要',
    mnemonics: '「1.6が2本だけなら ○（極小）！ それ以外は小か中！」',
    headers: ['接続する電線（VVF 1.6mm / 2.0mm）', '使用スリーブ', '圧着ダイス刻印マーク'],
    rows: [
      { col1: '1.6 mm × 2 本', col2: '小スリーブ', col3: '○ （極小） ★最頻出！', highlight: true },
      { col1: '1.6 mm × 3 〜 4 本', col2: '小スリーブ', col3: '小', highlight: true },
      { col1: '1.6 mm × 1本 ＋ 2.0 mm × 1本', col2: '小スリーブ', col3: '小', highlight: true },
      { col1: '2.0 mm × 2 本', col2: '小スリーブ', col3: '小', highlight: false },
      { col1: '1.6 mm × 5 〜 6 本', col2: '中スリーブ', col3: '中', highlight: false },
      { col1: '1.6 mm × 3本 ＋ 2.0 mm × 1本', col2: '中スリーブ', col3: '中', highlight: false },
      { col1: '2.0 mm × 3 〜 4 本', col2: '中スリーブ', col3: '中', highlight: false }
    ],
    note: '※ 電工試験で出るのは「○」「小」「中」の3種類です。「大」は第二種では原則出題されません。'
  },

  // 7. 絶縁抵抗基準値
  insulation_resistance: {
    id: 'insulation_resistance',
    title: '電路の絶縁抵抗 基準値 一覧表',
    category: '測定・検査・法令',
    badge: '測定・検査 最重要',
    mnemonics: '「イ・ロ・ハ ➔ 0.1 ・ 0.2 ・ 0.4 MΩ」',
    headers: ['使用電圧の区分', '対象となる回路', '絶縁抵抗値の最小基準'],
    rows: [
      { col1: '対地電圧 150 V 以下', col2: '単相100V、単相3線式100/200V ★家庭用', col3: '0.1 MΩ 以上 ★最頻出', highlight: true },
      { col1: '300V以下（対地電圧150V超）', col2: '三相3線式200V（動力回路など）', col3: '0.2 MΩ 以上', highlight: true },
      { col1: '300 V を超える低圧', col2: '工場等の400V回路など', col3: '0.4 MΩ 以上', highlight: false }
    ],
    note: '※ 単相3線式100/200Vは中性線が接地されているため「対地電圧は100V」。基準値は0.1MΩ以上です！'
  },

  // 8. 接地工事
  grounding_work: {
    id: 'grounding_work',
    title: '接地工事の種類・接地抵抗値・電線太さ 一覧表',
    category: '保安・接地・施工',
    badge: '法令・保安 必修',
    mnemonics: '「D種は100Ω、0.5秒遮断なら500ΩまでOK！」',
    headers: ['接地工事', '主な適用場所', '接地抵抗値', '接地線の太さ'],
    rows: [
      { col1: 'A 種', col2: '高圧・特別高圧機器', col3: '10 Ω 以下', col4: '2.6 mm 以上', highlight: false },
      { col1: 'B 種', col2: '変圧器の低圧側中性点', col3: '150 / 一線地絡電流 Ω', col4: '2.6 mm 以上', highlight: false },
      { col1: 'C 種', col2: '300Vを超える低圧機器', col3: '10 Ω 以下 (遮断0.5秒内: 500Ω)', col4: '1.6 mm 以上', highlight: false },
      { col1: 'D 種', col2: '300V以下の低圧機器（一般家電）', col3: '100 Ω 以下 (遮断0.5秒内: 500Ω) ★', col4: '1.6 mm 以上', highlight: true }
    ],
    note: '※ 漏電遮断器（0.5秒以内に自動遮断）を施設した場合は、C種・D種ともに「500Ω以下」に緩和されます！'
  },

  // 9. コンセント刃受形状
  receptacle_shapes: {
    id: 'receptacle_shapes',
    title: 'コンセントの刃受形状・極配置 一覧表',
    category: '配線図・器具・鑑別',
    badge: '配線図 鑑別頻出',
    mnemonics: '「200Vは横棒！」「20Aは逆L字（エル字）！」',
    headers: ['定格電圧・電流', '接地極の有無', '刃受の形状特徴', '主な用途'],
    rows: [
      { col1: '単相100 V 15 A', col2: '接地極なし / あり', col3: '縦平行2本 （通常のコンセント）', col4: '一般家電', highlight: false },
      { col1: '単相100 V 20 A', col2: '接地極付', col3: '片側が「逆L字」＋ 縦1本 ＋ アース穴', col4: '大型電子レンジ・食洗機', highlight: false },
      { col1: '単相200 V 15 A', col2: '接地極付', col3: '「水平横2本」 ＋ アース穴', col4: 'エアコン（小型200V）', highlight: false },
      { col1: '単相200 V 20 A', col2: '接地極付', col3: '片側「逆L字」＋ 横1本 ＋ アース穴 ★', col4: 'エアコン・IHクッキングヒータ', highlight: true }
    ],
    note: '※ 単相200V用は100V器具の誤挿入を防ぐため、刃が「横向き」になっています。'
  },

  // 10. スイッチ傍記記号
  switch_symbols: {
    id: 'switch_symbols',
    title: '点滅器（スイッチ）の図記号・傍記記号 早見表',
    category: '配線図・図記号',
    badge: '配線図 必修',
    mnemonics: '「H: ホタルではなくパイロット（確認表示灯）！ L: ホタル（位置表示灯）！」',
    headers: ['図記号', '名称', '動作・特徴', '端子・配線'],
    rows: [
      { col1: '●', col2: '片切スイッチ（単極）', col3: '通常の点滅器', col4: '端子 0, 1', highlight: false },
      { col1: '● 3', col2: '3路スイッチ', col3: '階段・廊下で2箇所から操作 ★', col4: '端子 0, 1, 3', highlight: true },
      { col1: '● 4', col2: '4路スイッチ', col3: '3箇所以上から操作（3路の間に挟む）', col4: '端子 1, 2, 3, 4', highlight: false },
      { col1: '● H', col2: '確認表示灯内蔵（パイロット）', col3: 'ONで【赤点灯】（換気扇・消し忘れ防止）★', col4: '常時点灯・同時点滅・異時点滅', highlight: true },
      { col1: '● L', col2: '位置表示灯内蔵（ホタル）', col3: 'OFFで【緑点灯】（暗闇で位置がわかる）', col4: 'スイッチOFFで点灯', highlight: false },
      { col1: '● 2P', col2: '2極スイッチ', col3: '両切スイッチ（200V回路など）', col4: '電源2本を同時に切断', highlight: false }
    ],
    note: '※ HとLの引っかけは試験で超頻出！「H = 光る（Hot/赤点灯・確認）」「L = 暗い所で光る（Light/緑点灯・ホタル）」と整理しましょう。'
  },

  // 11. コンセント傍記記号
  outlet_symbols: {
    id: 'outlet_symbols',
    title: 'コンセントの図記号・傍記記号 早見表',
    category: '配線図・図記号',
    badge: '配線図 必修',
    mnemonics: '「E=接地極, ET=接地端子, EL=漏電遮断器, LK=抜け止め, WP=防雨」',
    headers: ['記号', '名称・機能', '用途・特徴'],
    rows: [
      { col1: 'E', col2: '接地極付 (Earth)', col3: 'プラグのアースピンを挿せる三つ穴コンセント', highlight: false },
      { col1: 'ET', col2: '接地端子付 (Earth Terminal)', col3: 'アース線をネジで締め付ける端子付き', highlight: false },
      { col1: 'EL', col2: '漏電遮断器付 (Earth Leakage)', col3: 'コンセント自体にテストボタン付き漏電遮断器内蔵', highlight: true },
      { col1: 'LK', col2: '抜け止め形 (Lock)', col3: 'プラグを差し込んで右に回すとロックされる', highlight: true },
      { col1: 'WP', col2: '防雨形 (Weather Proof)', col3: '屋外壁面に取り付けるフタ付き防水構造', highlight: false },
      { col1: 'EX', col2: '防爆形 (Explosion proof)', col3: '引火性ガスのある場所で使用', highlight: false }
    ],
    note: '※ 「E ET EL」と並んでいる場合は「接地極付・接地端子付・漏電遮断器付」の全部入りコンセントです！'
  },

  // 12. 測定器と用途
  measuring_instruments: {
    id: 'measuring_instruments',
    title: '主要電気測定器と測定項目・用途 早見表',
    category: '測定・検査・鑑別',
    badge: '鑑別・測定 必修',
    mnemonics: '「メガ=絶縁、アーステスタ=接地、クランプ=活線電流」',
    headers: ['測定器名称', '測定対象', '測定時の回路状態', '特徴・写真のポイント'],
    rows: [
      { col1: '絶縁抵抗計 (メガ)', col2: '絶縁抵抗［MΩ］', col3: '停電（ブレーカーOFF）', col4: '測定電圧（125V/250V/500V切替）★最頻出', highlight: true },
      { col1: '接地抵抗計 (アーステスタ)', col2: '接地抵抗［Ω］', col3: '補助接地極2本を5〜10m離して地面に打つ', col4: 'E・P・Cの3端子コード付き', highlight: true },
      { col1: 'クランプ形電流計', col2: '交流電流［A］', col3: '通電中（活線状態のまま）', col4: '先端に輪っか（トング状コア）★電線を挟む', highlight: true },
      { col1: '検相器', col2: '三相電源の相回転', col3: '通電中（三相回路）', col4: '赤・白・青クリップ、回転円盤 or LED', highlight: false },
      { col1: '回路計 (テスター)', col2: '交流/直流電圧・抵抗', col3: '抵抗測定時は停電', col4: '赤黒のテストリード', highlight: false }
    ],
    note: '※ クランプ形電流計で漏れ電流を測る時は「中性線を含む3本を一括で挟む」のが試験の重要ポイントです！'
  },

  // 13. 工事の種類と施設場所
  wiring_methods: {
    id: 'wiring_methods',
    title: '配線工事の種類と施工可能場所 早見表',
    category: '施工方法・法令',
    badge: '法令・施工 必修',
    mnemonics: '「金属管・合成樹脂管・ケーブル工事はどこでもできる万能選手！」',
    headers: ['工事の種類', '展開した場所 (露出)', '点検できる隠ぺい (天井裏)', '点検できない隠ぺい (壁内・天井内)'],
    rows: [
      { col1: '金属管工事', col2: '◯ (乾燥/湿気OK)', col3: '◯ (乾燥/湿気OK)', col4: '◯ (乾燥/湿気OK) ★万能', highlight: true },
      { col1: '合成樹脂管 (PF/CD管)', col2: '◯ (CD管除く)', col3: '◯ (CD管除く)', col4: '◯ (CD管はコンクリ埋設専用) ★万能', highlight: true },
      { col1: 'ケーブル工事 (VVF等)', col2: '◯ (乾燥/湿気OK)', col3: '◯ (乾燥/湿気OK)', col4: '◯ (乾燥/湿気OK) ★万能', highlight: true },
      { col1: '金属ダクト工事', col2: '◯ (乾燥のみ)', col3: '◯ (点検できる乾燥のみ)', col4: '✕ 不可 ★頻出', highlight: true },
      { col1: '金属可とう電線管', col2: '◯', col3: '◯', col4: '◯ (2種可とう管)', highlight: false },
      { col1: 'がいし引き工事', col2: '◯ (露出のみ)', col3: '◯ (点検できる乾燥/湿気)', col4: '✕ 不可（隠ぺいは原則不可）', highlight: false }
    ],
    note: '※ 金属ダクト工事やバスダクト工事は「点検できない隠ぺい場所（壁の中やコンクリート内）」には施工できません！'
  },

  // 14. PSEマーク
  pse_marks: {
    id: 'pse_marks',
    title: '電気用品安全法（PSEマーク）の区分 早見表',
    category: '法令・鑑別',
    badge: '法令 頻出',
    mnemonics: '「危険度が高い機器＝ひし形PSE (特定)」「一般機器＝丸形PSE (特定以外)」',
    headers: ['マーク形状', '区分名', '対象機器の例', '登録検査機関'],
    rows: [
      { col1: '⟨PS⟩E （ひし形）', col2: '特定電気用品 (116品目) ★', col3: 'ヒューズ、配線用遮断器、漏電遮断器、タイムスイッチ、コードリール', col4: '登録検査機関の適合性検査が必要', highlight: true },
      { col1: '◯ PSE （丸形）', col2: '特定以外の電気用品 (341品目)', col3: '白熱電球、蛍光灯器具、換気扇、電気ストーブ、アイロン', col4: '自主検査でOK', highlight: false }
    ],
    note: '※ スイッチ・遮断器・ヒューズなど「回路の保護・制御を行う機器」は危険度が高いため【ひし形PSE】です！'
  },

  // 15. 電気工事士の資格と軽微な作業
  electrician_license_scope: {
    id: 'electrician_license_scope',
    title: '電気工事士の資格要否（軽微な作業一覧）',
    category: '法令',
    badge: '法令 頻出',
    mnemonics: '「枠・台・箱の固定は不要！ 電線そのものを繋ぐ・通す・切るは要資格！」',
    headers: ['作業内容', '資格の要否', '理由・ポイント'],
    rows: [
      { col1: '配電盤・ボックスを造営材に取り付ける', col2: '不要（軽微な作業） ★最頻出', col3: '躯体への固定作業のみで感電の危険がないため', highlight: true },
      { col1: '地中埋設管に電線を通す・引き抜く', col2: '要資格', col3: '電線に傷がつく恐れがあるため', highlight: false },
      { col1: '金属管・合成樹脂管を曲げる・接続する', col2: '要資格', col3: '配管加工は工事士の業務', highlight: false },
      { col1: '電線相互を接続する（スリーブ圧着等）', col2: '要資格', col3: '接触不良・火災の重大リスクがあるため', highlight: false },
      { col1: 'スイッチ・コンセントを壁に取り付ける', col2: '要資格', col3: '器具への電線結線作業を伴うため', highlight: false },
      { col1: '電圧600V以下のナイフスイッチを取り付ける', col2: '要資格', col3: '開閉器の設置・結線は資格が必要', highlight: false }
    ],
    note: '※ 「配電盤を壁に取り付ける」「電柱を立てる」など、電線に直接触れない骨組みの固定は資格不要です！'
  },

  // 16. 電圧降下の計算公式
  voltage_drop_formulas: {
    id: 'voltage_drop_formulas',
    title: '配線の電圧降下（v）と電力損失（P）公式 早見表',
    category: '電気理論・計算',
    badge: '計算 必修',
    mnemonics: '「単2は 2Ir、単3は Ir、三相は √3 Ir」',
    headers: ['配線方式', '電圧降下 v ［V］', '電線1本当たりの抵抗 r、線電流 I の場合'],
    rows: [
      { col1: '単相2線式', col2: 'v = 2 × I × r ★最頻出', col3: '往復2本分抵抗があるため「2倍」！', highlight: true },
      { col1: '単相3線式（平衡時）', col2: 'v = I × r', col3: '中性線に電流が流れないため「1本分」！', highlight: true },
      { col1: '三相3線式', col2: 'v = √3 × I × r ≒ 1.73 × I × r', col3: '三相は「√3倍（ルート3倍）」！', highlight: true }
    ],
    note: '※ 電線の電力損失は「単2: 2×I²×r」「単3: 2×I²×r（平衡時）」「三相: 3×I²×r」となります。'
  }
};

// 各問題番号 (1〜50) と関連するチートシートIDのマッピング
export const QUESTION_CHEATSHEET_MAP = {
  1: ['circuit_formulas'],
  2: ['wire_allowable_current'],
  3: ['circuit_formulas'],
  5: ['voltage_drop_formulas'],
  6: ['voltage_drop_formulas'],
  7: ['voltage_drop_formulas'],
  8: ['wire_allowable_current', 'current_reduction_factor'],
  9: ['mains_current'],
  10: ['branch_circuit', 'branch_breaker_distance'],
  12: ['wire_allowable_current'],
  16: ['wiring_methods'],
  17: ['wiring_methods'],
  18: ['wiring_methods'],
  19: ['grounding_work'],
  20: ['wiring_methods'],
  21: ['wiring_methods'],
  22: ['wiring_methods'],
  23: ['grounding_work'],
  24: ['insulation_resistance'],
  25: ['grounding_work'],
  26: ['measuring_instruments'],
  27: ['electrician_license_scope'],
  28: ['pse_marks'],
  30: ['voltage_drop_formulas'],
  34: ['switch_symbols'],
  36: ['switch_symbols'],
  37: ['receptacle_shapes'],
  38: ['outlet_symbols'],
  39: ['insulation_resistance'],
  40: ['branch_circuit'],
  41: ['ring_sleeve_crimp'],
  42: ['wire_allowable_current'],
  43: ['outlet_symbols'],
  44: ['measuring_instruments'],
  46: ['switch_symbols'],
  47: ['ring_sleeve_crimp'],
  48: ['wiring_methods'],
  49: ['ring_sleeve_crimp'],
  50: ['switch_symbols']
};

// 令和8年度上期以外の年度用：問題の分野タグ（categoryTag）のキーワードから早見表を選ぶ
// （上の番号対応表は令和8年度上期の問題番号で作られているため、他の年度には使えない）
const TAG_CHEATSHEET_RULES = [
  { pattern: /許容電流/, ids: ['wire_allowable_current', 'current_reduction_factor'] },
  { pattern: /幹線/, ids: ['mains_current'] },
  { pattern: /分岐/, ids: ['branch_circuit', 'branch_breaker_distance'] },
  { pattern: /リングスリーブ|スリーブ|差込コネクタ/, ids: ['ring_sleeve_crimp'] },
  { pattern: /絶縁抵抗|漏えい電流/, ids: ['insulation_resistance'] },
  { pattern: /接地(?!抵抗計)/, ids: ['grounding_work'] },
  { pattern: /コンセント(?!記号)/, ids: ['receptacle_shapes'] },
  { pattern: /スイッチ|点滅器/, ids: ['switch_symbols'] },
  { pattern: /コンセント記号/, ids: ['outlet_symbols'] },
  { pattern: /計器|測定|接地抵抗計|検電/, ids: ['measuring_instruments'] },
  { pattern: /管工事|線ぴ|ケーブル工事|工事方法|配線工事/, ids: ['wiring_methods'] },
  { pattern: /電気用品|PSE/, ids: ['pse_marks'] },
  { pattern: /電気工事士|作業範囲|資格/, ids: ['electrician_license_scope'] },
  { pattern: /電圧降下|電力損失|単相3線/, ids: ['voltage_drop_formulas'] }
];

const DEFAULT_MAP_EXAM_ID = 'r8_1';

// question（問題オブジェクト）を渡すと、年度に合った早見表を返す。
// 数値（問題番号）を渡した場合は、従来どおり令和8年度上期の対応表を使う。
export const getCheatsheetsForQuestion = (question) => {
  if (typeof question === 'number' || typeof question === 'string') {
    const ids = QUESTION_CHEATSHEET_MAP[question] || [];
    return ids.map(id => CHEATSHEETS[id]).filter(Boolean);
  }
  if (!question) return [];

  let ids;
  if (!question.examId || question.examId === DEFAULT_MAP_EXAM_ID) {
    ids = QUESTION_CHEATSHEET_MAP[question.number || question.id] || [];
  } else {
    const tag = question.categoryTag || '';
    ids = [...new Set(TAG_CHEATSHEET_RULES.filter(r => r.pattern.test(tag)).flatMap(r => r.ids))].slice(0, 2);
  }
  return ids.map(id => CHEATSHEETS[id]).filter(Boolean);
};
