<script setup>
// Scatter chart of the filtered players on two metrics.
//
// Variants: plain, quadrants (dashed lines at the typical value of each axis; better in both is
// highlighted) and diagonal (a line from the origin; players above it are highlighted).
// Lower-is-better axes are reversed (except on the diagonal), so better is always right / up.
//
// Interactions: the tooltip lists every player under the pointer; clicking a dot picks that player
// (several overlapping: a list to choose from); the mouse wheel zooms and dragging pans; a search
// box labels players; clicking a region (quadrant, above / below the line) or drawing a lasso
// selects players, who can then be shown in the table.
import { computed, onMounted, ref, watch } from 'vue'

import EChart from '@/components/charts/EChart.vue'
import { ROW_ID } from '@/services/db'
import {
  diagonalSegment,
  diagonalSlope,
  highlightedRegion,
  paddedExtent,
  pointRegion,
  regionLabel,
  scatterPoints,
  typicalPoint,
} from '@/services/charts/scatter'
import { DEFAULT_AGGREGATE } from '@/services/charts/stats'
import { chartColors } from '@/services/charts/theme'
import { PLAYER_COLUMN } from '@/stores/analysis'
import { isLowerBetter } from '@/utils/columns'
import { formatCell } from '@/utils/format'
import { foldText } from '@/utils/text'

// Dots closer than this to the pointer count as under it (px).
const NEAR_DISTANCE = 6
// Longest list of players in the tooltip.
const TOOLTIP_MAX_PLAYERS = 8

const props = defineProps({
  // The filtered players, and the two metrics.
  rows: { type: Array, required: true },
  x: { type: String, required: true },
  y: { type: String, required: true },
  columnInfo: { type: Object, required: true },
  label: { type: Function, required: true },
  variant: { type: String, default: 'quadrants' },
  slope: { type: String, default: 'ratio' },
  aggregate: { type: String, required: true },
  // The card's player (row id), and the shortlisted players' row ids.
  playerId: { type: [Number, String], default: null },
  shortlistIds: { type: Set, default: () => new Set() },
  // Fill the parent's height (a flex column) instead of drawing a square plot.
  fill: { type: Boolean, default: false },
})

// player: a row id picked by clicking a dot. show-in-table: { ids, label } of the selection.
const emit = defineEmits(['player', 'show-in-table'])

const chartRef = ref(null)
const getChart = () => chartRef.value?.getChart()

const search = ref('')
const lasso = ref(false)
// Selected players: { ids: Set, label } or null.
const selection = ref(null)
// Overlapping players to choose from after a click: { left, top, points } or null.
const picker = ref(null)

const points = computed(() => scatterPoints(props.rows, props.x, props.y))
const lowerBetter = computed(() => ({
  x: isLowerBetter(props.x, props.columnInfo[props.x]),
  y: isLowerBetter(props.y, props.columnInfo[props.y]),
}))
const isDiagonal = computed(() => props.variant === 'diagonal')

// Reference lines: the typical point, and the diagonal's slope.
const reference = computed(() => {
  // "Top" (the best values) is for radars and butterflies; the median stands in for it here.
  const kind = props.aggregate === 'top' ? DEFAULT_AGGREGATE : props.aggregate
  const typical = typicalPoint(points.value, kind)
  return { ...typical, slope: diagonalSlope(typical, props.slope) }
})
const regionOf = (point) => pointRegion(point, props.variant, reference.value, lowerBetter.value)

const searchTerm = computed(() => foldText(search.value.trim()))
const matchesSearch = (point) =>
  !!searchTerm.value && foldText(String(point.row[PLAYER_COLUMN] ?? '')).includes(searchTerm.value)

// A new chart setup drops the selection.
watch(
  () => [props.x, props.y, props.variant, props.slope, props.aggregate, props.rows],
  () => {
    selection.value = null
    picker.value = null
  },
)

