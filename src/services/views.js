// Saved table views: which players and columns to show, for a position or role.
//
// A view:
//   {
//     id, name, description,
//     positions: ['DC', ...],       show players who can play any of these (empty = everyone)
//     filters: [{ column, cmp, value }],   extra conditions, all must match (e.g. Minutes ≥ 600)
//     columns: ['DC Score', ...],   visible columns, in order
//     frozenLeft: [...], frozenRight: [...],   columns stuck to the table edges
//     sort: { column, direction: 'asc' | 'desc' } | null,
//   }

import { COMPARISONS, toNumber } from './expression'

export const FILTER_COMPARISONS = {
  ...COMPARISONS,
  contains: { label: 'contains' },
  notContains: { label: 'does not contain' },
}

export function newView(name = 'New view') {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    positions: [],
    filters: [],
    columns: [],
    frozenLeft: [],
    frozenRight: [],
    sort: null,
  }
}

function matchesFilter(row, filter) {
  if (!filter.column) return true
  const raw = row[filter.column]
  if (filter.cmp === 'contains' || filter.cmp === 'notContains') {
    const has = String(raw ?? '')
      .toLowerCase()
      .includes(String(filter.value ?? '').toLowerCase())
    return filter.cmp === 'contains' ? has : !has
  }
  const compare = COMPARISONS[filter.cmp]?.apply
  if (!compare) return true
  const a = toNumber(raw)
  const b = Number(filter.value)
  // Numbers compare as numbers; anything else (text, dates) compares as text.
  if (a != null && filter.value !== '' && Number.isFinite(b)) return compare(a, b)
  return compare(String(raw ?? ''), String(filter.value ?? ''))
}

/** Returns a row predicate for the view's position and column filters. */
export function viewRowFilter(view) {
  const positions = view?.positions ?? []
  const filters = (view?.filters ?? []).filter((f) => f.column)
  return (row) =>
    (!positions.length || positions.some((p) => row[p] === true)) &&
    filters.every((f) => matchesFilter(row, f))
}

export function parseViewsFile(data) {
  const list = Array.isArray(data) ? data : data?.views
  if (!Array.isArray(list)) throw new Error('The file does not contain a "views" list.')
  return list.map((v, i) => {
    if (!v || typeof v.name !== 'string') throw new Error(`View #${i + 1} has no name.`)
    return {
      ...newView(v.name),
      ...withoutGroup(v),
      id: typeof v.id === 'string' && v.id ? v.id : crypto.randomUUID(),
    }
  })
}

/** A view without the `groupId` that older versions stored (views are not grouped). */
export function withoutGroup(view) {
  const { groupId, ...rest } = view
  return rest
}

export function viewsFile(views) {
  return { type: 'fm-stats-analyst/views', version: 1, views: views.map(withoutGroup) }
}
