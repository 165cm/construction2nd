"""配線図ページ（15ページ目）を、試験センターの問題PDFから高解像度の WebP として作り直す。

問題PDFの配線図はほとんどが線の情報（拡大してもぼやけない形式）なので、高い解像度で書き出せる。
- page_15.webp … PDF のページ全体（MediaBox）を 288dpi で書き出したもの（高さ約 4500px）。
  今までの WebP（144dpi）のちょうど2倍。枠の取り方は同じなので、切り抜き位置（高さ 1200px 基準）はそのまま使える
- floor_plan.webp / panel_schedule.webp … 配線図ビューアの「平面図」「分電盤」タブ。
  上の画像から、今までの PNG と同じ範囲（下の BOXES、高さ 1200px 基準）を切り抜く
- 管理画面が使う PNG（高さ 1200px）は変えない

使い方: python3 scripts/build_pdf_pages.py <問題PDF> [<問題PDF> ...]
  ファイル名の試験日（例: 20251026_co_second_q01.pdf）から年度を決める。
"""
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

EXAMS = {
    '20260524': 'public/pages',
    '20251026': 'public/pages/r7_2',
    '20250525': 'public/pages/r7_1',
    '20241027': 'public/pages/r6_2',
    '20240526': 'public/pages/r6_1',
}
PAGE = 15
DPI = 288
QUALITY = 80
BASE_HEIGHT = 1200

# 平面図・分電盤の範囲（高さ 1200px のページ画像での位置。今までの floor_plan.png / panel_schedule.png と同じ範囲）
BOXES = {
    'public/pages': {'floor_plan': (38, 106, 792, 739), 'panel_schedule': (38, 848, 792, 317)},
    'public/pages/r7_2': {'floor_plan': (36, 106, 804, 724), 'panel_schedule': (36, 828, 804, 322)},
    'public/pages/r7_1': {'floor_plan': (36, 106, 804, 750), 'panel_schedule': (36, 854, 804, 322)},
    'public/pages/r6_2': {'floor_plan': (36, 106, 804, 750), 'panel_schedule': (36, 854, 804, 322)},
    'public/pages/r6_1': {'floor_plan': (36, 106, 804, 750), 'panel_schedule': (36, 854, 804, 322)},
}


def save_webp(img, path):
    img.save(path, 'WEBP', quality=QUALITY, method=6)
    print(f'  {path} {img.size} {os.path.getsize(path) // 1024}KB')


def build(pdf_path):
    m = re.search(r'(\d{8})_co_second_q', os.path.basename(pdf_path))
    if not m or m.group(1) not in EXAMS:
        print(f'skip (年度が分からない): {pdf_path}')
        return
    out_dir = EXAMS[m.group(1)]
    print(out_dir)
    with tempfile.TemporaryDirectory() as tmp:
        prefix = os.path.join(tmp, 'p')
        subprocess.run(['pdftoppm', '-r', str(DPI), '-f', str(PAGE), '-l', str(PAGE), '-png', pdf_path, prefix], check=True)
        page = Image.open(f'{prefix}-{PAGE}.png').convert('RGB')
    save_webp(page, os.path.join(out_dir, f'page_{PAGE}.webp'))
    k = page.height / BASE_HEIGHT
    for name, (x, y, w, h) in BOXES[out_dir].items():
        box = (round(x * k), round(y * k), min(page.width, round((x + w) * k)), min(page.height, round((y + h) * k)))
        save_webp(page.crop(box), os.path.join(out_dir, f'{name}.webp'))


if __name__ == '__main__':
    for path in sys.argv[1:]:
        build(path)
