import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const OVERRIDES_FILE = fileURLToPath(new URL('./src/data/cropOverrides.json', import.meta.url))

const toInt = (v) => Math.round(Number(v))

// 管理画面の「保存」を、手元の開発サーバー（npm run dev）で使ったときだけ
// src/data/cropOverrides.json に書き込む。公開サイト（GitHub Pages）には含まれない。
function cropOverridesWriter() {
  return {
    name: 'crop-overrides-writer',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__admin/crop-overrides', (req, res) => {
        const send = (status, body) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify(body))
        }
        if (req.method !== 'POST') return send(405, { ok: false, error: 'POST only' })

        let raw = ''
        req.on('data', (chunk) => { raw += chunk })
        req.on('end', () => {
          try {
            const { updates = {}, removals = [] } = JSON.parse(raw || '{}')
            const current = fs.existsSync(OVERRIDES_FILE)
              ? JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8') || '{}')
              : {}

            for (const [key, c] of Object.entries(updates)) {
              // 座標なしで「テキスト問題（画像なし）」の設定だけを持つ項目
              if (c && c.showImage === false && c.page === undefined) {
                current[String(key)] = { ...(current[String(key)] || {}), showImage: false }
                continue
              }
              const entry = {
                page: toInt(c.page),
                filename: String(c.filename || ''),
                x: toInt(c.x),
                y: toInt(c.y),
                w: toInt(c.w),
                h: toInt(c.h),
                label: String(c.label || '')
              }
              // 年度ごとの元ページ画像フォルダ（例: /pages/r7_2）。抜けると令和8年のページから切り抜かれる
              if (typeof c.showImage === 'boolean') entry.showImage = c.showImage
              if (typeof c.pageDir === 'string' && /^\/pages(\/[a-z0-9_]+)?$/.test(c.pageDir)) {
                entry.pageDir = c.pageDir
              }
              const valid = [entry.page, entry.x, entry.y, entry.w, entry.h].every(Number.isFinite)
                && entry.page >= 1 && entry.w > 0 && entry.h > 0
              if (!valid) throw new Error(`不正な座標です (key: ${key})`)
              current[String(key)] = entry
            }
            for (const key of removals) delete current[String(key)]

            const sorted = Object.fromEntries(
              Object.keys(current)
                .sort((a, b) => (Number(a) || 999) - (Number(b) || 999) || a.localeCompare(b))
                .map((k) => [k, current[k]])
            )
            fs.writeFileSync(OVERRIDES_FILE, JSON.stringify(sorted, null, 2) + '\n')
            send(200, { ok: true, count: Object.keys(sorted).length })
          } catch (err) {
            send(400, { ok: false, error: err.message })
          }
        })
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), cropOverridesWriter()],
  base: '/construction2nd/',
  server: {
    host: true,
    port: 5173
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        lp: fileURLToPath(new URL('./lp/index.html', import.meta.url))
      }
    }
  }
})

