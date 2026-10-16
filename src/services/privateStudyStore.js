export const privateContentMode = import.meta.env.VITE_PRIVATE_CONTENT === 'true';
export const paidExamIds = ['r7_2', 'r7_1', 'r6_2', 'r6_1'];
export const isPaidExam = id => paidExamIds.includes(id);
const exams = new Map();
const assets = new Map();
const listeners = new Set();
let version = 0;
let generation = 0;
let leaseUntil = 0;
let owner = null;
export function setPrivateOwner(uid) {
  if (uid !== owner) { clearPrivateStudy(); owner = uid; }
}
export function renewPrivateLease(expiresAt, serverNow, startedAt = performance.now()) {
  const duration = Math.min(60000, expiresAt - serverNow);
  if (!Number.isFinite(duration) || duration <= 0) { clearPrivateStudy(); return false; }
  leaseUntil = startedAt + duration;
  return performance.now() < leaseUntil;
}
export const hasPrivateLease = () => performance.now() < leaseUntil;
export function expirePrivateStudy() {
  if (exams.size && !hasPrivateLease()) clearPrivateStudy();
}
export const getPrivateVersion = () => version;
export const privateGeneration = () => generation;
export const subscribePrivateStudy = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const notify = () => { version++; listeners.forEach(fn => fn()); };
export const getPrivateExam = id => hasPrivateLease() ? exams.get(id) : undefined;
export const getPrivateCrops = () => hasPrivateLease() ? Object.assign({}, ...[...exams.values()].map(e => e.crops)) : {};
export const privateAssetPath = path => /^(pages|crops|choices)\/(r7_2|r7_1|r6_2|r6_1)\//.test(path.replace(/^\//, ''));
export const getPrivateAsset = path => hasPrivateLease() ? assets.get(path.replace(/^\//, '')) || '' : '';
export function publishPrivateExam(exam, urls, expectedGeneration) {
  if (generation !== expectedGeneration || !hasPrivateLease()) { urls.forEach(url => URL.revokeObjectURL(url)); return false; }
  exams.set(exam.examId, exam);
  urls.forEach((url, path) => { const old = assets.get(path); if (old) URL.revokeObjectURL(old); assets.set(path, url); });
  notify();
  return true;
}
export function clearPrivateStudy() {
  generation++; leaseUntil = 0;
  assets.forEach(url => URL.revokeObjectURL(url));
  assets.clear(); exams.clear(); notify();
}
