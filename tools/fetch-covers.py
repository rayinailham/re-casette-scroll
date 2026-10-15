#!/usr/bin/env python3
"""
fetch-covers.py — build the disc artwork for Rayina Ilham's two carousels.

    python3 tools/fetch-covers.py                 # fetch everything possible
    python3 tools/fetch-covers.py --only games    # games | films
    python3 tools/fetch-covers.py --check         # verify local files, fetch nothing

--------------------------------------------------------------------------
WHERE THE IMAGES COME FROM
--------------------------------------------------------------------------
games   Steam's `library_600x900_2x` capsule (600x900 portrait) from the public
        CDN, no key needed. Valorant has no Steam storefront, so it comes from
        Riot's own CMS as a 1232x1232 transparent PNG of two agents.

films   Needs a free TMDB API key:

            export TMDB_API_KEY=xxxxxxxx
            python3 tools/fetch-covers.py

        without it, film fetching is skipped with a clear message rather than
        silently producing something wrong.

        Why a key is required -- every keyless source was tried and rejected:
          Letterboxd   serves 0/10 real posters to an unauthenticated client;
                       the page is JS-rendered and og:image is a 16:9 backdrop.
          Wikipedia    fair-use posters are stored at 250-266px wide. Unusable
                       as a 1024 texture.
          IMDb         returns a 2KB JS shell, no image metadata.
          TMDB web     403s automated fetches; the API does not.
          Datasets     HuggingFace poster sets are gated or empty.

        You don't have to use TMDB. Drop your own files in
        `assets/covers/incoming/` named `<slug>.jpg` and they win over any fetch.

--------------------------------------------------------------------------
LEGAL
--------------------------------------------------------------------------
This artwork is copyrighted by the respective studios and publishers. It is here
for personal, local, non-commercial use. Do not publish the repository with the
images in it. See README "Licence / attribution".
"""

import argparse
import io
import json
import os
import struct
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "covers"
INCOMING = OUT / "incoming"

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36"
)
SIZE = 1024

# The disc texture builder fills the annulus with this before drawing artwork.
DISC_BASE = (0x0C, 0x0C, 0x0E)
# texture builder: arc(r = t*0.12) -> inner punch radius 122.88px at t=1024
HUB_RADIUS = 122.88

# --------------------------------------------------------------------------
# Catalogue
# --------------------------------------------------------------------------

# anchor: fraction of the vertical excess cropped from the TOP. 1.0 keeps the
# bottom, 0.0 keeps the top. Each film below was picked by rendering a sweep at
# 0.0/0.2/0.4/0.6/0.8/1.0 and choosing on the rule "face first, title too when
# both survive". A 2:3 poster squaring up to a disc loses a third of its height,
# and film posters put the title and the faces at opposite ends, so most of
# these are a genuine trade rather than a clear win.
#
#   Perks of Being a Wallflower  1.0  faces only; the title sits above the crop
#   Resident Evil               0.7  this poster has no face, so the title wins
#
FILM_ANCHORS = {
    "good-will-hunting": 0.6,
    "the-perks-of-being-a-wallflower": 1.0,
    "chungking-express": 0.4,
    "resident-evil": 0.7,
    "dead-poets-society": 0.3,
    "other-mommy": 0.8,
    "the-truman-show": 1.0,
    "breakfast-at-tiffanys": 0.5,
    "12-angry-men": 0.5,
    "the-night-is-short-walk-on-girl": 0.5,
}

