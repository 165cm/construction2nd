import { privateContentMode, privateAssetPath, getPrivateAsset } from '../services/privateStudyStore';
// Helper to resolve asset URLs with Vite's base path for GitHub Pages and local development

export const getAssetUrl = (path) => {
  if (!path) return '';
  if (privateContentMode && privateAssetPath(path)) return getPrivateAsset(path);
  const base = import.meta.env.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}${cleanPath}`;
};
