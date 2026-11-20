// Dashboards of the Charts tab: saved like views, not tied
// to a dataset. Cards refer to metrics by column name and to their player by name (and club), so
// a dashboard works on another import of the same game, e.g. the next season.
//
// Dashboard: { id, name, positions: string[], filters: Filter[], cards: Card[] }
//   positions and filters (see services/views.js) apply to every card.
// Card: { id, type: 'radar' | 'butterfly' | 'scatter', title,
//         positions: string[] | null    (null = the dashboard's positions)
//         metrics: string[]             (radar; scatter: [x, y])
//         columns: string[][]           (butterfly, 1-3 columns)
//         aggregate: 'mode' | 'median' | 'mean'
//         variant: 'plain' | 'quadrants' | 'diagonal', slope: 'ratio' | 'identity'  (scatter)
//         size: 'normal' | 'large'
//         player: { name, club } | null }

import { DEFAULT_AGGREGATE } from '@/services/charts/stats'
import { viewRowFilter } from '@/services/views'

// Charts comparing players and groups (the table's chart panel offers these).
export const COMPARISON_TYPES = [
  { value: 'radar', label: 'Radar' },
  { value: 'butterfly', label: 'Butterfly' },
]
export const CARD_TYPES = [...COMPARISON_TYPES, { value: 'scatter', label: 'Scatter' }]

export function newDashboard(name) {
  return { id: crypto.randomUUID(), name, positions: [], filters: [], cards: [] }
}

export function newCard(type = 'radar') {
  return {
    id: crypto.randomUUID(),
    type,
    title: '',
    positions: null,
    metrics: [],
    columns: [[]],
    aggregate: DEFAULT_AGGREGATE,
    variant: 'quadrants',
    slope: 'ratio',
    size: 'normal',
    player: null,
  }
}

/** A copy of a card with a new id. */
export function copyCard(card) {
  return { ...JSON.parse(JSON.stringify(card)), id: crypto.randomUUID() }
}

// Card sizes: the width of one square chart column (a butterfly has one per metric column).
export const CARD_SIZES = [
  { value: 'normal', label: 'Normal', columnsPerRow: 4 },
  { value: 'large', label: 'Large', columnsPerRow: 3 },
]

/** A stored dashboard with every field present (older or hand-edited files may miss some). */
export function normalizeDashboard(d) {
  return {
    ...newDashboard(String(d?.name ?? 'Dashboard')),
    ...d,
    positions: Array.isArray(d?.positions) ? d.positions : [],
    filters: Array.isArray(d?.filters) ? d.filters : [],
    cards: Array.isArray(d?.cards) ? d.cards.map((c) => ({ ...newCard(c?.type), ...c })) : [],
  }
}

/** The contents of a dashboards file (like a views file). */
export function dashboardsFile(dashboards) {
  return { type: 'fm-stats-analyst/dashboards', version: 1, dashboards }
}

/** The dashboards in a parsed dashboards file (or a plain list); throws when it has none. */
export function parseDashboardsFile(data) {
  const list = Array.isArray(data) ? data : data?.dashboards
  if (!Array.isArray(list)) throw new Error('The file does not contain a "dashboards" list.')
  return list.map((d, i) => {
    if (!d || typeof d.name !== 'string') throw new Error(`Dashboard #${i + 1} has no name.`)
    const dashboard = normalizeDashboard(d)
    return { ...dashboard, id: typeof d.id === 'string' && d.id ? d.id : crypto.randomUUID() }
  })
}

/** The positions a card uses: its own, or the dashboard's. */
export function cardPositions(dashboard, card) {
  return card.positions ?? dashboard.positions
}

/**
 * A card's filtered players: the dashboard's conditions and the card's positions (positions the
 * dataset has no column for are ignored, so they can't hide everyone).
 */
export function cardFilteredRows(rows, dashboard, card, columnInfo) {
  const positions = cardPositions(dashboard, card).filter((p) => columnInfo[p]?.type === 'boolean')
  const matches = viewRowFilter({ positions, filters: dashboard.filters })
  return rows.filter(matches)
}

/** The row of a card's player in this dataset: same name and club, else the first with the name. */
export function findPlayerRow(rows, player, nameColumn, clubColumn) {
  if (!player?.name) return null
  const named = rows.filter((r) => r[nameColumn] === player.name)
  return named.find((r) => r[clubColumn] === player.club) ?? named[0] ?? null
}