FILMS = [
    dict(query="Good Will Hunting", slug="good-will-hunting",
         title="Good Will Hunting", year=1997, director="Gus Van Sant",
         starring="Robin Williams, Matt Damon, Ben Affleck",
         genre="Drama", runtime=126),
    dict(query="The Perks of Being a Wallflower", slug="the-perks-of-being-a-wallflower",
         title="The Perks of Being a Wallflower", year=2012,
         director="Stephen Chbosky",
         starring="Emma Watson, Ezra Miller, Paul Rudd",
         genre="Drama, Romance", runtime=102),
    dict(query="Chungking Express", slug="chungking-express",
         title="Chungking Express", year=1994, director="Wong Kar-wai",
         starring="Brigitte Lin, Takeshi Kaneshiro, Tony Leung Chiu-wai",
         genre="Drama, Romance", runtime=102),
    dict(query="Resident Evil", slug="resident-evil", year=2002,
         title="Resident Evil", director="Paul W. S. Anderson",
         starring="Milla Jovovich, Ali Larter, Margo Harshman",
         genre="Action, Sci-Fi, Horror", runtime=100),
    dict(query="Dead Poets Society", slug="dead-poets-society",
         title="Dead Poets Society", year=1989, director="Peter Weir",
         starring="Robin Williams, Ethan Hawke, Robert Sean Leonard",
         genre="Drama", runtime=128),
    dict(query="Other Mommy", slug="other-mommy", title="Other Mommy",
         year=2026, director="Rob Savage",
         starring="Jessica Chastain, Jay Duplass, Arabella Olivia Clark",
         genre="Horror", runtime=93),
    dict(query="The Truman Show", slug="the-truman-show",
         title="The Truman Show", year=1998, director="Peter Weir",
         starring="Jim Carrey, Ed Harris, Laura Linney",
         genre="Drama, Sci-Fi", runtime=103),
    dict(query="Breakfast at Tiffany's", slug="breakfast-at-tiffanys",
         title="Breakfast at Tiffany's", year=1961, director="Blake Edwards",
         starring="Audrey Hepburn, Henry Fonda, George Peppard",
         genre="Romance, Comedy", runtime=118),
    dict(query="12 Angry Men", slug="12-angry-men", title="12 Angry Men",
         year=1957, director="Sidney Lumet",
         starring="Henry Fonda, Lee J. Cobb, E. G. Marshall",
         genre="Drama", runtime=96),
    dict(query="The Night Is Short Walk on Girl",
         slug="the-night-is-short-walk-on-girl",
         title="The Night is Short, Walk on Girl", year=2017,
         director="Masaaki Yuasa",
         starring="Gen Hoshino, Kana Hanazawa, Hiroshi Kamiya",
         genre="Animation, Romance", runtime=91),
]

VALORANT_ART = (
    "https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/"
    "1d62a3751be9d7abfce84da8ca89be7d79f07fed-1232x1232.png"
)

GAMES = [
    # anchor: fraction of the 300px vertical excess cropped from the TOP.
    # 1.0 (the default) crops it all from the top, i.e. keeps the BOTTOM -- right
    # for box art whose logo sits low, which is most of them.
    #
    # These three override it to 0.0, i.e. they keep the TOP instead, because
    # their title sits in the source image's top ~10%. Raising the anchor does
    # not slide the title down -- it deletes it, because the crop window moves up
    # past it. Measured across a=0.0/0.15/0.30, only 0.0 leaves the title intact
    # and inside the rim.
    dict(appid=1903340, title="Clair Obscur: Expedition 33", slug="clair-obscur-expedition-33",
         year=2025, studio="Sandfall Interactive", genre="Turn-Based RPG", note=None,
         anchor=0.0),
    dict(appid=570940, title="Dark Souls", slug="dark-souls",
         year=2011, studio="FromSoftware", genre="Action RPG",
         note="Remastered", anchor=0.0),
    dict(appid=374320, title="Dark Souls III", slug="dark-souls-iii",
         year=2016, studio="FromSoftware", genre="Action RPG", note=None),
    dict(appid=1245620, title="Elden Ring", slug="elden-ring",
         year=2022, studio="FromSoftware", genre="Action RPG", note=None,
         anchor=0.0),
    dict(appid=814380, title="Sekiro: Shadows Die Twice", slug="sekiro-shadows-die-twice",
         year=2019, studio="FromSoftware", genre="Action RPG", note=None),
    dict(appid=1627720, title="Lies of P", slug="lies-of-p",
         year=2023, studio="Round8 Studio", genre="Action RPG", note=None),
    dict(appid=1687950, title="Persona 5 Royal", slug="persona-5-royal",
         year=2019, studio="Atlus", genre="Turn-Based RPG", note=None),
    dict(appid=379430, title="Kingdom Come: Deliverance", slug="kingdom-come-deliverance",
         year=2018, studio="Warhorse Studios", genre="Open-World RPG", note=None),
    dict(appid=489830, title="The Elder Scrolls V: Skyrim", slug="the-elder-scrolls-v-skyrim",
         year=2011, studio="Bethesda Game Studios", genre="Open-World RPG",
         note="Special Edition"),
    dict(appid=None, title="Valorant", slug="valorant",
         year=2020, studio="Riot Games", genre="Tactical FPS", note=None,
         direct=VALORANT_ART),
]

