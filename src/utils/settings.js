// User preferences and settings helper
const SHUFFLE_STORAGE_KEY = 'denkou2_shuffle_choices_v1';

export const getShuffleChoicesSetting = () => {
  try {
    const val = localStorage.getItem(SHUFFLE_STORAGE_KEY);
    // Default is TRUE (Random shuffle choices on by default for effective learning)
    return val === null ? true : val === 'true';
  } catch (e) {
    console.error('Failed to read shuffle setting:', e);
    return true;
  }
};

export const setShuffleChoicesSetting = (enabled) => {
  try {
    localStorage.setItem(SHUFFLE_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new Event('shuffle-setting-changed'));
    return true;
  } catch (e) {
    console.error('Failed to save shuffle setting:', e);
    return false;
  }
};

// 解答後の「自動で次の問題へ進む」設定
// 'always' = 常に3秒後に次へ / 'correct_only' = 正解の時だけ（不正解は止まって解説を読める） / 'off' = 自動で進まない
const AUTO_ADVANCE_STORAGE_KEY = 'denkou2_auto_advance_v1';
export const AUTO_ADVANCE_MODES = [
  { id: 'correct_only', label: '正解の時だけ', desc: '正解の時は3秒後に次へ。不正解の時は止まります' },
  { id: 'always', label: 'いつも', desc: '正解・不正解に関わらず3秒後に次の問題へ進みます' },
  { id: 'off', label: 'オフ', desc: '正解でも根拠を確認してから進めます（おすすめ）' }
];
const DEFAULT_AUTO_ADVANCE_MODE = 'off';

export const getAutoAdvanceMode = () => {
  try {
    const val = localStorage.getItem(AUTO_ADVANCE_STORAGE_KEY);
    return AUTO_ADVANCE_MODES.some(m => m.id === val) ? val : DEFAULT_AUTO_ADVANCE_MODE;
  } catch (e) {
    return DEFAULT_AUTO_ADVANCE_MODE;
  }
};

export const setAutoAdvanceMode = (mode) => {
  try {
    localStorage.setItem(AUTO_ADVANCE_STORAGE_KEY, mode);
    window.dispatchEvent(new Event('auto-advance-setting-changed'));
    return true;
  } catch (e) {
    console.error('Failed to save auto-advance setting:', e);
    return false;
  }
};