// Points in drawing order (later = on top), with their look.
const styled = computed(() => {
  const c = chartColors()
  const highlight = highlightedRegion(props.variant)
  const selected = selection.value?.ids
  const list = points.value.map((p) => {
    const id = p.row[ROW_ID]
    const isPlayer = id != null && id === props.playerId
    const isSearched = matchesSearch(p)
    const isShortlisted = props.shortlistIds.has(id)
    const isHighlighted = selected ? selected.has(id) : !!highlight && regionOf(p) === highlight
    const showLabel = isPlayer || isSearched || isShortlisted
    let color = isHighlighted ? c.primary : c.muted
    if (isSearched) color = c.text
    if (isPlayer) color = c.secondary
    return {
      point: p,
      order: isPlayer ? 4 : isSearched ? 3 : showLabel ? 2 : isHighlighted ? 1 : 0,
      item: {
        value: [p.x, p.y],
        name: String(p.row[PLAYER_COLUMN] ?? ''),
        symbolSize: isPlayer ? 12 : isSearched ? 9 : 6,
        itemStyle: { color },
        label: showLabel
          ? {
              show: true,
              position: 'right',
              formatter: '{b}',
              color: isPlayer ? c.secondary : c.text,
              fontSize: 10,
            }
          : undefined,
      },
    }
  })
  return list.sort((a, b) => a.order - b.order)
})

/** The players whose dots are within NEAR_DISTANCE px of a pixel. */
function pointsNear(pixel) {
  const chart = getChart()
  if (!chart) return []
  return styled.value
    .map((s) => s.point)
    .filter((p) => {
      const [px, py] = chart.convertToPixel({ seriesIndex: 0 }, [p.x, p.y])
      return Math.hypot(px - pixel[0], py - pixel[1]) <= NEAR_DISTANCE
    })
}

const playerName = (point) => String(point.row[PLAYER_COLUMN] ?? 'Player')

const option = computed(() => {
  const c = chartColors()
  const { x, y, label } = props
  const ref = reference.value
  const markLines = []
  if (props.variant === 'quadrants' && ref.x != null && ref.y != null) {
    markLines.push({ xAxis: ref.x }, { yAxis: ref.y })
  }
  // The axes span the players plus some padding (not the origin, even for the diagonal).
  const xExtent = paddedExtent(points.value.map((p) => p.x))
  const yExtent = paddedExtent(points.value.map((p) => p.y))
  // The diagonal is a line series across the plot, not a mark line: a mark line disappears when
  // zooming leaves one of its ends out of view, a series is just cut at the plot's edges.
  const diagonal = isDiagonal.value ? diagonalSegment(ref.slope, xExtent, yExtent) : null
  const axis = (column, extent, inverse) => ({
    type: 'value',
    name: label(column),
    nameLocation: 'middle',
    nameGap: 28,
    scale: true,
    min: extent?.min,
    max: extent?.max,
    // At the plot's edge, not at zero when the range crosses it.
    axisLine: { onZero: false },
    // Zoomed in, the labels at the plot's edges can land on top of their neighbours.
    axisLabel: { hideOverlap: true },
    // The diagonal goes up from the origin, so its axes are never reversed.
    inverse: !isDiagonal.value && inverse,
  })

  return {
    animation: false,
    grid: { left: 52, right: 24, top: 16, bottom: 48 },
    xAxis: axis(x, xExtent, lowerBetter.value.x),
    yAxis: { ...axis(y, yExtent, lowerBetter.value.y), nameGap: 40 },
    tooltip: {
      trigger: 'item',
      confine: true,
      formatter: (params) => {
        const hovered = styled.value[params.dataIndex]?.point
        if (!hovered) return ''
        const chart = getChart()
        const pixel = chart.convertToPixel({ seriesIndex: 0 }, [hovered.x, hovered.y])
        const near = pointsNear(pixel)
        const lines = near
          .slice(0, TOOLTIP_MAX_PLAYERS)
          .map((p) => `<b>${playerName(p)}</b>: ${formatCell(p.x)} · ${formatCell(p.y)}`)
        if (near.length > TOOLTIP_MAX_PLAYERS) {
          lines.push(`and ${near.length - TOOLTIP_MAX_PLAYERS} more (zoom in)`)
        }
        return [`${label(x)} · ${label(y)}`, ...lines].join('<br>')
      },
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      { type: 'inside', yAxisIndex: 0, filterMode: 'none' },
    ],
    // The brush adds ECharts' own selection buttons; the lasso has a button of its own instead.
    toolbox: { show: false },
    brush: {
      toolbox: [],
      xAxisIndex: 0,
      brushMode: 'single',
      transformable: false,
      throttleType: 'debounce',
      throttleDelay: 200,
      brushStyle: { color: c.primaryFaint, borderColor: c.primary, borderWidth: 1 },
      // Colours are set per dot, not by the brush.
      inBrush: { opacity: 1 },
      outOfBrush: { opacity: 1 },
    },
    series: [
      {
        type: 'scatter',
        data: styled.value.map((s) => s.item),
        emphasis: { scale: 1.6, label: { show: true, formatter: '{b}', fontSize: 10 } },
        labelLayout: { hideOverlap: true },
        markLine: markLines.length
          ? {
              silent: true,
              symbol: 'none',
              label: { show: false },
              lineStyle: { color: c.line, type: 'dashed', width: 1 },
              data: markLines,
            }
          : undefined,
      },
      // After the dots, so the dots keep series index 0 (the lasso and the tooltip use it).
      ...(diagonal
        ? [
            {
              type: 'line',
              data: diagonal,
              silent: true,
              clip: true,
              symbol: 'none',
              z: 1,
              tooltip: { show: false },
              lineStyle: { color: c.line, type: 'dashed', width: 1 },
            },
          ]
        : []),
    ],
  }
})

