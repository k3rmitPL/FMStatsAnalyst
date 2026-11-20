// What a comparison chart (radar, later butterfly) shows, by how many players are selected:
//
//   no player    the filtered players' typical values  vs  the same positions in the whole dataset
//   one player   the player                            vs  the filtered players' typical values
//   two players  player A vs player B, with the filtered players faintly behind
//
// Shapes have a role: 'primary' ($accent-color), 'secondary' ($secondary-accent-color) or 'faint'.

import { aggregateRow, metricScale } from './stats'

// How many metrics a radar takes.
export const RADAR_MIN_METRICS = 3
export const RADAR_MAX_METRICS = 10

// Where each metric's 0-100 scale ends:
//   'shown'  the highest (and, with negative values, lowest) value among the drawn shapes, so the
//            leading shape reaches the edge on every axis
//   'pool'   the highest value of the scaling pool (positions pool with no player, else the
//            filtered players) and the selected players
export const SCALE_TO = 'shown'

// Draw the filtered players' typical values faintly behind two compared players.
export const SHOW_GROUP_WITH_TWO_PLAYERS = false

/**
 * @param players        selected players, 0-2: { name, row }
 * @param filteredRows   the filtered players
 * @param positionsRows  the same positions in the whole dataset (other filters ignored)
 * @param metrics        metric columns
 * @param aggregateKind  'mode' | 'median' | 'mean' | 'top'
 * @returns { mode: 'group' | 'player' | 'players', shapes: [{ key, name, role, values }],
 *            poolRows, playerRows }
 */
export function comparisonShapes({
  players,
  filteredRows,
  positionsRows,
  metrics,
  aggregateKind,
  columnInfo = {},
}) {
  const group = (key, name, rows, role) => ({
    key,
    name: `${name} · ${aggregateKind} (${rows.length})`,
    role,
    values: aggregateRow(rows, metrics, aggregateKind, columnInfo),
  })
  const player = (p, role) => ({
    key: `player-${role}`,
    name: p.name,
    role,
    values: Object.fromEntries(metrics.map((m) => [m, p.row[m]])),
  })
  const playerRows = players.map((p) => p.row)

  if (!players.length) {
    return {
      mode: 'group',
      shapes: [
        group('filtered', 'Filtered', filteredRows, 'primary'),
        group('positions', 'Same positions', positionsRows, 'secondary'),
      ],
      poolRows: positionsRows,
      playerRows,
    }
  }
  if (players.length === 1) {
    return {
      mode: 'player',
      shapes: [
        player(players[0], 'primary'),
        group('filtered', 'Filtered', filteredRows, 'secondary'),
      ],
      poolRows: filteredRows,
      playerRows,
    }
  }
  const shapes = [player(players[0], 'primary'), player(players[1], 'secondary')]
  if (SHOW_GROUP_WITH_TWO_PLAYERS) {
    shapes.unshift(group('filtered', 'Filtered', filteredRows, 'faint'))
  }
  return { mode: 'players', shapes, poolRows: filteredRows, playerRows }
}

/** The 0-100 scale of each metric for a comparison: { [metric]: scale | null }. */
export function comparisonScales(metrics, columnInfo, comparison, scaleTo = SCALE_TO) {
  const shownRows = comparison.shapes.map((s) => s.values)
  return Object.fromEntries(
    metrics.map((m) => [
      m,
      scaleTo === 'shown'
        ? metricScale(m, columnInfo?.[m], shownRows)
        : metricScale(m, columnInfo?.[m], comparison.poolRows, comparison.playerRows),
    ]),
  )
}
