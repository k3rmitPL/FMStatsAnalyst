// Butterfly (difference) chart rows. Each metric is one row
// with one bar, from the centre toward the better side; its length is the difference between the
// two sides on the metric's 0-100 scale, so rows of different units can be compared.

import { scaleValue } from './stats'

export const BUTTERFLY_MAX_COLUMNS = 3
export const BUTTERFLY_MAX_METRICS_PER_COLUMN = 7

/**
 * @param metrics  metric columns, in display order
 * @param left     the left shape: { values: { [metric]: number } }
 * @param right    the right shape
 * @param scales   { [metric]: { min, max, lowerBetter } | null }
 * @returns [{ metric, left, right, lead, rawLead, better }]
 *   left, right  the real values (null when missing)
 *   lead         right minus left on the 0-100 scale (better = higher): > 0 when the right side is
 *                better, < 0 when the left one is; null when a value is missing
 *   rawLead      the better side's real value minus the other's (negative for lower-is-better
 *                metrics: "5 fewer"); 0 when equal
 *   better       'left', 'right' or null (equal or missing)
 */
export function butterflyRows(metrics, left, right, scales) {
  return metrics.map((metric) => {
    const l = typeof left.values[metric] === 'number' ? left.values[metric] : null
    const r = typeof right.values[metric] === 'number' ? right.values[metric] : null
    const sl = scaleValue(l, scales[metric])
    const sr = scaleValue(r, scales[metric])
    if (sl == null || sr == null) {
      return { metric, left: l, right: r, lead: null, rawLead: null, better: null }
    }
    const lead = sr - sl
    const better = lead > 0 ? 'right' : lead < 0 ? 'left' : null
    const rawLead = better === 'right' ? r - l : better === 'left' ? l - r : 0
    return { metric, left: l, right: r, lead, rawLead, better }
  })
}

/** The largest difference of any row (at least a small amount, so equal rows don't divide by 0). */
export function largestLead(rows) {
  return Math.max(1e-9, ...rows.map((r) => Math.abs(r.lead ?? 0)))
}