# --------------------------------------------------------------------------
# Network
# --------------------------------------------------------------------------


def get(url, timeout=30, tries=3):
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "text/html,image/avif,image/webp,image/*,*/*",
                    "Accept-Language": "en-US,en;q=0.9",
                },
            )
            return urllib.request.urlopen(req, timeout=timeout).read()
        except Exception as exc:  # noqa: BLE001 - retry anything
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url}: {last}")


def steam_capsule(appid):
    return f"https://cdn.steamstatic.com/steam/apps/{appid}/library_600x900_2x.jpg"


def tmdb_poster(query, api_key):
    """Resolve a film poster to a TMDB original-resolution path."""
    base = "https://api.themoviedb.org/3"
    found = json.loads(
        get(f"{base}/search/movie?api_key={api_key}&query="
            f"{urllib.parse.quote(query)}&language=en-US")
    )
    results = found.get("results") or []
    if not results:
        raise RuntimeError(f"TMDB found nothing for {query!r}")
    # Prefer an English-original poster; fall back to the best match.
    best = next(
        (r for r in results if (r.get("original_language") or "").startswith("en")),
        results[0],
    )
    path = best.get("poster_path")
    if not path:
        raise RuntimeError(f"TMDB result for {query!r} has no poster")
    meta = json.loads(
        get(f"{base}/movie/{best['id']}?api_key={api_key}&language=en-US")
    )
    credits = meta.get("credits", {}).get("cast", [])
    return {
        "url": f"https://image.tmdb.org/t/p/original{path}",
        "tmdb_id": best["id"],
        "tmdb_title": best.get("title"),
        "release_date": meta.get("release_date"),
        "runtime": meta.get("runtime"),
        "genres": [g["name"] for g in meta.get("genres", [])],
        "director": next(
            (c["name"] for c in meta.get("credits", {}).get("crew", [])
             if c.get("job") == "Director"),
            None,
        ),
        "starring": ", ".join(c["name"] for c in credits[:3]),
    }


# --------------------------------------------------------------------------
# Image pipeline
# --------------------------------------------------------------------------


def _flatten(img):
    """Composite any alpha onto the disc base colour."""
    if img.mode in ("RGBA", "LA") or "transparency" in img.info:
        base = Image.new("RGB", img.size, DISC_BASE)
        base.paste(img.convert("RGBA"), (0, 0), img.convert("RGBA").getchannel("A"))
        return base
    return img.convert("RGB")


