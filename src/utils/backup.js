// 学習記録のバックアップ（ファイルへの書き出し・読み込み）
// 機種変更やブラウザのデータ削除に備え、この端末に保存されている学習記録と設定をまとめて保存する。
const BACKUP_APP_ID = 'denkou2-learning-backup';
const BACKUP_VERSION = 1;

// バックアップに含める LocalStorage のキー（学習記録・設定・選択中の年度・受験中の模擬試験）
const BACKUP_KEYS = [
  'denkou2_mastery_state_v1',
  'denkou2_current_exam_id',
  'denkou2_shuffle_choices_v1',
  'denkou2_auto_advance_v1',
  'denkou2_exam_session_v1',
  'denkou_sound_enabled'
];

export const createLearningBackup = () => {
  const data = {};
  BACKUP_KEYS.forEach((key) => {
    try {
      const value = localStorage.getItem(key);
      if (value !== null) data[key] = value;
    } catch (e) {
      // ignore
    }
  });
  return {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data
  };
};

export const downloadLearningBackup = () => {
  const backup = createLearningBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `denkou2_study_backup_${backup.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// バックアップの中身を確かめる。問題なければ { ok: true, summary }、だめなら { ok: false, error }
export const inspectLearningBackup = (text) => {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'ファイルの形式が正しくありません' };
  }
  if (!parsed || parsed.app !== BACKUP_APP_ID || typeof parsed.data !== 'object' || !parsed.data) {
    return { ok: false, error: 'このアプリの学習記録のバックアップではありません' };
  }
  const masteryRaw = parsed.data['denkou2_mastery_state_v1'];
  let answered = 0;
  if (masteryRaw) {
    try {
      const mastery = JSON.parse(masteryRaw);
      if (!mastery || typeof mastery !== 'object' || typeof (mastery.records || {}) !== 'object') {
        return { ok: false, error: '学習記録の中身が壊れています' };
      }
      answered = mastery.totalAnswered || 0;
    } catch (e) {
      return { ok: false, error: '学習記録の中身が壊れています' };
    }
  }
  return { ok: true, backup: parsed, summary: { exportedAt: parsed.exportedAt, answered } };
};

// 読み込んで、この端末の学習記録と設定を置き換える
export const restoreLearningBackup = (backup) => {
  BACKUP_KEYS.forEach((key) => {
    const value = backup.data[key];
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  });
};
