/**
 * The detail page's strings, derived — never typed. Pure, so it is unit-tested.
 * Titles, credits and ratings come from shelf.json / notes.json; what is here is
 * only how a data row is split or labelled.
 */

/** content.md §3: a still is addressed by item id; there is no field in shelf.json. */
export const stillUrl = id => `assets/stills/${encodeURIComponent(id)}.webp`

/**
 * shelf.json `meta` is "Genre · 102 min" for films and "Genre · 2011" for games
 * (the year has its own row). → { genre, runtime }. `runtime` is null when the
 * tail is not a duration, so a game never gets a runtime row.
 */
export function splitMeta (meta) {
  if (!meta) return { genre: null, runtime: null }
  const at = meta.lastIndexOf(' · ')
  if (at < 0) return { genre: meta, runtime: null }
  const head = meta.slice(0, at), tail = meta.slice(at + 3)
  return /^\d+ min$/.test(tail) ? { genre: head || null, runtime: tail } : { genre: head || null, runtime: null }
}

/** "Next film" / "Next game" — from the section label, never hardcoded per title. */
export const nextKicker = section => `Next ${section.label.toLowerCase()}`
export const nextAria = (section, title) => `${nextKicker(section)}: ${title}`

/**
 * The next title, broken into at most `max` lines — one per hairline of the
 * scroll-next section (motion-spec.md §13.7). Words are never split; a title of
 * `max` words or fewer gets one word per line, a longer one is balanced by length.
 */
export function titleLines (title, max = 3) {
  const words = String(title ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length <= max) return words
  const target = words.join(' ').length / max
  const lines = ['']
  for (const w of words) {
    const cur = lines[lines.length - 1]
    if (cur && lines.length < max && cur.length + 1 + w.length / 2 > target) lines.push(w)
    else lines[lines.length - 1] = cur ? `${cur} ${w}` : w
  }
  return lines
}
