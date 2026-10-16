export const privateContentMode = import.meta.env.VITE_PRIVATE_CONTENT === 'true';
export const paidExamIds = ['r7_2', 'r7_1', 'r6_2', 'r6_1'];
export const isPaidExam = id => paidExamIds.includes(id);
const exams = new Map();
const assets = new Map();
const listeners = new Set();
let version = 0;
let generation = 0;
export const getPrivateVersion = () => version;
export const privateGeneration = () => generation;
export const subscribePrivateStudy = listener => { listeners.add(listener); return () => listeners.delete(listener); };
const notify = () => { version++; listeners.forEach(fn => fn()); };
export const getPrivateExam = id => exams.get(id);
export const getPrivateCrops = () => Object.assign({}, ...[...exams.values()].map(e => e.crops));
export const privateAssetPath = path => /^(pages|crops|choices)\/(r7_2|r7_1|r6_2|r6_1)\//.test(path.replace(/^\//, ''));
export const getPrivateAsset = path => assets.get(path.replace(/^\//, '')) || '';
export function publishPrivateExam(exam, urls, expectedGeneration) {
  if (generation !== expectedGeneration) { urls.forEach(url => URL.revokeObjectURL(url)); return false; }
  exams.set(exam.examId, exam);
  urls.forEach((url, path) => { const old = assets.get(path); if (old) URL.revokeObjectURL(old); assets.set(path, url); });
  notify();
  return true;
}
export function clearPrivateStudy() {
  generation++;
  assets.forEach(url => URL.revokeObjectURL(url));
  assets.clear(); exams.clear(); notify();
}
