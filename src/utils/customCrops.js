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
  } catch (e) {
    console.error('Failed to save custom crop:', e);
  }
};

export const resetCustomCrop = (key) => {
  try {
    const crops = getCustomCrops();
    delete crops[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(crops));
    window.dispatchEvent(new Event('custom-crops-updated'));
  } catch (e) {
    console.error('Failed to reset custom crop:', e);
  }
};

export const getDisplayImageUrl = (key, defaultPath) => {
  const custom = getCustomCrops();
  const k = String(key);
  if (custom[k]?.dataUrl) {
    return custom[k].dataUrl;
  }
  if (custom[key]?.dataUrl) {
    return custom[key].dataUrl;
  }
  return defaultPath ? getAssetUrl(defaultPath) : '';
};

