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
