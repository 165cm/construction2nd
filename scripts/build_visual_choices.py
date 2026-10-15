"""原本の図・写真選択肢を切り出す。座標基準は既存PNGの高さ1200px。"""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'src/data/visualChoices.json').read_text())
for exam, questions in manifest.items():
    page_dir = ROOT / 'public/pages' / ('' if exam == 'r8_1' else exam)
    output_dir = ROOT / 'public/choices' / exam
    output_dir.mkdir(parents=True, exist_ok=True)
    for number, entry in questions.items():
        with Image.open(page_dir / f"page_{entry['page']}.webp") as source:
            scale = source.height / 1200
            box = tuple(round(v * scale) for v in entry['box'])
            assert 0 <= box[0] < box[2] <= source.width
            assert 0 <= box[1] < box[3] <= source.height
            source.crop(box).save(output_dir / f'{number}.webp', quality=92)
            if 'stemBox' in entry:
                stem = tuple(round(v * scale) for v in entry['stemBox'])
                assert 0 <= stem[0] < stem[2] <= source.width
                assert 0 <= stem[1] < stem[3] <= source.height
                source.crop(stem).save(output_dir / f'{number}-stem.webp', quality=92)
print(f"Generated {sum(map(len, manifest.values()))} choice images")
