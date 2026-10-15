# Content & Cover Artwork

The data the page renders, and the pipeline that turns source posters into disc textures. Nothing
about titles, covers or ratings is hardcoded in the markup — `tools/verify.mjs` asserts it.

---

## 1. Data files

### 1.1 `content/shelf.json` — generated

Written by `tools/fetch-covers.py` from the same catalogue that drives the artwork fetch, so data
and covers cannot drift. **Do not hand-edit**; a regenerate overwrites it. Two sections, ten items
each, **oldest → newest by release year** (same-year titles keep catalogue order; the sort lives in
the script so a regenerate keeps it).

    curator    { name, tagline, pageLabel, indexLabel }
               indexLabel is the template `"{prefix} {n}"` used for the screen-reader status text;
               name / tagline / pageLabel are present in the file and not read by the page
    sections[] { id: "films" | "games", label, plural, prefix: "F" | "G", items[] }
    item       { id, index, title, year, cover, creditLabel, credit, secondary, meta,
                 quote, quoteSource, tmdbId | steamAppId }

| Field | Films | Games |
|---|---|---|
| `index` | 1-based position within the section, after the year sort | same |
| `cover` | `assets/covers/<slug>.webp` | same |
| `creditLabel` / `credit` | `Director` / director | `Studio` / studio |
| `secondary` | starring list, comma-separated | edition note (`Remastered`, `Special Edition`) or `null` |
| `meta` | `Genre · N min` | `Genre · year` (the copy drops the trailing year; it has its own row) |
| id key | `tmdbId` (all `null`) | `steamAppId` (`null` for Valorant) |

`quote` / `quoteSource` are `null` for every entry and nothing reads them: these are real works, and
a fabricated pull quote would be a fabricated attribution (`build-notes.md` §4).

### 1.2 `content/notes.json` — hand-written

The curator's rating + one-line note, kept apart from `shelf.json` so the generator can never wipe
it. Optional: without the file every note block stays hidden.

    label            "Rayina’s note"   — the tracked-caps source line above the quote
    items[<id>]      { rating, note }
                       rating  0–10 in halves, ten stars; null hides the whole block for that title
                       note    one short line; an empty note hides the quote and the label

---

## 2. Cover pipeline

`tools/fetch-covers.py` normalises every source image to a **1024² WebP disc texture** in
`assets/covers/`, and writes `content/shelf.json` and the previews.

```bash
export TMDB_API_KEY=xxxxxxxx           # films only; free key
python3 tools/fetch-covers.py          # both sections
python3 tools/fetch-covers.py --only games    # films | games
python3 tools/fetch-covers.py --check  # verify local files, fetch nothing
```

Other flags: `--out`, `--size` (default 1024), `--fit auto|crop|extend`.

| File | What it is |
|---|---|
| `assets/covers/<slug>.webp` | 1024² disc texture |
| `assets/covers/manifest.json` | Per cover of the last run: provider, source URL / path, source dimensions, `fit`, `anchor`; plus the `disc_texture` block (size, hub radius px, base colour) |
| `assets/covers/_contact-sheet.png` | Every cover as a flat square |
| `assets/covers/_disc-preview.png` | Every cover composited through the disc's annulus mask — **the one to look at** |
| `assets/covers/incoming/` | Drop `<slug>.jpg` here to override any fetch; these win over the network (git-ignored except `.gitkeep`) |

### 2.1 Sources

| Section | Source | Resolution | Key needed |
|---|---|---|---|
| Games | Steam `library_600x900_2x` from the public CDN | 600×900 | no |
| Valorant | Riot's own CMS, a transparent 1232² character render (no Steam storefront) | 1232×1232 | no |
| Films | TMDB `/t/p/original/` | up to ~1500 px | **yes** |

