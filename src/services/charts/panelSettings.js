// Settings of the Table tab's chart panel, saved in each view as `chart`:
//   { type: 'radar' | 'butterfly',
//     metrics: string[] | null     (radar; null = the first custom metrics)
//     columns: string[][] | null   (butterfly, 1-3 columns; null = the first custom metrics)
//     aggregate: 'mode' | 'median' | 'mean' | 'top' }
// Metrics are column names; ones a dataset doesn't have are kept for other datasets.

import { BUTTERFLY_MAX_COLUMNS } from './butterfly'
import { COMPARISON_AGGREGATES, DEFAULT_AGGREGATE } from './stats'
import { readPreference } from '@/utils/preferences'

const TYPES = ['radar', 'butterfly']
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string')
const isColumnList = (v) =>
  Array.isArray(v) && v.length >= 1 && v.length <= BUTTERFLY_MAX_COLUMNS && v.every(isStringList)

/** Chart settings with every field valid (missing or broken ones get their default). */
export function normalizeChartSettings(chart, fallback = null) {
  const base = fallback ?? {
    type: 'radar',
    metrics: null,
    columns: null,
    aggregate: DEFAULT_AGGREGATE,
  }
  return {
    type: TYPES.includes(chart?.type) ? chart.type : base.type,
    metrics: isStringList(chart?.metrics) ? [...chart.metrics] : base.metrics,
    columns: isColumnList(chart?.columns) ? chart.columns.map((c) => [...c]) : base.columns,
    aggregate: COMPARISON_AGGREGATES.some((a) => a.value === chart?.aggregate)
      ? chart.aggregate
      : base.aggregate,
  }
}

/**
 * The settings for views saved without any: the panel's settings from before they were saved in
 * views (kept in this browser), else the defaults.
 */
export function defaultChartSettings() {
  return normalizeChartSettings({
    type: readPreference('chartPanelType', null),
    metrics: readPreference('chartPanelMetrics', null),
    columns: readPreference('chartPanelButterfly', null),
    aggregate: readPreference('chartPanelAggregate', null),
  })
}
