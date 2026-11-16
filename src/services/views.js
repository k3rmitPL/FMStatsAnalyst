// Saved table views: which players and columns to show, for a position or role.
//
// A view:
//   {
//     id, name, description,
//     positions: ['DC', ...],       show players who can play any of these (empty = everyone)
//     filters: [{ column, cmp, value, join: 'and' | 'or', enabled }],   extra conditions
//       (e.g. Minutes ≥ 600); an OR filter joins the group of the AND filter before it, every
//       group must match, and switched-off filters (enabled: false) are ignored
//     columns: ['DC Score', ...],   visible columns, in order
//     frozenLeft: [...], frozenRight: [...],   columns stuck to the table edges
//     sort: { column, direction: 'asc' | 'desc' } | null,
//   }

import { foldText, includesText } from '@/utils/text'

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
    const has = includesText(raw, filter.value)
    return filter.cmp === 'contains' ? has : !has
  }
  const compare = COMPARISONS[filter.cmp]?.apply
  if (!compare) return true
  const a = toNumber(raw)
  const b = Number(filter.value)
  // Numbers compare as numbers; anything else (text, dates) compares as text, ignoring case and
  // accents.
  if (a != null && filter.value !== '' && Number.isFinite(b)) return compare(a, b)
  return compare(foldText(raw), foldText(filter.value))
}

/** A filter with its optional fields filled in (older views have no `join` or `enabled`). */
export function normalizeFilter(filter, index = 1) {
  return {
    column: filter.column ?? '',
    cmp: filter.cmp,
    value: String(filter.value ?? ''),
    join: index > 0 && filter.join === 'or' ? 'or' : 'and',
    enabled: filter.enabled !== false,
  }
}

/**
 * Splits filters into groups: each AND filter starts a group and the OR filters after it join it.
 * The first filter always starts a group. Returns arrays of indexes into `filters`.
 */
export function filterGroups(filters) {
  const groups = []
  filters.forEach((f, i) => {
    if (i === 0 || f.join !== 'or' || !groups.length) groups.push([i])
    else groups[groups.length - 1].push(i)
  })
  return groups
}

/** Returns a row predicate for the view's position and column filters. */
export function viewRowFilter(view) {
  const positions = view?.positions ?? []
  const filters = view?.filters ?? []
  // Every group must match; within a group any active filter may match. Switched-off and
  // incomplete filters are skipped, and a group left with none of them matches everything.
  const groups = filterGroups(filters)
    .map((group) => group.map((i) => filters[i]).filter((f) => f.column && f.enabled !== false))
    .filter((group) => group.length)
  return (row) =>
    (!positions.length || positions.some((p) => row[p] === true)) &&
    groups.every((group) => group.some((f) => matchesFilter(row, f)))
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
  const { _groupId, ...rest } = view
  return rest
}

export function viewsFile(views) {
  return { type: 'fm-stats-analyst/views', version: 1, views: views.map(withoutGroup) }
}
