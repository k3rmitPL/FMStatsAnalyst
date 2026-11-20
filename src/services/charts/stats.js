// Calculations shared by the charts: the player
// pools, a group's typical value per metric (mode, median or mean), and scaling each metric to
// 0-100 for the radar and butterfly charts.

import { viewRowFilter } from '@/services/views'
import { isLowerBetter } from '@/utils/columns'

export const AGGREGATES = [
  { value: 'mode', label: 'Mode' },
  { value: 'median', label: 'Median' },
  { value: 'mean', label: 'Mean' },
]
// Radar and butterfly charts can also compare against the group's best value of each metric (its
// highest, or lowest for lower-is-better metrics). Not for the scatter's reference lines.
export const COMPARISON_AGGREGATES = [...AGGREGATES, { value: 'top', label: 'Top' }]
export const DEFAULT_AGGREGATE = 'median'

// --- Pools ---------------------------------------------------------------------------------------

/**
 * The positions pool: every row of the dataset that plays one of `positions` (all rows when none
 * are given), ignoring every other filter. `columnInfo` limits it to positions the dataset has.
 */
export function positionsPool(rows, positions, columnInfo) {
  const known = (positions ?? []).filter((p) => columnInfo?.[p]?.type === 'boolean')
  if (!known.length) return rows
  const matches = viewRowFilter({ positions: known, filters: [] })
  return rows.filter(matches)
}

// --- Values --------------------------------------------------------------------------------------

/** The finite numbers in a column of some rows (empty and non-number values skipped). */
export function columnValues(rows, column) {
  const values = []
  for (const row of rows) {
    const value = row?.[column]
    if (typeof value === 'number' && Number.isFinite(value)) values.push(value)
  }
  return values
}

function median(sorted) {
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/**
 * Histogram mode: the values split into about sqrt(n) equal bins between the lowest and highest
 * value; the midpoint of the fullest bin. On a tie, the bin closest to the median wins.
 */
function histogramMode(sorted) {
  const min = sorted[0]
  const max = sorted.at(-1)
  if (min === max) return min
  const binCount = Math.max(1, Math.round(Math.sqrt(sorted.length)))
  const width = (max - min) / binCount
  const counts = Array.from({ length: binCount }, () => 0)
  for (const value of sorted) {
    // The highest value belongs to the last bin, not one past it.
    counts[Math.min(binCount - 1, Math.floor((value - min) / width))]++
  }
  const middle = median(sorted)
  const midpoint = (i) => min + (i + 0.5) * width
  let best = 0
  for (let i = 1; i < binCount; i++) {
    const closer = Math.abs(midpoint(i) - middle) < Math.abs(midpoint(best) - middle)
    if (counts[i] > counts[best] || (counts[i] === counts[best] && closer)) best = i
  }
  return midpoint(best)
}

/**
 * A group's typical value: 'mode', 'median' or 'mean' of the numbers, or 'top' (the highest, the
 * lowest when lower is better). Null when there are none.
 */
export function aggregate(values, kind = DEFAULT_AGGREGATE, lowerBetter = false) {
  if (!values.length) return null
  if (kind === 'top') return lowerBetter ? Math.min(...values) : Math.max(...values)
  if (kind === 'mean') return mean(values)
  const sorted = [...values].sort((a, b) => a - b)
  return kind === 'mode' ? histogramMode(sorted) : median(sorted)
}

/**
 * The typical values of a group of rows: { [metric]: number | null }. `columnInfo` tells which
 * metrics are lower-is-better, for 'top'.
 */
export function aggregateRow(rows, metrics, kind = DEFAULT_AGGREGATE, columnInfo = {}) {
  return Object.fromEntries(
    metrics.map((m) => [
      m,
      aggregate(columnValues(rows, m), kind, isLowerBetter(m, columnInfo[m])),
    ]),
  )
}

// --- Scaling -------------------------------------------------------------------------------------

/**
 * How a metric maps to 0-100: from 0 (or the lowest value, when some are negative) to the highest
 * value of the scaling pool. `extraRows` (e.g. the selected players) are included even when they
 * are outside the pool, so they never go past 100. Lower-is-better metrics are reversed.
 * Returns { min, max, lowerBetter }, or null when the metric has no numbers.
 */
export function metricScale(column, info, poolRows, extraRows = []) {
  const values = columnValues([...poolRows, ...extraRows], column)
  if (!values.length) return null
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  return { min: Math.min(0, min), max, lowerBetter: isLowerBetter(column, info) }
}

/** The scales of several metrics: { [metric]: scale | null }. */
export function metricScales(metrics, columnInfo, poolRows, extraRows = []) {
  return Object.fromEntries(
    metrics.map((m) => [m, metricScale(m, columnInfo?.[m], poolRows, extraRows)]),
  )
}

/**
 * A value on a metric's 0-100 scale (100 = best). Null for a missing value or scale. When every
 * value is the same, it is 100 (0 when they are all 0 and higher is better).
 */
export function scaleValue(value, scale) {
  if (!scale || typeof value !== 'number' || !Number.isFinite(value)) return null
  const span = scale.max - scale.min
  if (span <= 0) return scale.max > 0 || scale.lowerBetter ? 100 : 0
  const share = (value - scale.min) / span
  const scaled = (scale.lowerBetter ? 1 - share : share) * 100
  return Math.min(100, Math.max(0, scaled))
}

/** The real value at a point of a metric's 0-100 scale (for axis labels). */
export function unscaleValue(scaled, scale) {
  const share = scale.lowerBetter ? 1 - scaled / 100 : scaled / 100
  return scale.min + share * (scale.max - scale.min)
}