def _square_crop(img, size, anchor=1.0):
    """
    Crop the source to a square -- every output pixel is real artwork.

    Box art is 2:3 portrait, so filling a 1:1 square costs ~33% of the height.
    The crop is anchored to the BOTTOM because box art puts its logo in the lower
    third: a centre crop deletes Persona 5 Royal's "PERSONA ROYAL" and Clair
    Obscur's "EXPEDITION 33", while a bottom-anchored one keeps both. The cost is
    the top third of the artwork, which is usually sky or background.

    Measured against the set, bottom-anchored wins on eight of the ten covers
    and loses nothing on the ones that don't. The two exceptions -- Clair Obscur
    and Dark Souls -- carry their title in the top third instead, so they carry
    an explicit `anchor` of 0.35 in the catalogue and keep the top instead.
    """
    w, h = img.size
    side = min(w, h)
    top = int((h - side) * anchor)
    return img.crop((0, top, w, top + side)).resize((size, size),
                                                   Image.Resampling.LANCZOS)


def _square_extend(img, size, lift=0.05):
    """
    Fit the whole artwork into `size` square, then synthesise the leftover bands.

    Kept for sources where losing the top third would be worse than a soft edge
    -- film posters, which are almost entirely key art with the title already in
    the upper third, and where the blurred side bands read as art falling off the
    rim. Portrait GAME art uses `_square_crop` instead; see there for why.
    """
    w, h = img.size
    scale = size / h
    core_w = max(1, round(w * scale))
    core = img.resize((core_w, size), Image.Resampling.LANCZOS)
    pad = (size - core_w) // 2
    if pad <= 0:
        return core.resize((size, size), Image.Resampling.LANCZOS)

    out = Image.new("RGB", (size, size), DISC_BASE)
    blur = 9
    left = core.crop((0, 0, 1, size)).resize((pad, size), Image.Resampling.BILINEAR)
    right = core.crop((core_w - 1, 0, core_w, size)).resize((size - pad, size),
                                                           Image.Resampling.BILINEAR)
    out.paste(left.filter(ImageFilter.GaussianBlur(blur)), (0, 0))
    out.paste(right.filter(ImageFilter.GaussianBlur(blur)), (core_w + pad, 0))
    out.paste(core, (pad, int(lift * size)))
    return out


def to_disc_texture(blob, size=SIZE, fit="crop", anchor=1.0, lift=0.0):
    """Normalise any source image to a `size` square disc texture.

    fit="crop"    every pixel is real artwork; a 2:3 source loses a third of
                  its height, so the crop is anchored per cover
    fit="extend"  the whole source is kept and the side bands are smeared from
                  the poster's own edge pixels
    """
    img = _flatten(Image.open(io.BytesIO(blob)))
    src_w, src_h = img.size
    portrait = src_h > src_w * 1.05
    if not portrait:
        out = img.resize((size, size), Image.Resampling.LANCZOS)
    elif fit == "extend":
        out = _square_extend(img, size, lift)
    else:
        out = _square_crop(img, size, anchor)
    # Counteract upscale softness. Subtle on purpose -- a heavy mask on cover
    # art reads as crunchy rather than sharp.
    out = out.filter(ImageFilter.UnsharpMask(radius=1.6, percent=48, threshold=3))
    return out, (src_w, src_h)


def disc_preview(tex, size=SIZE):
    """Composite a texture the way the disc front face does: annulus, hub punched."""
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, size - 1, size - 1), fill=255)
    # ImageDraw.ellipse takes a BOUNDING BOX, so half the radius is the offset.
    r = HUB_RADIUS / SIZE * size
    mid = size / 2
    d.ellipse((mid - r, mid - r, mid + r, mid + r), fill=0)
    out = Image.new("RGB", (size, size), (0x15, 0x16, 0x1A))
    out.paste(tex, (0, 0), mask)
    return out


