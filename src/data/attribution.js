// 過去問の著作権・出典・利用ガイドラインに関する表記データ
// 一般財団法人 電気技術者試験センター ガイドライン準拠

// 試験センターの留意点にある書き方にそろえる（年度、期、試験区分等）
// 例：「出典：令和5年度上期第二種電気工事士試験（午前）」。午前・午後は分かっている年度だけ付ける
const formatSourceName = (examMeta) => {
  const name = (examMeta?.name || '令和8年度 上期').replace(/\s+/g, '');
  const session = examMeta?.session ? `（${examMeta.session}）` : '';
  return `${name}第二種電気工事士試験${session}`;
};

export function getAttributionConfig(examMeta) {
  const fullSourceName = formatSourceName(examMeta);

  return {
    organization: '一般財団法人 電気技術者試験センター',
    sourceName: fullSourceName,
    officialUrl: 'https://www.shiken.or.jp/construction/second/qa/',
    
    // 標準出典表示テキスト
    sourceCredit: `出典：${fullSourceName}（一般財団法人 電気技術者試験センター）`,
    
    // 改変に関する明記
    modificationNotice: '本アプリでは、モバイル端末での学習効率向上のため、問題文・選択肢の表示レイアウト最適化、独自作成の詳細解説・要点一覧表・暗記チートシートの付加を行っています。',

    // 著作権に関する明記
    copyrightNotice: '公表されている試験問題および図面の著作権は、一般財団法人 電気技術者試験センターに帰属します（著作権は放棄されていません）。',

    // 使用目的に関する明記
    purposeNotice: '本アプリは、電気工事士試験制度の趣旨に基づき、電気工事士を目指す受験者の学習支援および安全知識の普及（教育目的）のために制作・公開されています。'
  };
}

// 画面下に出す出典表記（試験センターの例の書き方）
export function getShortSourceLabel(examMeta) {
  return `出典：${formatSourceName(examMeta)}`;
}

// 互換性のためのデフォルト
export const ATTRIBUTION_CONFIG = getAttributionConfig({ name: '令和8年度 上期', session: '午前' });
