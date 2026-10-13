"""試験センターの「解答」PDF（1ページ）から、管理画面で見る解答の画像を作る。

PDF の上半分にある「表題＋50問の解答表」だけを切り抜き、public/pages/<年度>/answer.webp に置く。

使い方: python3 scripts/build_answer_pages.py <解答PDF> [<解答PDF> ...]
  ファイル名の日付（例: 20251026_co_second_a01.pdf）から年度を決める。
"""
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image, ImageOps

# 試験日 → 年度ID と画像フォルダ
EXAMS = {
    '20260524': ('r8_1', 'public/pages'),
    '20251026': ('r7_2', 'public/pages/r7_2'),
    '20250525': ('r7_1', 'public/pages/r7_1'),
    '20241027': ('r6_2', 'public/pages/r6_2'),
    '20240526': ('r6_1', 'public/pages/r6_1'),
}
DPI = 200
MARGIN = 24


def build(pdf_path):
    m = re.search(r'(\d{8})_co_second_a', os.path.basename(pdf_path))
    if not m or m.group(1) not in EXAMS:
        print(f'skip (年度が分からない): {pdf_path}')
        return
    exam_id, out_dir = EXAMS[m.group(1)]
    with tempfile.TemporaryDirectory() as tmp:
        prefix = os.path.join(tmp, 'p')
        subprocess.run(['pdftoppm', '-r', str(DPI), '-png', '-f', '1', '-l', '1', pdf_path, prefix], check=True)
        img = Image.open(prefix + '-1.png').convert('L')
    # 上半分だけ見て、文字や罫線のある範囲を切り抜く
    top = img.crop((0, 0, img.width, img.height // 2))
    box = ImageOps.invert(top).point(lambda v: 255 if v > 40 else 0).getbbox()
    left, upper, right, lower = box
    cropped = img.crop((max(0, left - MARGIN), max(0, upper - MARGIN), min(img.width, right + MARGIN), min(top.height, lower + MARGIN)))
    out = os.path.join(out_dir, 'answer.webp')
    cropped.save(out, 'WEBP', quality=80, method=6)
    print(f'{exam_id}: {out} {cropped.size} {os.path.getsize(out) // 1024}KB')


if __name__ == '__main__':
    for path in sys.argv[1:]:
        build(path)