For films TMDB (free API key) is the only source that survived testing; every keyless source was
rejected. Without a key, film fetching is skipped with a message rather than producing something
wrong. The rejected sources (Letterboxd,
Wikipedia, IMDb, TMDB's website, HuggingFace datasets) and why are recorded in the script's
docstring.

### 2.2 Crop strategy

Both collections are **cropped**, so every pixel of a 1024² texture is real artwork — no blurred side
bands, no letterboxing. Both sources are 2:3 portrait, so filling a 1:1 square costs about a third of
the height; what gets cut is what the crop is aimed at, and that differs per cover.

`--fit auto` (the default) crops everything. `--fit extend` is kept for when you would rather keep
100 % of a poster than spend it on resolution: the whole source is height-fitted, the outer pixel
column is smeared into blurred side bands, and the artwork is lifted 5 % (`lift`). Every cover in
`manifest.json` is `fit: crop`.

**The anchor** is the fraction of the vertical excess cropped from the **top**: `1.0` keeps the
bottom, `0.0` keeps the top. Raising it does **not** slide content down the disc — it deletes it,
because the crop window moves up and off the top of the frame. That is the opposite of the intuition,
and why an earlier pass at `0.15`/`0.35` made three game covers strictly worse. Each value was
picked by rendering a sweep at `0.0 / 0.2 / 0.4 / 0.6 / 0.8 / 1.0` and looking at it. The values
live in `tools/fetch-covers.py` (`FILM_ANCHORS`, `anchor=` on `GAMES`) and in `manifest.json`; this
file records the rule and the result.

**Games — aim at the logo.** Box art is simple, one big title in the lower third, top third usually
sky. Default `1.0` (keep the bottom). Three override to `0.0` because the title sits high:

| Cover | Why |
|---|---|
| Clair Obscur: Expedition 33 | "EXPEDITION 33" is in the source's top ~10 % |
| Dark Souls | "DARK SOULS REMASTERED" is high |
| Elden Ring | "ELDEN RING" sits above the sigil |

Measured across `0.0 / 0.15 / 0.30`, only `0.0` leaves those titles intact and inside the rim.

**Films — aim at the face, and take the title too when both survive.** Posters put a title *and*
faces at opposite ends, so this is a real trade rather than a clear win.

| Film | Result |
|---|---|
| Good Will Hunting | two faces + `GOOD WILL HUNTING` |
| Breakfast at Tiffany's | Audrey's head + `BREAKFAST AT TIFFANY'S` |
| Chungking Express | two faces + vertical title |
| Dead Poets Society | `DEAD POETS SOCIETY` + the boys |
| 12 Angry Men | tagline + `12 ANGRY MEN` + Fonda |
| Other Mommy | face + `OTHER MOMMY` + tagline |
| The Night is Short, Walk on Girl | protagonist + title |
| The Truman Show | Carrey + `the TRUMAN show` |
| **The Perks of Being a Wallflower** | **faces only** — three faces, largest crop. The title sits above the window; the face wins. |
| **Resident Evil** | **title only** — no face in this poster, so nothing to prioritise. |

Nine of ten films show the face; eight of ten also show the title.

### 2.3 Why the geometry is awkward

The texture is a 1024² square, so every disc is a circle inscribed in it, with the hub punched out at
radius 122.88 px (`hubSize` 0.24 × the 512 px disc radius — `disc-3d-spec.md` §2). That leaves a
horizontal clear band for text:

    y = 0.05   201px clear      <- where tall top-set titles land
    y = 0.15   486px
    y = 0.30   693px            <- upper annulus, the safe band
    y = 0.50   778px            <- widest, but that is the hub
    y = 0.66   724px            <- lower annulus
    y = 0.88   420px

The widest point is the centre — and the centre is the hole. Any title crossing the vertical
centreline loses its middle to the hub and both ends to the rim. No anchor moves a title out of a bad
band and into a good one; the crop window only slides across the source.

A few titles still clip at the rim: *Good Will Hunting*'s title, *Resident Evil*'s final `L`,
*Breakfast at Tiffany's*'s bottom line, and on the game side *Elden Ring*'s E's, *Lies of P*'s S and
*Persona 5*'s P5. Each is simply wider than the disc is at that depth.

---

## 3. Detail stills

The detail page (`design-system.md` §4.8) needs one full-bleed still per title, which the cover
pipeline does not produce: covers are 1024² disc textures cropped from posters, a still is a 16:9
frame from the work itself. The finding brief is `PROMPT-AGY.md`; `tools/build-stills.py`
normalises the drop, and `src/detail/` loads `<id>.webp` by convention.

    python3 tools/build-stills.py [--only <id>]   # incoming/ → <id>.webp, updates manifest.json
    python3 tools/build-stills.py --check         # outputs exist and are 2400×1350; fetches nothing
    python3 tools/build-stills.py --root DIR      # a tree laid out like the repo (fixtures)

It removes solid black bars, crops 16:9 centred on `focal` (clamped, relative to the bar-free
frame), resizes with Lanczos and writes WebP q82. A bar-free crop under 1920×1080 is written
anyway and its `status` set to `low-res`.

    assets/stills/incoming/<id>.<jpg|png|webp>   raw drop, ≥ 1920×1080, any provenance that is recorded
    assets/stills/<id>.webp                      2400×1350, RGB, 16:9 — what the page loads
    assets/stills/manifest.json                  one entry per title, schema below

`<id>` is the item `id` in `content/shelf.json` (it equals the cover slug), so a still is addressed
by convention and no field is added to `shelf.json` (which is generated and must not be hand-edited).
A title with no `assets/stills/<id>.webp` is a supported state: the detail page omits the still
section instead of showing a placeholder.

`manifest.json`, one object per title:

    id            item id
    kind          "films" | "games"
    title         as in shelf.json
    file          "assets/stills/<id>.webp" once normalised; the incoming file name before
    status        "ok" | "low-res" | "missing"
    source_url    the image URL actually downloaded
    source_page   the page it was found on
    provider      host or publisher (TMDB, Steam, press kit, …)
    source_size   "WxH" of the raw file
    licence_note  what the source says about reuse, verbatim where short; "unknown" if it says nothing
    focal         { x, y } 0–1, the point that must survive the ±10 % parallax and any crop
    notes         free text: why this frame, what was rejected

Selection rules, which `PROMPT-AGY.md` repeats for the agent that does the search:

- a frame from the work (film still, in-game screenshot, official key art without title lockup) —
  never a poster, a cover, a thumbnail grid or a fan render;
- no burned-in text: no title card, subtitles, watermark, HUD, UI or platform badge;
- landscape, ≥ 1920×1080 before any crop; the page parallaxes ±10 % vertically, so the subject sits
  in the central 60 % band;
- recorded provenance for every file; personal, non-commercial use, same licence stance as the
  covers (§4).

---

## 4. Licence

The artwork is third-party and for personal, non-commercial use only — see `README.md` "Licence /
attribution". Do not publish the repository with `assets/covers/` (or `assets/stills/`) in it.
