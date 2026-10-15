# PROMPT-AGY — find the 20 detail stills

Brief for the Antigravity agent (`agy`). Self-contained: you do not need the rest of the repository
documentation to do this job. Everything you may write is under `assets/stills/`.

## Context

`/home/rayin/Projects/RE:casette-scroll` is a personal media shelf: ten films and ten games shown as
discs. Each title gets a detail page whose middle section is a **full-bleed still** from the work
itself (the page scrolls it with ±10 % vertical parallax and a centred caption sits over it). Today
the project has covers (1024² disc textures cropped from posters) and nothing else. Your job is to
find, for each of the 20 titles below, **one 16:9 frame from the work** and record where it came from.

Do not generate images. Do not edit code, `content/`, docs or anything outside `assets/stills/`.
Do not run any git or GitHub command. Never write secrets (API keys) into any file.

## Titles

Item `id` is the file stem you must use.

### Films

| id | title | year | director |
|---|---|---|---|
| `12-angry-men` | 12 Angry Men | 1957 | Sidney Lumet |
| `breakfast-at-tiffanys` | Breakfast at Tiffany's | 1961 | Blake Edwards |
| `dead-poets-society` | Dead Poets Society | 1989 | Peter Weir |
| `chungking-express` | Chungking Express | 1994 | Wong Kar-wai |
| `good-will-hunting` | Good Will Hunting | 1997 | Gus Van Sant |
| `the-truman-show` | The Truman Show | 1998 | Peter Weir |
| `resident-evil` | Resident Evil | 2002 | Paul W. S. Anderson |
| `the-perks-of-being-a-wallflower` | The Perks of Being a Wallflower | 2012 | Stephen Chbosky |
| `the-night-is-short-walk-on-girl` | The Night is Short, Walk on Girl | 2017 | Masaaki Yuasa |
| `other-mommy` | Other Mommy | 2026 | Rob Savage |

### Games

| id | title | year | studio | Steam app id |
|---|---|---|---|---|
| `dark-souls` | Dark Souls | 2011 | FromSoftware | 570940 |
| `the-elder-scrolls-v-skyrim` | The Elder Scrolls V: Skyrim | 2011 | Bethesda Game Studios | 489830 |
| `dark-souls-iii` | Dark Souls III | 2016 | FromSoftware | 374320 |
| `kingdom-come-deliverance` | Kingdom Come: Deliverance | 2018 | Warhorse Studios | 379430 |
| `sekiro-shadows-die-twice` | Sekiro: Shadows Die Twice | 2019 | FromSoftware | 814380 |
| `persona-5-royal` | Persona 5 Royal | 2019 | Atlus | 1687950 |
| `valorant` | Valorant | 2020 | Riot Games | — (not on Steam) |
| `elden-ring` | Elden Ring | 2022 | FromSoftware | 1245620 |
| `lies-of-p` | Lies of P | 2023 | Round8 Studio | 1627720 |
| `clair-obscur-expedition-33` | Clair Obscur: Expedition 33 | 2025 | Sandfall Interactive | 1903340 |

If your task line names a single `id`, do **only** that title and merge its entry into
`assets/stills/manifest.json` (read the file, replace or add that one entry, keep every other entry
byte-for-byte). Otherwise do all 20.

## What counts as a good still

Accept only a frame that is:

1. **From the work** — a film frame, an in-game screenshot, or official key art with no title
   lockup. Never a poster, a box cover, a disc/cover render, a thumbnail grid, fan art, AI art, or a
   "wallpaper" that has been edited.
2. **Clean** — no burned-in text: no title card, subtitles, credits, watermark (Getty / Alamy /
   Shutterstock preview marks), HUD, UI, platform badge, or "4K"/site overlays.
3. **Large enough without upscaling** — after you remove any black letterbox bars, a 16:9 crop of
   the image must still be **≥ 1920 × 1080**. Prefer ≥ 2400 × 1350. Reject smaller; do not upscale.
4. **Composed for a centred caption** — the page puts a headline and a button over the middle of
   the image, and the parallax moves the frame ±10 % vertically. So the subject (face, character,
   key object) should sit inside the **central 60 % vertical band**, and a calm, mid-to-dark centre
   beats a busy, bright one. Pick the frame that *represents the work*, not the most spectacular.