function setLasso(on) {
  lasso.value = on
  // Turning it off removes a drawn shape (the selection it made stays until cleared).
  if (!on) getChart()?.dispatchAction({ type: 'brush', areas: [] })
  getChart()?.dispatchAction({
    type: 'takeGlobalCursor',
    key: 'brush',
    brushOption: on ? { brushType: 'polygon', brushMode: 'single' } : { brushType: false },
  })
}

function clearSelection() {
  selection.value = null
  getChart()?.dispatchAction({ type: 'brush', areas: [] })
}

function resetZoom() {
  const chart = getChart()
  chart?.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start: 0, end: 100 })
  chart?.dispatchAction({ type: 'dataZoom', dataZoomIndex: 1, start: 0, end: 100 })
}

function pickPlayer(point) {
  picker.value = null
  emit('player', point.row[ROW_ID])
}

function showInTable() {
  if (!selection.value) return
  emit('show-in-table', { ids: [...selection.value.ids], label: selection.value.label })
}

onMounted(() => {
  const chart = getChart()
  if (!chart) return

  // A dot: pick its player, or choose among overlapping ones.
  chart.on('click', (params) => {
    if (params.seriesIndex !== 0 || lasso.value) return
    const hovered = styled.value[params.dataIndex]?.point
    if (!hovered) return
    const near = pointsNear(chart.convertToPixel({ seriesIndex: 0 }, [hovered.x, hovered.y]))
    if (near.length <= 1) pickPlayer(hovered)
    else picker.value = { left: params.event.offsetX, top: params.event.offsetY, points: near }
  })

  // Empty space in the plot: select the players of that region (or just close the list of
  // overlapping players, when it is open).
  chart.getZr().on('click', (event) => {
    if (event.target || lasso.value) return
    if (picker.value) {
      picker.value = null
      return
    }
    const pixel = [event.offsetX, event.offsetY]
    if (props.variant === 'plain' || !chart.containPixel('grid', pixel)) return
    const [px, py] = chart.convertFromPixel('grid', pixel)
    const region = regionOf({ x: px, y: py })
    if (!region) return
    const ids = new Set(
      points.value.filter((p) => regionOf(p) === region).map((p) => p.row[ROW_ID]),
    )
    selection.value = { ids, label: regionLabel(region) }
  })

  // Lasso: the players inside it.
  chart.on('brushSelected', (params) => {
    const indexes = params.batch?.[0]?.selected?.[0]?.dataIndex ?? []
    if (!indexes.length) return
    const ids = new Set(indexes.map((i) => styled.value[i]?.point.row[ROW_ID]))
    selection.value = { ids, label: 'Lasso selection' }
  })
})
</script>

