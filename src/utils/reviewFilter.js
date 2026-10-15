// 一度間違え、まだ2回連続正解していない問題を復習対象にする。
export const needsReview = (record) => Boolean(record && (
  record.status === 'review' || (record.wrong > 0 && record.status !== 'mastered')
));
