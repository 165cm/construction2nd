import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('public/lp/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeScreenshot({ url, outputPath, width, height, delay = 2500 }) {
  console.log(`Capturing: ${url} -> ${outputPath} (${width}x${height})`);
  const userDataDir = `/tmp/chrome-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const cmd = `"${CHROME_PATH}" --headless=new --no-sandbox --disable-setuid-sandbox --disable-gpu --hide-scrollbars --user-data-dir="${userDataDir}" --window-size=${width},${height} --virtual-time-budget=6000 --screenshot="${outputPath}" "${url}"`;
  execSync(cmd, { stdio: 'inherit' });
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (e) {}
}

async function main() {
  console.log('Building app for screenshot capture...');
  execSync('npm run build', { stdio: 'inherit' });

  console.log('Starting preview server on port 4173...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], {
    stdio: 'pipe',
    detached: false
  });

  server.stdout.on('data', (d) => process.stdout.write(`[preview] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[preview] ${d}`));

  // Wait for server to be ready
  await wait(3000);

  const baseUrl = 'http://localhost:4173/construction2nd/';

  try {
    // 1. Mobile - Quiz View (問題演習画面)
    await takeScreenshot({
      url: `${baseUrl}#quiz`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-quiz-mobile.png'),
      width: 412,
      height: 892
    });

    // 2. Mobile - Exam Mode (120分模試・マークシート画面)
    await takeScreenshot({
      url: `${baseUrl}#exam`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-exam-mobile.png'),
      width: 412,
      height: 892
    });

    // 3. Mobile - Review & Cheatsheet (復習・チートシート画面)
    await takeScreenshot({
      url: `${baseUrl}#review`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-review-mobile.png'),
      width: 412,
      height: 892
    });

    // 4. Mobile - Question List (問題一覧・進捗画面)
    await takeScreenshot({
      url: `${baseUrl}#list`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-list-mobile.png'),
      width: 412,
      height: 892
    });

    // 5. Desktop - Wide Screen Quiz View (PC・タブレット大画面)
    await takeScreenshot({
      url: `${baseUrl}#quiz`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-pc-quiz.png'),
      width: 1200,
      height: 800
    });

    // 6. Desktop - Wide Screen Review (PC・チートシート展開画面)
    await takeScreenshot({
      url: `${baseUrl}#review`,
      outputPath: path.join(SCREENSHOT_DIR, 'screen-pc-review.png'),
      width: 1200,
      height: 800
    });

    console.log('All screenshots captured successfully!');
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
