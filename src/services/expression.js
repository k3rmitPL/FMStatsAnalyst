// Formula trees used by custom metrics.
//
// A formula is a tree of plain JSON nodes, so it can be stored and exported as-is:
//   { type: 'number', value: 100 }
//   { type: 'column', column: 'Sv %' }                     value of a column in the current row
//   { type: 'stat', fn: 'max', column: 'Shot/90' }         max/min/mean/median/sum of a column, whole dataset
//   { type: 'stat', fn: 'percentile', p: 75, column }       P-th percentile (0-100) of a column
//   { type: 'op', op: '/', left, right }                   + - * / ^
//   { type: 'call', fn: 'mean', args: [...] }               functions, see FUNCTIONS
//   { type: 'if', left, cmp: '==', right, then, else }     if left cmp right then ... else ...
//   { type: 'lookup', column, table: [{ key, value }], default }   text value → number
//     With an optional second column (`column2`), entries can also carry `key2`: an entry
//     matching both values wins, then one matching `key` with no `key2`, then the default.
//   { type: 'weighted', items: [{ node, weight }] }        weighted average
//   { type: 'versus', column, baseline: 'median', p, min, max, invert }
//     Versus index: the row's value ÷ a dataset statistic of the same column, clamped to
//     min..max (either may be empty). `invert` (lower is better) gives baseline ÷ value.
//     When the divisor is 0: 0 ÷ 0 gives 1 (same as the baseline), otherwise `max` (or null).
// An empty slot is `null`.
//
// Values are numbers or null (missing / not computable). null propagates through arithmetic,
// division by zero gives null, and comparisons involving null are false.

export const OPERATORS = {
  '+': { label: '+', name: 'Add', apply: (a, b) => a + b },
  '-': { label: '−', name: 'Subtract', apply: (a, b) => a - b },
  '*': { label: '×', name: 'Multiply', apply: (a, b) => a * b },
  '/': { label: '÷', name: 'Divide', apply: (a, b) => (b === 0 ? null : a / b) },
  '^': { label: '^', name: 'Power', apply: (a, b) => a ** b },
}

export const COMPARISONS = {
  '==': { label: '=', apply: (a, b) => a === b },
  '!=': { label: '≠', apply: (a, b) => a !== b },
  '<': { label: '<', apply: (a, b) => a < b },
  '<=': { label: '≤', apply: (a, b) => a <= b },
  '>': { label: '>', apply: (a, b) => a > b },
  '>=': { label: '≥', apply: (a, b) => a >= b },
}

export const STATS = {
  max: 'max',
  min: 'min',
  mean: 'average',
  median: 'median',
  percentile: 'percentile',
  sum: 'sum',
}

export const DEFAULT_PERCENTILE = 75

/** The percentile (0-100) a stat node uses: its own `p`, clamped, or the default. */
export function statPercentile(node) {
  // An emptied input leaves '' behind, which Number() would read as 0.
  const p = node.p === '' || node.p == null ? NaN : Number(node.p)
  return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : DEFAULT_PERCENTILE
}

/** Statistics a Versus index can compare against (keys of STATS). */
export const VERSUS_BASELINES = ['median', 'mean', 'max', 'percentile']

/** An optional numeric setting: null when left empty. */
function optionalNumber(value) {
  return value === '' || value == null ? null : finite(Number(value))
}

function versusIndex(node, row, ctx) {
  const value = toNumber(row[node.column])
  const p = node.baseline === 'percentile' ? statPercentile(node) : undefined
  const baseline = ctx.stat(node.baseline, node.column, p)
  if (value == null || baseline == null) return null
  const lo = optionalNumber(node.min)
  const hi = optionalNumber(node.max)
  const [top, bottom] = node.invert ? [baseline, value] : [value, baseline]
  let x
  if (bottom !== 0) x = top / bottom
  else if (top === 0) x = 1
  else return hi
  if (lo != null) x = Math.max(lo, x)
  if (hi != null) x = Math.min(hi, x)
  return finite(x)
}

