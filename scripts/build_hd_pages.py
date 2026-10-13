"""利用者の画面に出すページ画像を、高画質の WebP として作る。

PR #14 の「画像高速化」で public/pages/ の PNG は約半分の大きさ（高さ 1200px）に縮められた。
縮める前の高画質の PNG（高さ約 2250px）は git の履歴（df9e7d8 の1つ前）に残っているので、
それを WebP に変換して public/pages/**/page_N.webp に置く。

- 縮めた PNG（高さ 1200px）はそのまま残す。管理画面の切り抜き位置はこの PNG を基準にしているため。
- アプリは WebP を読み込み、切り抜き位置を「WebP の高さ / 1200」倍して切り抜く（src/utils/customCrops.js）。
- 配線図の拡大表示用の floor_plan / panel_schedule も WebP にする。

使い方: python3 scripts/build_hd_pages.py
"""
import io
import os
import subprocess

from PIL import Image

SOURCE_COMMIT = 'df9e7d8^'  # 画像を縮める前の版
QUALITY = 85


def git_show(path):
    try:
        return subprocess.run(['git', 'show', f'{SOURCE_COMMIT}:{path}'], capture_output=True, check=True).stdout
    except subprocess.CalledProcessError:
        return None


def save_webp(img, out_path):
    img.convert('RGB').save(out_path, 'WEBP', quality=QUALITY, method=6)
    return os.path.getsize(out_path)


def main():
    listed = subprocess.run(['git', 'ls-tree', '-r', '--name-only', SOURCE_COMMIT, 'public/pages'],
                            capture_output=True, check=True, text=True).stdout.split()
    total = 0
    for path in sorted(p for p in listed if os.path.basename(p).startswith('page_') and p.endswith('.png')):
        data = git_show(path)
        img = Image.open(io.BytesIO(data))
        out = path[:-4] + '.webp'
        size = save_webp(img, out)
        total += size
        print(f'{out}  {img.size[0]}x{img.size[1]}  {size // 1024}KB')

    # 配線図の拡大表示（平面図・分電盤）。縮める前の版があればそれを、無ければ今の PNG を使う
    for root, _, files in os.walk('public/pages'):
        for name in files:
            if name in ('floor_plan.png', 'panel_schedule.png'):
                path = os.path.join(root, name)
                data = git_show(path)
                img = Image.open(io.BytesIO(data)) if data else Image.open(path)
                out = path[:-4] + '.webp'
                size = save_webp(img, out)
                total += size
                print(f'{out}  {img.size[0]}x{img.size[1]}  {size // 1024}KB')
    print(f'合計 {total // 1024}KB')


if __name__ == '__main__':
    main()
