// Scatter chart calculations: the points, the reference lines
// of the Quadrants and Diagonal variants, and which players fall in a region.

import { aggregate } from './stats'

export const SCATTER_VARIANTS = [
  { value: 'plain', label: 'Plain' },
  { value: 'quadrants', label: 'Quadrants' },
  { value: 'diagonal', label: 'Diagonal' },
]
export const DIAGONAL_SLOPES = [
  { value: 'ratio', label: 'Average ratio' },
  { value: 'identity', label: '1:1' },
]

/** The rows with a number in both columns, as points: { row, x, y }. */
export function scatterPoints(rows, xColumn, yColumn) {
  const points = []
  for (const row of rows) {
    const x = row[xColumn]
    const y = row[yColumn]
    if (
      typeof x === 'number' &&
      Number.isFinite(x) &&
      typeof y === 'number' &&
      Number.isFinite(y)
    ) {
      points.push({ row, x, y })
    }
  }
  return points
}

/** The typical point of the group: { x, y } (mode, median or mean of each axis). */
export function typicalPoint(points, kind) {
  return {
    x: aggregate(
      points.map((p) => p.x),
      kind,
    ),
    y: aggregate(
      points.map((p) => p.y),
      kind,
    ),
  }
}

/**
 * Slope of the diagonal through the origin: through the typical point ('ratio'), or 1 ('identity').
 * Null when the typical x is 0 (no line through the origin can reach it).
 */
export function diagonalSlope(typical, slope) {
  if (slope === 'identity') return 1
  if (!typical.x) return null
  return typical.y / typical.x
}

// Room around the players on each axis (share of the values' range), before rounding out.
const AXIS_PADDING = 0.05
// About how many steps the rounding of an axis's ends uses (more = ends closer to the players).
const AXIS_ROUNDING_STEPS = 10

/** A round step (1, 2 or 5 × a power of ten) for splitting a range into about `count` parts. */
function niceStep(range, count) {
  const raw = range / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power
}

/**
 * An axis's range for values: from the lowest to the highest plus some padding, rounded out to round
 * numbers. { min, max }, or null without values.
 */
export function paddedExtent(values) {
  if (!values.length) return null
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min || Math.abs(max) || 1
  const step = niceStep(range * (1 + 2 * AXIS_PADDING), AXIS_ROUNDING_STEPS)
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const round = (v) => Number(v.toFixed(decimals))
  return {
    min: round(Math.floor((min - range * AXIS_PADDING) / step) * step),
    max: round(Math.ceil((max + range * AXIS_PADDING) / step) * step),
  }
}

/**
 * The part of the diagonal y = slope × x inside the axes' ranges: [[x, y], [x, y]], or null when
 * it doesn't cross them.
 */
export function diagonalSegment(slope, xExtent, yExtent) {
  if (slope == null || !xExtent || !yExtent) return null
  let from = xExtent.min
  let to = xExtent.max
  if (slope === 0) {
    if (yExtent.min > 0 || yExtent.max < 0) return null
  } else {
    const [a, b] = [yExtent.min / slope, yExtent.max / slope].sort((p, q) => p - q)
    from = Math.max(from, a)
    to = Math.min(to, b)
  }
  if (!(from < to)) return null
  return [
    [from, slope * from],
    [to, slope * to],
  ]
}

/**
 * The region of a point, for highlighting and region clicks:
 *   quadrants  'x+y+', 'x+y-', 'x-y+', 'x-y-' (+ = better than typical; lower-is-better axes count
 *              lower values as better)
 *   diagonal   'above' or 'below' the line (on it counts as below)
 * `better` = { x: lowerBetter, y: lowerBetter } flags of the axes.
 */
export function pointRegion(point, variant, reference, lowerBetter) {
  if (variant === 'quadrants') {
    const xBetter = lowerBetter.x ? point.x < reference.x : point.x > reference.x
    const yBetter = lowerBetter.y ? point.y < reference.y : point.y > reference.y
    return `x${xBetter ? '+' : '-'}y${yBetter ? '+' : '-'}`
  }
  if (variant === 'diagonal' && reference.slope != null) {
    return point.y > reference.slope * point.x ? 'above' : 'below'
  }
  return null
}

/** The highlighted region of a variant: better in both, or above the diagonal. */
export function highlightedRegion(variant) {
  if (variant === 'quadrants') return 'x+y+'
  if (variant === 'diagonal') return 'above'
  return null
}

/** A region's name, for the selection bar. */
export function regionLabel(region) {
  return (
    {
      'x+y+': 'Better than typical in both',
      'x+y-': 'Better in X only',
      'x-y+': 'Better in Y only',
      'x-y-': 'Worse in both',
      above: 'Above the line',
      below: 'Below the line',
    }[region] ?? 'Selected'
  )
}