// args: fixed argument names, or `variadic: true` for a list (at least `minArgs`).
export const FUNCTIONS = {
  mean: { label: 'Average', variadic: true, minArgs: 1, apply: (xs) => sum(xs) / xs.length },
  sum: { label: 'Sum', variadic: true, minArgs: 1, apply: sum },
  min: { label: 'Smallest', variadic: true, minArgs: 1, apply: (xs) => Math.min(...xs) },
  max: { label: 'Largest', variadic: true, minArgs: 1, apply: (xs) => Math.max(...xs) },
  round: { label: 'Round', args: ['value'], apply: ([x]) => roundHalfEven(x) },
  abs: { label: 'Absolute', args: ['value'], apply: ([x]) => Math.abs(x) },
  sqrt: { label: 'Square root', args: ['value'], apply: ([x]) => (x < 0 ? null : Math.sqrt(x)) },
  clamp: {
    label: 'Clamp',
    args: ['value', 'min', 'max'],
    apply: ([x, lo, hi]) => Math.min(hi, Math.max(lo, x)),
  },
  easeOut: {
    label: 'Ease out',
    hint: '1 − (1 − x)ⁿ — boosts low values, flattens near 1',
    args: ['value', 'power'],
    apply: ([x, n]) => 1 - (1 - x) ** n,
  },
}

function sum(xs) {
  return xs.reduce((a, b) => a + b, 0)
}

/** Rounds like Python's round(): halves go to the nearest even number. */
export function roundHalfEven(x, decimals = 0) {
  const m = 10 ** decimals
  const v = x * m
  const floor = Math.floor(v)
  // Only exact halves go to even, like Python (2.675 is stored as 2.67499..., so it rounds down).
  const r = v - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(v)
  return r / m
}

/** Converts a cell value to a number for calculations (null when it has no numeric value). */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  return null
}

function finite(x) {
  return typeof x === 'number' && Number.isFinite(x) ? x : null
}

/**
 * Evaluates a node for one row.
 * `ctx.stat(fn, column, p)` returns a dataset statistic (`p` only matters for percentile).
 */
export function evaluate(node, row, ctx) {
  if (!node) return null
  switch (node.type) {
    case 'number':
      return finite(Number(node.value))
    case 'column':
      return toNumber(row[node.column])
    case 'stat':
      return ctx.stat(
        node.fn,
        node.column,
        node.fn === 'percentile' ? statPercentile(node) : undefined,
      )
    case 'op': {
      const a = evaluate(node.left, row, ctx)
      const b = evaluate(node.right, row, ctx)
      if (a == null || b == null) return null
      return finite(OPERATORS[node.op]?.apply(a, b))
    }
    case 'call': {
      const def = FUNCTIONS[node.fn]
      if (!def) return null
      const values = (node.args ?? []).map((arg) => evaluate(arg, row, ctx))
      if (!values.length || values.some((v) => v == null)) return null
      return finite(def.apply(values))
    }
    case 'if': {
      const a = evaluate(node.left, row, ctx)
      const b = evaluate(node.right, row, ctx)
      const test = a != null && b != null && COMPARISONS[node.cmp]?.apply(a, b)
      return evaluate(test ? node.then : node.else, row, ctx)
    }
    case 'lookup': {
      const match = lookupMatch(node, row)
      return finite(Number(match ? match.value : node.default))
    }
    case 'versus':
      return versusIndex(node, row, ctx)
    case 'weighted': {
      let total = 0
      let weights = 0
      for (const item of node.items ?? []) {
        const v = evaluate(item.node, row, ctx)
        const w = Number(item.weight)
        if (v == null || !Number.isFinite(w)) return null
        total += v * w
        weights += w
      }
      return weights === 0 ? null : finite(total / weights)
    }
    default:
      return null
  }
}

