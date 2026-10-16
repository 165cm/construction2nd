import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer, build } from 'vite';
process.env.NODE_ENV = 'production';
const paid = ['r7_2', 'r7_1', 'r6_2', 'r6_1'];
const out = 'functions/private-content';
const site = 'dist-private-site';
const files = [];
await fs.mkdir(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
try {
  const { getSharedExamQuestions } = await server.ssrLoadModule('/src/data/examLoader.js');
  const crops = JSON.parse(await fs.readFile('src/data/cropOverrides.json', 'utf8'));
  for (const exam of paid) {
    const key = `exams/${exam}.json`;
    await fs.mkdir(path.dirname(`${out}/${key}`), { recursive: true });
    await fs.writeFile(`${out}/${key}`, JSON.stringify({ examId: exam, questions: getSharedExamQuestions(exam), crops: Object.fromEntries(Object.entries(crops).filter(([key]) => key.startsWith(`${exam}_`))) }));
    files.push(key);
  }
} finally { await server.close(); }
async function copyTree(source, destination, prefix, record = false) {
  await fs.mkdir(destination, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) await copyTree(`${source}/${entry.name}`, `${destination}/${entry.name}`, `${prefix}/${entry.name}`, record);
    else if (entry.isFile()) {
      await fs.copyFile(`${source}/${entry.name}`, `${destination}/${entry.name}`);
      if (record) files.push(`${prefix}/${entry.name}`);
    }
  }
}
for (const kind of ['pages', 'crops', 'choices']) for (const exam of paid) {
  await copyTree(`public/${kind}/${exam}`, `${out}/assets/${kind}/${exam}`, `assets/${kind}/${exam}`, true);
}
for (const exam of paid) {
  const filename = `${out}/exams/${exam}.json`;
  const data = JSON.parse(await fs.readFile(filename, 'utf8'));
  data.assets = files.filter(key => key.startsWith('assets/') && key.split('/')[2] === exam).map(key => key.slice(7));
  await fs.writeFile(filename, JSON.stringify(data));
}
await fs.writeFile(`${out}/manifest.json`, JSON.stringify(files.sort(), null, 2));
// 公開側に有料JSONを取り込ませない。既存の通常ビルドは移行完了まで維持。
await build({ base: '/', define: { 'import.meta.env.VITE_PRIVATE_CONTENT': JSON.stringify('true') }, publicDir: false, build: { outDir: site, emptyOutDir: true }, plugins: [{
  name: 'exclude-paid-material', enforce: 'pre',
  load(id) {
    const clean = id.split('?')[0].replaceAll('\\', '/');
    if (paid.some(exam => clean.endsWith(`/src/data/exams/${exam}.json`))) return '[]';
    for (const file of ['questionOverrides.json', 'visualChoices.json', 'cropOverrides.json']) {
      if (clean.endsWith(`/src/data/${file}`)) {
        return fs.readFile(clean, 'utf8').then(raw => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(raw)).filter(([key]) => !paid.some(exam => key === exam || key.startsWith(`${exam}_`))))));
      }
    }
  }
}] });
// 公開画像は最新年度だけ。元のpublicディレクトリを丸ごとコピーしない。
for (const entry of await fs.readdir('public', { withFileTypes: true })) if (entry.isFile()) await fs.copyFile(`public/${entry.name}`, `${site}/${entry.name}`);
for (const kind of ['pages', 'crops']) {
  await fs.mkdir(`${site}/${kind}`, { recursive: true });
  for (const entry of await fs.readdir(`public/${kind}`, { withFileTypes: true })) if (entry.isFile()) await fs.copyFile(`public/${kind}/${entry.name}`, `${site}/${kind}/${entry.name}`);
}
await copyTree('public/choices/r8_1', `${site}/choices/r8_1`, '');
console.log(`Private: ${files.length} files. Public staging output: ${site}. Deployment requires live integration tests and approval.`);
