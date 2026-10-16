"""Slices of a font for the page, as woff2: the kana in one, the kanji in
slices of SLICE glyphs by code point, each holding only characters the
font has. Called by tools/build-font.mjs (a manual data step, not a build):

    python3 -I tools/lib/font-subset.py <font.ttf> <out dir> <chars file> <prefix>

Prints one JSON line: [[file name, characters], ...]. Needs fontTools and
brotli (pip install fonttools brotli). No layout features: the page draws
single characters across, and the vertical forms alone were 135 KB of the
kana's 160.
"""
import io
import json
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

SLICE = 200

def is_kana(cp):
    return 0x3040 <= cp <= 0x30FF

def main():
    ttf, out_dir, chars_file, prefix = sys.argv[1:5]
    cmap = set(TTFont(ttf).getBestCmap().keys())
    wanted = sorted({ord(c) for c in open(chars_file, encoding='utf-8').read()} & cmap)
    kana = [cp for cp in wanted if is_kana(cp) or cp in (0x3005,)]
    kanji = [cp for cp in wanted if cp not in kana]
    slices = [kana] + [kanji[i:i + SLICE] for i in range(0, len(kanji), SLICE)]
    out = []
    for i, cps in enumerate(slices):
        if not cps:
            continue
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = []
        opts.desubroutinize = True
        font = TTFont(ttf)
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=cps)
        sub.subset(font)
        name = f'{prefix}{i:02d}.woff2'
        buf = io.BytesIO()
        font.flavor = 'woff2'
        font.save(buf)
        with open(f'{out_dir}/{name}', 'wb') as f:
            f.write(buf.getvalue())
        out.append([name, ''.join(chr(cp) for cp in cps)])
    print(json.dumps(out, ensure_ascii=False))

main()