<template>
  <div class="scatter" :class="{ fill }">
    <div class="scatter-bar">
      <input
        v-model="search"
        type="search"
        placeholder="Find a player"
        aria-label="Find a player"
      />
      <button
        type="button"
        class="short"
        :class="{ active: lasso }"
        :aria-pressed="lasso"
        title="Draw around players to select them"
        @click="setLasso(!lasso)"
      >
        Lasso
      </button>
      <button type="button" class="short" title="Show all players again" @click="resetZoom">
        Reset zoom
      </button>
    </div>

    <div class="chart-box">
      <EChart ref="chartRef" :option="option" :replace-merge="['series']" />
      <div
        v-if="picker"
        class="picker"
        :style="{ left: `${picker.left}px`, top: `${picker.top}px` }"
        role="menu"
      >
        <button
          v-for="p in picker.points"
          :key="p.row[ROW_ID]"
          type="button"
          class="menu-item"
          role="menuitem"
          @click="pickPlayer(p)"
        >
          {{ playerName(p) }}
        </button>
      </div>
    </div>

    <div v-if="selection" class="selection-bar">
      <span>{{ selection.label }}: {{ selection.ids.size }} players</span>
      <button type="button" class="short" :disabled="!selection.ids.size" @click="showInTable">
        Show {{ selection.ids.size }} in table
      </button>
      <button type="button" class="short" @click="clearSelection">Clear</button>
    </div>
    <p v-else-if="variant !== 'plain'" class="hint">
      Click a region to select its players, or use the lasso.
    </p>
  </div>
</template>

<style lang="scss" scoped>
@use 'sass:color';

.scatter {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;

  // The plot takes the room the bars above and below it leave.
  &.fill {
    flex: 1;
    min-height: 0;

    .chart-box {
      flex: 1;
      min-height: 0;
      aspect-ratio: auto;
    }
  }
}

.scatter-bar,
.selection-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;

  input[type='search'] {
    flex: 1 1 8rem;
    min-width: 0;
  }

  button.active {
    color: $accent-color;
  }
}
.hint {
  line-height: 34px;
}

.selection-bar span {
  margin-right: auto;
  font-size: 0.85rem;
}

.chart-box {
  position: relative;
  display: flex;
  aspect-ratio: 1;

  .echart {
    flex: 1;
  }
}

// Overlapping players to choose from, at the click.
.picker {
  position: absolute;
  z-index: 10;
  display: flex;
  flex-direction: column;
  max-height: 12rem;
  overflow-y: auto;
  padding: 0.25rem;
  background: color.adjust($background-color, $lightness: 3%);
  border: 1px solid color.adjust($background-color, $lightness: 15%);
  border-radius: 5px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);

  // Like the action menu's items.
  button.menu-item {
    top: 0;
    left: 0;
    margin: 0;
    padding: 0.35rem 0.6rem;
    color: $text-color;
    font: inherit;
    font-size: 0.85rem;
    text-align: left;
    white-space: nowrap;
    background-color: transparent;
    border: 0;
    border-radius: 4px;
    box-shadow: none;
    cursor: pointer;

    &:hover,
    &:focus-visible {
      background-color: color.adjust($background-color, $lightness: 10%);
      outline: none;
    }
  }
}

.hint {
  margin: 0;
  font-size: 0.8rem;
  opacity: 0.6;
}
</style>
