// 過去問の著作権・出典・利用ガイドラインに関する表記データ
// 一般財団法人 電気技術者試験センター ガイドライン準拠

export function getAttributionConfig(examMeta) {
  const examName = examMeta ? examMeta.name : '令和8年度上期';
  const fullSourceName = `${examName}第二種電気工事士筆記試験`;

  return {
    organization: '一般財団法人 電気技術者試験センター',
    sourceName: fullSourceName,
    officialUrl: 'https://www.shiken.or.jp/construction/second/qa/',
    
    // 標準出典表示テキスト
    sourceCredit: `出典：一般財団法人 電気技術者試験センター「${fullSourceName}」`,
    
    // 改変に関する明記
    modificationNotice: '本アプリでは、モバイル端末での学習効率向上のため、問題文・選択肢の表示レイアウト最適化、独自作成の詳細解説・要点一覧表・暗記チートシートの付加を行っています。',

    // 著作権に関する明記
    copyrightNotice: '公表されている試験問題および図面の著作権は、一般財団法人 電気技術者試験センターに帰属します（著作権は放棄されていません）。',

    // 使用目的に関する明記
    purposeNotice: '本アプリは、電気工事士試験制度の趣旨に基づき、電気工事士を目指す受験者の学習支援および安全知識の普及（教育目的）のために制作・公開されています。'
  };
}

// 画面下に出す短い出典表記（年度に合わせる）。session（午前・午後）は分かっている年度だけ付ける
export function getShortSourceLabel(examMeta) {
  const name = examMeta?.name || '令和8年度 上期';
  const session = examMeta?.session ? `（${examMeta.session}）` : '';
  return `出典: 一般財団法人 電気技術者試験センター ${name}${session}`;
}

// 互換性のためのデフォルト
export const ATTRIBUTION_CONFIG = getAttributionConfig({ name: '令和8年度上期' });
