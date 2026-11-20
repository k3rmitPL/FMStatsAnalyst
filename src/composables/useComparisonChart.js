// The data of a radar or butterfly chart, shared by the table's chart panel and dashboard cards:
// the shapes to compare (see services/charts/comparison.js) and each metric's 0-100 scale.

import { computed, toValue } from 'vue'

import { comparisonScales, comparisonShapes } from '@/services/charts/comparison'

/**
 * Every argument may be a ref or a getter.
 * @param type           'radar' | 'butterfly'
 * @param metrics        all metrics shown (a butterfly's columns flattened)
 * @param players        selected players, 0-2: { name, row }
 * @param filteredRows   the filtered players
 * @param positionsRows  the same positions in the whole dataset
 * @param aggregate      'mode' | 'median' | 'mean' | 'top'
 * @param columnInfo     the dataset's column info
 */
export function useComparisonChart({
  type,
  metrics,
  players,
  filteredRows,
  positionsRows,
  aggregate,
  columnInfo,
}) {
  const comparison = computed(() =>
    comparisonShapes({
      players: toValue(players),
      filteredRows: toValue(filteredRows),
      positionsRows: toValue(positionsRows),
      metrics: toValue(metrics),
      aggregateKind: toValue(aggregate),
      columnInfo: toValue(columnInfo),
    }),
  )

  // Butterfly sides: the main shape on the left, the other one on the right (no faint group).
  const sides = computed(() => {
    const shapes = comparison.value.shapes
    return {
      left: shapes.find((s) => s.role === 'primary'),
      right: shapes.find((s) => s.role === 'secondary'),
    }
  })

  // The butterfly is scaled from its two sides only.
  const scales = computed(() => {
    const shown =
      toValue(type) === 'butterfly'
        ? { ...comparison.value, shapes: [sides.value.left, sides.value.right] }
        : comparison.value
    return comparisonScales(toValue(metrics), toValue(columnInfo), shown)
  })

  return { shapes: computed(() => comparison.value.shapes), sides, scales }
}
