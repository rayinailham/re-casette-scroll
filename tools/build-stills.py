#!/usr/bin/env python3
"""Normalise the detail stills. content.md §3.

    assets/stills/incoming/<id>.<jpg|jpeg|png|webp>   raw drop, any size
    assets/stills/<id>.webp                           2400x1350, RGB, WebP q82

For every manifest entry: remove solid black letterbox / pillarbox bars, take the
largest 16:9 crop of what is left centred on `focal` (clamped so the crop stays
inside the frame), resize to 2400x1350 with Lanczos and write the WebP. The
manifest is updated in place: `file` -> the .webp, `status` -> "ok" | "low-res".
`source_size` is the raw file's size as the finder recorded it and is not touched.

`low-res` means the bar-free 16:9 crop is under 1920x1080, i.e. the page will show
an upscaled image. The file is still written (the page loads one fixed size); the
status is what tells a human to find a better frame. The script never invents
pixels any other way: no sharpening, no AI upscale.

    python3 tools/build-stills.py                 # every entry
    python3 tools/build-stills.py --only dark-souls
    python3 tools/build-stills.py --check         # outputs exist and are 2400x1350; fetches nothing
    python3 tools/build-stills.py --root DIR      # a tree laid out like the repo (fixtures, tests)

Pillow only.
"""
import argparse
import json
import sys
from pathlib import Path

from PIL import Image

OUT_W, OUT_H = 2400, 1350
LOW_W, LOW_H = 1920, 1080
QUALITY = 82
EXTS = ('.jpg', '.jpeg', '.png', '.webp')
# A bar row/column is "black" when its brightest sample is at or under this. JPEG
# ringing next to a hard edge keeps real bars a few levels above 0.
BAR_MAX = 16
# Never trim more than this share of an edge: a dark frame is not a bar.
BAR_LIMIT = 0.30


def bar_free_box(img):
    """(left, top, right, bottom) of the image with solid-black edge bars removed."""
    g = img.convert('L')
    w, h = g.size

    def dark_run(count, cap, extrema):
        n = 0
        while n < cap and extrema(n)[1] <= BAR_MAX:
            n += 1
        return n

    top = dark_run(h, int(h * BAR_LIMIT), lambda i: g.crop((0, i, w, i + 1)).getextrema())
    bottom = dark_run(h, int(h * BAR_LIMIT), lambda i: g.crop((0, h - 1 - i, w, h - i)).getextrema())
    left = dark_run(w, int(w * BAR_LIMIT), lambda i: g.crop((i, 0, i + 1, h)).getextrema())
    right = dark_run(w, int(w * BAR_LIMIT), lambda i: g.crop((w - 1 - i, 0, w - i, h)).getextrema())
    return left, top, w - right, h - bottom


def crop_16_9(box, focal):
    """Largest 16:9 rectangle inside `box`, centred on focal (0-1 within `box`), clamped."""
    l, t, r, b = box
    w, h = r - l, b - t
    fx = min(1.0, max(0.0, float(focal.get('x', 0.5))))
    fy = min(1.0, max(0.0, float(focal.get('y', 0.5))))
    if w * 9 >= h * 16:                       # wider than 16:9 -> trim the sides
        cw, ch = round(h * 16 / 9), h
    else:                                     # taller -> trim top and bottom
        cw, ch = w, round(w * 9 / 16)
    x = min(max(round(fx * w - cw / 2), 0), w - cw)
    y = min(max(round(fy * h - ch / 2), 0), h - ch)
    return l + x, t + y, l + x + cw, t + y + ch


def find_source(stills, entry):
    for ext in EXTS:
        p = stills / 'incoming' / f"{entry['id']}{ext}"
        if p.exists():
            return p
    return None


def build_one(stills, entry):
    src = find_source(stills, entry)
    out = stills / f"{entry['id']}.webp"
    if src is None:
        return 'no-source', None
    with Image.open(src) as im:
        im = im.convert('RGB')
        box = crop_16_9(bar_free_box(im), entry.get('focal') or {})
        cw, ch = box[2] - box[0], box[3] - box[1]
        im.crop(box).resize((OUT_W, OUT_H), Image.LANCZOS).save(out, 'WEBP', quality=QUALITY, method=6)
    entry['file'] = f"assets/stills/{entry['id']}.webp"
    entry['status'] = 'ok' if cw >= LOW_W and ch >= LOW_H else 'low-res'
    return entry['status'], f'{cw}x{ch}'


def check(stills, entries):
    bad = 0
    for e in entries:
        p = stills / f"{e['id']}.webp"
        if not p.exists():
            print(f"MISSING  {e['id']}")
            bad += 1
            continue
        with Image.open(p) as im:
            if im.size != (OUT_W, OUT_H) or im.mode != 'RGB':
                print(f"BAD      {e['id']}  {im.size} {im.mode}")
                bad += 1
                continue
        print(f"ok       {e['id']}")
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--only', help='one item id')
    ap.add_argument('--check', action='store_true', help='verify outputs exist and are 2400x1350')
    ap.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    args = ap.parse_args()

    stills = args.root / 'assets' / 'stills'
    manifest_path = stills / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    entries = [e for e in manifest['stills'] if not args.only or e['id'] == args.only]
    if args.only and not entries:
        sys.exit(f"no manifest entry for {args.only!r}")

    if args.check:
        sys.exit(1 if check(stills, entries) else 0)

    missing = 0
    for e in entries:
        status, size = build_one(stills, e)
        if status == 'no-source':
            print(f"no-source {e['id']}  (nothing in assets/stills/incoming/)")
            missing += 1
        else:
            print(f"{status:8} {e['id']}  crop {size}")
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    sys.exit(1 if missing else 0)


if __name__ == '__main__':
    main()