5. **One per title.** If two candidates are close, choose the cleaner one and mention the other in
   `notes`.

Films shot in 2.39:1 have little vertical resolution: apply rule 3 to the bars-removed frame and
accept it only if a 16:9 crop of it still passes. A 1.85:1 or 16:9 source is easier — prefer those.

## Where to look (in this order, stop at the first that passes)

**Films**
1. TMDB — the title's *Images → Backdrops* tab; prefer entries without a language tag (textless).
   Direct file URLs are `https://image.tmdb.org/t/p/original/<file>`.
2. fanart.tv — `movie background` for the title.
3. The studio's or distributor's press/media page (official press stills).
4. Wikimedia Commons, for titles that are public domain or freely licensed (check the file page).
5. A frame-grab archive (e.g. film-grab.com) — last resort; record the licence as `unknown`.

**Games**
1. Steam store: `https://store.steampowered.com/api/appdetails?appids=<app id>` →
   `data.screenshots[].path_full` (1920×1080, choose one with no HUD or the least HUD). The wide
   `library_hero.jpg` is 3.1:1 and almost never passes rule 3 — use it only if a 16:9 crop passes.
2. The publisher's or developer's press kit / official media page.
3. For titles not on Steam (`valorant`): the developer's official site or press kit.
4. Wikimedia Commons / MobyGames screenshots as a last resort (record the licence).

Search the open web as needed (searching is what this job is for). Open the page, find the **original
file URL** — not a resized proxy, not a thumbnail, not a page screenshot — and download that.

## Output

For every title that passes:

    assets/stills/incoming/<id>.<ext>      the original download, unmodified (jpg | png | webp)

Do not crop, resize, recompress or rename-convert it: a later tool normalises it to 2400×1350 WebP.

Then write or update **`assets/stills/manifest.json`**:

```json
{
  "generated_by": "agy",
  "note": "Third-party imagery for personal, non-commercial use. Do not redistribute.",
  "stills": [
    {
      "id": "the-truman-show",
      "kind": "films",
      "title": "The Truman Show",
      "file": "assets/stills/incoming/the-truman-show.jpg",
      "status": "ok",
      "source_url": "https://image.tmdb.org/t/p/original/xxxxxxxx.jpg",
      "source_page": "https://www.themoviedb.org/movie/37165-the-truman-show/images/backdrops",
      "provider": "TMDB",
      "source_size": "3840x2160",
      "licence_note": "unknown — TMDB states images are for personal use via its API terms",
      "focal": { "x": 0.5, "y": 0.45 },
      "notes": "textless backdrop; Truman centred, sky above"
    }
  ]
}
```

Field rules:

- `status`: `"ok"` (passes every rule), `"low-res"` (best available, fails rule 3 — still download it
  and say by how much), or `"missing"` (nothing acceptable found — then `file` is `null`).
- `source_size` is the **measured** size of the file you saved (`python3 -c "from PIL import Image;
  print(Image.open(p).size)"`), not the size the page claimed.
- `licence_note`: what the source actually says about reuse, quoted briefly; `"unknown"` when it says
  nothing. Do not invent a licence.
- `focal` is 0–1 within the **full** image (x from left, y from top): the point the crop must keep.

Also write **`assets/stills/REPORT.md`**: one table row per title (`id`, status, provider, measured
size, one-line reason) followed by a short list of anything you rejected and why (e.g. "all TMDB
backdrops carry the title lockup").

## Do not

- Substitute a poster, a cover or a screenshot of someone's wallpaper site to fill a gap — report
  `missing`.
- Hot-link, or leave the URL as the only record: the file must be on disk.
- Overwrite a file already in `assets/stills/incoming/` without saying so in `notes`.
- Spend more than a few searches per title on a dead end — record what you tried in `notes`.

## Done when

- `assets/stills/incoming/` holds one file per title that was found;
- `assets/stills/manifest.json` has exactly 20 entries (or one merged entry for a single-id task),
  valid JSON, every `source_size` measured;
- `assets/stills/REPORT.md` exists;
- your final message lists the 20 ids with `ok` / `low-res` / `missing` and nothing else changed.
