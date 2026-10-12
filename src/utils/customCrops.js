// Storage helper for user-adjusted custom image crops

import { getAssetUrl } from './asset';

const STORAGE_KEY = 'denkou_custom_crops_v1';

export const getCustomCrops = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    console.error('Failed to load custom crops:', e);
    return {};
  }
};

export const saveCustomCrop = (key, cropData) => {
  try {
    const crops = getCustomCrops();
    crops[key] = cropData;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to save custom crop (quota or storage error):', e);
    return false;
  }
};

export const resetCustomCrop = (key) => {
  try {
    const crops = getCustomCrops();
    delete crops[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to reset custom crop:', e);
    return false;
  }
};

export const clearAllCustomCrops = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('custom-crops-updated'));
    return true;
  } catch (e) {
    console.error('Failed to clear custom crops:', e);
    return false;
  }
};

export const getDisplayImageUrl = (key, defaultPath) => {
  try {
    const custom = getCustomCrops();
    const k = String(key);
    // Ensure the dataUrl is present and of realistic length (filters out empty/corrupt 1x1 dataUrls)
    if (custom[k]?.dataUrl && custom[k].dataUrl.length > 500) {
      return custom[k].dataUrl;
    }
    if (custom[key]?.dataUrl && custom[key].dataUrl.length > 500) {
      return custom[key].dataUrl;
    }
  } catch (e) {
    console.error('Error getting display image url:', e);
  }
  return defaultPath ? getAssetUrl(defaultPath) : '';
};