def contact_sheet(paths, path, cols=5, cell=300):
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), (0x10, 0x10, 0x14))
    for i, p in enumerate(paths):
        with Image.open(p) as im:
            sheet.paste(im.convert("RGB").resize((cell, cell), Image.Resampling.LANCZOS),
                        ((i % cols) * cell, (i // cols) * cell))
    sheet.save(path)


def emit_content(path, tmdb_by_slug):
    """
    Write content/shelf.json -- the display data for both carousels.

    Generated from the same catalogue that drives the fetch, so metadata and
    artwork can't drift apart. Each shelf runs oldest to newest by release year
    (a stable sort, so same-year titles keep their catalogue order). `quote` and `source` are deliberately null: these
    are real films and real games, so inventing pull quotes or fake reviewer
    credit would just be misinformation. Fill them in with a real citation, or
    leave them null and hide the testimonial block in the UI.
    """
    def film_item(f, i):
        t = tmdb_by_slug.get(f["slug"], {})
        return {
            "id": f["slug"],
            "index": i + 1,
            "title": f["title"],
            "year": f["year"],
            "cover": f"assets/covers/{f['slug']}.webp",
            "creditLabel": "Director",
            "credit": f["director"],
            "secondary": f["starring"],
            "meta": f"{f['genre']} · {f['runtime']} min",
            "quote": None,
            "quoteSource": None,
            "tmdbId": t.get("tmdb_id"),
        }

    def game_item(g, i):
        return {
            "id": g["slug"],
            "index": i + 1,
            "title": g["title"],
            "year": g["year"],
            "cover": f"assets/covers/{g['slug']}.webp",
            "creditLabel": "Studio",
            "credit": g["studio"],
            "secondary": g["note"],
            "meta": f"{g['genre']} · {g['year']}",
            "quote": None,
            "quoteSource": None,
            "steamAppId": g["appid"],
        }

    doc = {
        "curator": {
            "name": "Rayina Ilham",
            "tagline": "Ten films, ten games, one shelf",
            "pageLabel": "Rayina Ilham {page}",
            "indexLabel": "{prefix} {n}",
        },
        "sections": [
            {
                "id": "films",
                "label": "Film",
                "plural": "Films",
                "prefix": "F",
                "items": [film_item(f, i) for i, f in enumerate(sorted(FILMS, key=lambda f: f["year"]))],
            },
            {
                "id": "games",
                "label": "Game",
                "plural": "Games",
                "prefix": "G",
                "items": [game_item(g, i) for i, g in enumerate(sorted(GAMES, key=lambda g: g["year"]))],
            },
        ],
    }
    Path(path).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return doc


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(OUT))
    ap.add_argument("--only", choices=["films", "games"], default=None)
    ap.add_argument("--size", type=int, default=SIZE)
    ap.add_argument("--check", action="store_true", help="verify local files only")
    ap.add_argument("--fit", choices=["auto", "crop", "extend"], default="auto",
                    help="auto (default) = crop everything; "
                         "crop = all real artwork, loses a third of the height; "
                         "extend = keeps everything, smears the side bands")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    key = os.environ.get("TMDB_API_KEY", "").strip()

    jobs = []
    if args.only != "games":
        jobs += [("films", f) for f in FILMS]
    if args.only != "films":
        jobs += [("games", g) for g in GAMES]

    manifest, failures = [], []

    for kind, meta in jobs:
        slug = meta["slug"]
        dest = out / f"{slug}.webp"
        entry = {"id": slug, "kind": kind, "title": meta["title"],
                 "year": meta["year"]}

        if args.check:
            if not dest.exists():
                failures.append(f"{dest}: missing")
                continue
            with Image.open(dest) as im:
                entry["size"] = f"{im.width}x{im.height}"
                if (im.width, im.height) != (args.size, args.size):
                    failures.append(f"{dest}: {im.width}x{im.height}, want {args.size}^2")
            manifest.append(entry)
            continue

        # A hand-supplied file always wins.
        local = next(
            (p for ext in ("jpg", "jpeg", "png", "webp")
             for p in [INCOMING / f"{slug}.{ext}"] if p.exists()),
            None,
        )
        try:
            if local:
                blob, provider = local.read_bytes(), "local"
                src = str(local.relative_to(ROOT))
            elif kind == "games":
                src = meta.get("direct") or steam_capsule(meta["appid"])
                provider = "riot-cms" if meta.get("direct") else "steam"
                blob = get(src)
            else:
                if not key:
                    failures.append(f"{meta['title']}: no TMDB_API_KEY and no local file")
                    print(f"  films {meta['title']:34s} SKIPPED — set TMDB_API_KEY "
                          f"or drop {slug}.jpg in assets/covers/incoming/",
                          file=sys.stderr)
                    continue
                info = tmdb_poster(meta["query"], key)
                src, provider = info["url"], "tmdb"
                blob = get(src)
                entry["tmdb"] = {k: info[k] for k in
                                 ("tmdb_id", "tmdb_title", "release_date",
                                  "runtime", "genres")}

            # crop keeps every pixel real. What gets cut is what the crop is
            # aimed at: games at the low logo, films at the face.
            fit = args.fit if args.fit != "auto" else "crop"
            # 0.0 is a meaningful anchor, so this must be an explicit None test --
            # `meta.get("anchor") or default` would swallow it, because 0.0 is
            # falsy in Python.
            anchor = meta.get("anchor")
            if anchor is None:
                anchor = FILM_ANCHORS.get(meta["slug"], 1.0)

            img, src_dims = to_disc_texture(blob, args.size, fit, anchor)
            img.save(dest, "WEBP", quality=92, method=6)

            entry.update(
                fit=fit,
                anchor=anchor,
                provider=provider,
                source=src,
                source_size=f"{src_dims[0]}x{src_dims[1]}",
                size=f"{args.size}x{args.size}",
                path=f"assets/covers/{dest.name}",
            )
            manifest.append(entry)
            print(f"  {kind:5s} {meta['title']:36s} {src_dims[0]}x{src_dims[1]:<5}"
                  f" -> {args.size}^2  [{provider}]")
            time.sleep(0.35)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{meta['title']}: {exc}")
            print(f"  {kind:5s} {meta['title']:36s} FAILED: {exc}", file=sys.stderr)

    if not args.check:
        present = [out / f"{m['slug']}.webp" for _, m in jobs
                   if (out / f"{m['slug']}.webp").exists()]
        if present:
            contact_sheet(present, out / "_contact-sheet.png")
            previews = []
            for p in present:
                with Image.open(p) as im:
                    previews.append(disc_preview(im.convert("RGB")))
            cols = 5
            rows = (len(previews) + cols - 1) // cols
            sheet = Image.new("RGB", (cols * 256, rows * 256), (0x0B, 0x0B, 0x0E))
            for i, im in enumerate(previews):
                sheet.paste(im.resize((256, 256), Image.Resampling.LANCZOS),
                            ((i % cols) * 256, (i // cols) * 256))
            sheet.save(out / "_disc-preview.png")

        tmdb_by_slug = {
            e["id"]: e["tmdb"] for e in manifest
            if e.get("kind") == "films" and e.get("tmdb")
        }
        content_path = ROOT / "content" / "shelf.json"
        content_path.parent.mkdir(parents=True, exist_ok=True)
        emit_content(content_path, tmdb_by_slug)

        (out / "manifest.json").write_text(
            json.dumps(
                {
                    "curator": "Rayina Ilham",
                    "generated_by": "tools/fetch-covers.py",
                    "disc_texture": {
                        "size": args.size,
                        "hub_radius_px": round(HUB_RADIUS, 2),
                        "base_colour": "#%02x%02x%02x" % DISC_BASE,
                    },
                    "note": ("Third-party cover art for personal, non-commercial "
                             "use. Do not redistribute."),
                    "count": len(manifest),
                    "covers": manifest,
                },
                indent=2,
            ) + "\n"
        )
        print(f"\n✓ {len(manifest)}/{len(jobs)} covers -> {out}")

    if failures:
        print(f"\n✗ {len(failures)} problem(s):", file=sys.stderr)
        for f in failures:
            print(f"    {f}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())