/** The lookup table entry for a row, or undefined when none matches. */
function lookupMatch(node, row) {
  const table = node.table ?? []
  const key = String(row[node.column] ?? '')
  if (!node.column2) return table.find((entry) => entry.key === key)
  const key2 = String(row[node.column2] ?? '')
  return (
    table.find((entry) => entry.key === key && entry.key2 && entry.key2 === key2) ??
    table.find((entry) => entry.key === key && !entry.key2)
  )
}

/** Calls `visit(node)` for every node in the tree. */
export function walk(node, visit) {
  if (!node) return
  visit(node)
  for (const child of children(node)) walk(child, visit)
}

function children(node) {
  switch (node.type) {
    case 'op':
      return [node.left, node.right]
    case 'call':
      return node.args ?? []
    case 'if':
      return [node.left, node.right, node.then, node.else]
    case 'weighted':
      return (node.items ?? []).map((item) => item.node)
    default:
      return []
  }
}

// Node types that read a column of the dataset.
const COLUMN_NODES = new Set(['column', 'stat', 'lookup', 'versus'])

/** Every column name the formula reads (including columns used by statistics and lookups). */
export function referencedColumns(node) {
  const columns = new Set()
  walk(node, (n) => {
    if (COLUMN_NODES.has(n.type) && n.column) {
      columns.add(n.column)
    }
    if (n.type === 'lookup' && n.column2) columns.add(n.column2)
  })
  return columns
}

/** Problems that stop the formula from computing, e.g. empty slots. */
export function structuralErrors(node) {
  const errors = []
  if (!node) return ['The formula is empty.']
  let emptySlots = 0
  walk(node, (n) => {
    for (const child of children(n)) if (!child) emptySlots++
    if (COLUMN_NODES.has(n.type) && !n.column) {
      errors.push('A block has no column selected.')
    }
    if (n.type === 'call' && FUNCTIONS[n.fn]?.variadic && !(n.args ?? []).length) {
      errors.push(`${FUNCTIONS[n.fn].label} needs at least one value.`)
    }
    if (n.type === 'weighted' && !(n.items ?? []).length) {
      errors.push('Weighted average needs at least one value.')
    }
  })
  if (emptySlots) errors.push(`${emptySlots} empty slot${emptySlots > 1 ? 's' : ''} to fill.`)
  return errors
}

/** One-line text version of a formula, for previews. */
export function toText(node, label = (c) => c, top = true) {
  if (!node) return '□'
  const t = (n) => toText(n, label, false)
  switch (node.type) {
    case 'number':
      return String(node.value)
    case 'column':
      return node.column ? `[${label(node.column)}]` : '[?]'
    case 'stat': {
      const name =
        node.fn === 'percentile' ? `P${statPercentile(node)}` : (STATS[node.fn] ?? node.fn)
      return `${name} of [${node.column ? label(node.column) : '?'}]`
    }
    case 'op': {
      const text = `${t(node.left)} ${OPERATORS[node.op]?.label ?? node.op} ${t(node.right)}`
      return top ? text : `(${text})`
    }
    case 'call':
      return `${FUNCTIONS[node.fn]?.label ?? node.fn}(${(node.args ?? []).map((a) => toText(a, label)).join(', ')})`
    case 'if':
      return `if ${t(node.left)} ${COMPARISONS[node.cmp]?.label ?? node.cmp} ${t(node.right)} then ${t(node.then)} else ${t(node.else)}`
    case 'lookup':
      return `lookup [${node.column ? label(node.column) : '?'}]${node.column2 ? ` + [${label(node.column2)}]` : ''}`
    case 'versus': {
      const base =
        node.baseline === 'percentile' ? `P${statPercentile(node)}` : (STATS[node.baseline] ?? '?')
      const col = node.column ? label(node.column) : '?'
      const lo = optionalNumber(node.min)
      const hi = optionalNumber(node.max)
      const range = lo == null && hi == null ? '' : `, ${lo ?? '−∞'} to ${hi ?? '∞'}`
      return `index of [${col}] vs ${base}${node.invert ? ', lower is better' : ''}${range}`
    }
    case 'weighted':
      return `weighted(${(node.items ?? []).map((i) => `${toText(i.node, label)} ×${i.weight}`).join(', ')})`
    default:
      return '?'
  }
}

