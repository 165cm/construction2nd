import { privateContentMode, privateAssetPath, getPrivateAsset } from '../services/privateStudyStore';
// Helper to resolve asset URLs with Vite's base path for GitHub Pages and local development

export const getAssetUrl = (path) => {
  if (!path) return '';
  if (privateContentMode && privateAssetPath(path)) return getPrivateAsset(path);
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
};

// 有料画像だけを認証付きで必要時に取得する。公開画像は従来のURLを使う。
export async function resolveAssetUrl(path) {
  if (!path) return '';
  if (privateContentMode && privateAssetPath(path)) {
    const { loadPrivateAsset } = await import('../services/privateStudy');
    return loadPrivateAsset(path);
  }
  return getAssetUrl(path);
}
