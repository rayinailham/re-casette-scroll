/**
 * The detail route. One document, two views: the shelf at no hash, a title at
 * `#/<item id>`. Pure — no DOM, no history — so it is unit-testable.
 * build-notes.md §4 (own hash router, not Barba).
 */

export const hashFor = id => `#/${encodeURIComponent(id)}`

/**
 * `#/<id>` → the id, or null. An id that is not on the shelf is ignored rather
 * than shown as an empty page. `ids` is any iterable of known item ids.
 */
export function parseHash (hash, ids) {
  const m = /^#\/([^/?#]+)\/?$/.exec(hash ?? '')
  if (!m) return null
  let id
  try { id = decodeURIComponent(m[1]) } catch { return null }
  for (const known of ids) if (known === id) return id
  return null
}

/**
 * The id after `id` in `items` (one section's items, in shelf order), wrapping
 * past the end so the page is endless. null for an id that is not in `items`.
 */
export function nextId (items, id) {
  const ids = items.map(i => i.id ?? i)
  const at = ids.indexOf(id)
  return at < 0 ? null : ids[(at + 1) % ids.length]
}

/** { section, item } for an id anywhere on the shelf, or null. */
export function locate (sections, id) {
  for (const section of sections) {
    const item = section.items.find(i => i.id === id)
    if (item) return { section, item }
  }
  return null
}