/** New, empty nodes for the editor palette. */
export const BLOCKS = [
  {
    group: 'Values',
    category: 'value',
    items: [
      { id: 'number', label: 'Number', create: () => ({ type: 'number', value: 1 }) },
      { id: 'column', label: 'Column value', create: () => ({ type: 'column', column: '' }) },
      {
        id: 'stat',
        label: 'Dataset value',
        hint: 'Max, min, average, median, percentile or sum of a column over the whole dataset',
        create: () => ({ type: 'stat', fn: 'max', column: '' }),
      },
      {
        id: 'versus',
        label: 'Versus index',
        hint: 'Value ÷ dataset median (or average, max, percentile) of the same column, clamped',
        create: () => ({
          type: 'versus',
          column: '',
          baseline: 'median',
          min: 0,
          max: 3,
          invert: false,
        }),
      },
    ],
  },
  {
    group: 'Math',
    category: 'math',
    items: Object.entries(OPERATORS).map(([op, def]) => ({
      id: `op${op}`,
      label: `a ${def.label} b`,
      create: () => ({ type: 'op', op, left: null, right: null }),
    })),
  },
  {
    group: 'Functions',
    category: 'function',
    items: [
      {
        id: 'weighted',
        label: 'Weighted average',
        create: () => ({
          type: 'weighted',
          items: [
            { node: null, weight: 1 },
            { node: null, weight: 1 },
          ],
        }),
      },
      ...Object.entries(FUNCTIONS).map(([fn, def]) => ({
        id: `fn-${fn}`,
        label: def.label,
        hint: def.hint,
        create: () => ({
          type: 'call',
          fn,
          args: def.variadic ? [null, null] : def.args.map(() => null),
        }),
      })),
    ],
  },
  {
    group: 'Logic',
    category: 'logic',
    items: [
      {
        id: 'if',
        label: 'If ... then ... else',
        // oxlint-disable-next-line unicorn/no-thenable
        create: () => ({ type: 'if', left: null, cmp: '==', right: null, then: null, else: null }),
      },
      {
        id: 'lookup',
        label: 'Lookup table',
        create: () => ({ type: 'lookup', column: '', table: [], default: 1 }),
      },
    ],
  },
]

export const BLOCKS_BY_ID = Object.fromEntries(
  BLOCKS.flatMap((g) => g.items.map((item) => [item.id, item])),
)

const GROUP_BY_BLOCK_ID = Object.fromEntries(
  BLOCKS.flatMap((g) => g.items.map((item) => [item.id, g.group])),
)

/** Palette group and name of a node, e.g. { group: 'Functions', name: 'Average' }. */
export function blockInfo(node) {
  switch (node?.type) {
    case 'op':
      return { group: GROUP_BY_BLOCK_ID[`op${node.op}`], name: OPERATORS[node.op]?.name ?? node.op }
    case 'call':
      return {
        group: GROUP_BY_BLOCK_ID[`fn-${node.fn}`],
        name: FUNCTIONS[node.fn]?.label ?? node.fn,
      }
    default:
      return {
        group: GROUP_BY_BLOCK_ID[node?.type],
        name: BLOCKS_BY_ID[node?.type]?.label ?? node?.type,
      }
  }
}

/** Category of a node, used for colouring blocks. */
export function nodeCategory(node) {
  switch (node?.type) {
    case 'number':
    case 'column':
    case 'stat':
    case 'versus':
      return 'value'
    case 'op':
      return 'math'
    case 'call':
    case 'weighted':
      return 'function'
    default:
      return 'logic'
  }
}
