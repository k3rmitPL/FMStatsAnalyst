// Computes custom metrics (see expression.js) as extra columns of a dataset.
//
// A metric:
//   {
//     id, name, description,
//     expression,          formula tree
//     onlyIfPlayed,        players with no minutes get 0 (like `if_played` in the Python notebook)
//     normalize,           rescale results to 0–100 (min → 0, max → 100) across the dataset
//     decimals,            round the final value (null = no rounding)
//     colorScale,          colour table cells from red (low) to green (high)
//   }
// Metrics can use other metrics' columns; they are computed in dependency order.

import {
  evaluate,
  referencedColumns,
  roundHalfEven,
  structuralErrors,
  toNumber,
} from './expression'
import { NA } from './transform'

const MINUTES_COLUMN = 'Minutes'

export function newMetric(name = 'New metric') {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    groupId: null,
    expression: null,
    onlyIfPlayed: true,
    normalize: false,
    decimals: 2,
    colorScale: false,
  }
}

/** Orders metrics so each comes after the metrics it uses; reports cycles. */
function dependencyOrder(metrics) {
  const byName = new Map(metrics.map((m) => [m.name, m]))
  const order = []
  const state = new Map() // name → 'visiting' | 'done'
  const cyclic = new Set()

  function visit(metric, stack) {
    const s = state.get(metric.name)
    if (s === 'done') return
    if (s === 'visiting') {
      for (const name of stack.slice(stack.indexOf(metric.name))) cyclic.add(name)
      return
    }
    state.set(metric.name, 'visiting')
    for (const col of referencedColumns(metric.expression)) {
      const dep = byName.get(col)
      if (dep && dep !== metric) visit(dep, [...stack, metric.name])
      if (dep === metric) cyclic.add(metric.name)
    }
    state.set(metric.name, 'done')
    order.push(metric)
  }

  for (const metric of metrics) visit(metric, [])
  return { order: order.filter((m) => !cyclic.has(m.name)), cyclic }
}

function columnStat(rows, fn, column) {
  let count = 0
  let total = 0
  let min = Infinity
  let max = -Infinity
  for (const row of rows) {
    const v = toNumber(row[column])
    if (v == null) continue
    count++
    total += v
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!count) return null
  switch (fn) {
    case 'max':
      return max
    case 'min':
      return min
    case 'mean':
      return total / count
    case 'sum':
      return total
    default:
      return null
  }
}

/**
 * Adds metric columns to the rows.
 * `columns` are the dataset's own columns, used to report formulas reading unknown columns.
 * Returns { rows, columns, columnInfo, stats, problems } where `problems` maps metric id → messages.
 */
export function computeMetrics(sourceRows, metrics, columns = []) {
  const rows = sourceRows.map((row) => ({ ...row }))
  const problems = {}
  const report = (metric, message) => (problems[metric.id] ??= []).push(message)

  // Names must be unique and must not replace a dataset column.
  const seen = new Set()
  const usable = []
  for (const metric of metrics) {
    const name = metric.name?.trim()
    if (!name) report(metric, 'The metric has no name.')
    else if (seen.has(name)) report(metric, `Another metric is also called "${name}".`)
    else if (columns.includes(name)) report(metric, `"${name}" is already a column in the dataset.`)
    else {
      seen.add(name)
      const errors = structuralErrors(metric.expression)
      if (errors.length) errors.forEach((e) => report(metric, e))
      else usable.push(metric)
    }
  }

  const { order, cyclic } = dependencyOrder(usable)
  for (const metric of usable) {
    if (cyclic.has(metric.name))
      report(metric, 'The formula depends on itself (via other metrics).')
  }

  const known = new Set([...columns, ...seen])
  const statCache = new Map()
  const ctx = {
    stat(fn, column) {
      const key = `${fn}\u0000${column}`
      if (!statCache.has(key)) statCache.set(key, columnStat(rows, fn, column))
      return statCache.get(key)
    },
  }

  const added = []
  const columnInfo = {}
  const stats = {}

  // Without a Minutes column every player would look unplayed, so the rule is skipped.
  const hasMinutes = columns.includes(MINUTES_COLUMN)

  for (const metric of order) {
    for (const col of referencedColumns(metric.expression)) {
      if (!known.has(col)) report(metric, `Column "${col}" is not in this dataset.`)
    }
    const zeroIfNotPlayed = metric.onlyIfPlayed && hasMinutes
    if (metric.onlyIfPlayed && !hasMinutes) {
      report(
        metric,
        `This dataset has no "${MINUTES_COLUMN}" column, so "Players with no minutes get 0" is ignored.`,
      )
    }

    const values = rows.map((row) => {
      if (zeroIfNotPlayed && !(toNumber(row[MINUTES_COLUMN]) > 0)) return 0
      return evaluate(metric.expression, row, ctx)
    })

    if (metric.normalize) {
      const present = values.filter((v) => v != null)
      const min = Math.min(...present)
      const max = Math.max(...present)
      for (let i = 0; i < values.length; i++) {
        if (values[i] == null) continue
        values[i] = max === min ? null : ((values[i] - min) / (max - min)) * 100
      }
    }

    const decimals = metric.decimals
    let min = Infinity
    let max = -Infinity
    rows.forEach((row, i) => {
      let v = values[i]
      if (v != null && decimals != null && decimals !== '') v = roundHalfEven(v, Number(decimals))
      row[metric.name] = v == null ? NA : v
      if (v != null) {
        if (v < min) min = v
        if (v > max) max = v
      }
    })

    added.push(metric.name)
    columnInfo[metric.name] = { type: 'number', metric: true, colorScale: !!metric.colorScale }
    if (min !== Infinity) stats[metric.name] = { min, max }
  }

  // Keep the metrics' own list order for the new columns.
  const listed = metrics.map((m) => m.name).filter((name) => added.includes(name))
  return { rows, columns: listed, columnInfo, stats, problems }
}

/** Validates and normalises metrics read from a JSON file. */
export function parseMetricsFile(data) {
  const list = Array.isArray(data) ? data : data?.metrics
  if (!Array.isArray(list)) throw new Error('The file does not contain a "metrics" list.')
  return list.map((m, i) => {
    if (!m || typeof m.name !== 'string') throw new Error(`Metric #${i + 1} has no name.`)
    return {
      ...newMetric(m.name),
      ...m,
      id: typeof m.id === 'string' && m.id ? m.id : crypto.randomUUID(),
      expression: m.expression ?? null,
    }
  })
}

/** File contents for export; `groups` is left out when exporting single items. */
export function metricsFile(metrics, groups) {
  return { type: 'fm-stats-analyst/metrics', version: 1, metrics, ...(groups ? { groups } : {}) }
}
