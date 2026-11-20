<script setup>
// Butterfly (difference) chart: the left shape against the right one, one row per metric, in 1-3
// square columns. Each row has the metric name centred above it, the real values at both ends and
// one bar from the centre toward the better side, labelled with the real difference. Equal values
// get a small tick instead of a bar. All columns share one bar scale: the largest difference fills
// half the width.
import { computed } from 'vue'

import EChart from '@/components/charts/EChart.vue'
import {
  BUTTERFLY_MAX_METRICS_PER_COLUMN,
  butterflyRows,
  largestLead,
} from '@/services/charts/butterfly'
import { chartColors } from '@/services/charts/theme'
import { formatCell } from '@/utils/format'

// Width kept for the real values at each end of a row, and the bar's thickness (px).
const VALUE_WIDTH = 46
const MAX_BAR_HEIGHT = 14
// Rough width of one character of the difference label (px), to tell whether it fits past the bar.
const LEAD_CHAR_WIDTH = 6

const props = defineProps({
  // Metric columns: [[metric, ...], ...], 1-3 columns of up to 7.
  columns: { type: Array, required: true },
  label: { type: Function, required: true },
  // Left (main colour) and right (second colour) shapes: { name, values: { [metric]: number } }.
  left: { type: Object, required: true },
  right: { type: Object, required: true },
  // { [metric]: { min, max, lowerBetter } | null }
  scales: { type: Object, required: true },
  // Fill the parent's height (a flex column): the columns stay side by side and as tall as there is
  // room for, instead of square and wrapping.
  fill: { type: Boolean, default: false },
})

const columnRows = computed(() =>
  props.columns.map((metrics) => butterflyRows(metrics, props.left, props.right, props.scales)),
)
const largest = computed(() => largestLead(columnRows.value.flat()))

const formatValue = (value) => (value == null ? '–' : formatCell(value))
const formatLead = (lead) => (lead > 0 ? `+${formatCell(lead)}` : formatCell(lead))

/** The chart option of one column. */
function columnOption(rows) {
  const c = chartColors()
  const { left, right, label } = props
  const largestLeadValue = largest.value

  return ({ width, height }) => {
    // Every column has room for the most rows, so rows line up across columns.
    const rowHeight = height / BUTTERFLY_MAX_METRICS_PER_COLUMN
    const x0 = VALUE_WIDTH
    const x1 = width - VALUE_WIDTH
    const cx = width / 2
    const half = (x1 - x0) / 2
    const barHeight = Math.min(MAX_BAR_HEIGHT, rowHeight * 0.3)

    const text = (x, y, value, style = {}) => ({
      type: 'text',
      x,
      y,
      style: {
        text: value,
        fill: c.text,
        fontSize: 11,
        align: 'center',
        verticalAlign: 'middle',
        ...style,
      },
    })

    function renderItem(params) {
      const row = rows[params.dataIndex]
      const top = params.dataIndex * rowHeight
      const nameY = top + rowHeight * 0.3
      const barY = top + rowHeight * 0.68
      const children = [
        // On the panel's background, so the centre line doesn't run through the name.
        text(cx, nameY, label(row.metric), {
          fontSize: 12,
          backgroundColor: c.tooltipBackground,
          padding: [1, 4],
        }),
        text(x0 - 6, barY, formatValue(row.left), { align: 'right' }),
        text(x1 + 6, barY, formatValue(row.right), { align: 'left' }),
        // The track the bars grow along.
        {
          type: 'line',
          shape: { x1: x0, y1: barY, x2: x1, y2: barY },
          style: { stroke: c.grid, lineWidth: 1 },
        },
      ]
      if (row.better) {
        const length = Math.max(2, (Math.abs(row.lead) / largestLeadValue) * half)
        const toRight = row.better === 'right'
        children.push({
          type: 'rect',
          shape: {
            x: toRight ? cx : cx - length,
            y: barY - barHeight / 2,
            width: length,
            height: barHeight,
          },
          style: { fill: toRight ? c.secondary : c.primary },
        })
        // The difference: just past the bar's end, or inside it when there is no room left
        // before the value at the edge.
        const leadText = formatLead(row.rawLead)
        const inside = length + 8 + leadText.length * LEAD_CHAR_WIDTH > half
        const offset = inside ? length - 4 : length + 4
        children.push(
          text(toRight ? cx + offset : cx - offset, barY, leadText, {
            align: toRight === inside ? 'right' : 'left',
            fontSize: 10,
            fontWeight: inside ? 'bold' : 'normal',
            fill: inside ? c.tooltipBackground : c.text,
            opacity: inside ? 1 : 0.8,
          }),
        )
      } else if (row.lead === 0) {
        children.push({
          type: 'line',
          shape: { x1: cx, y1: barY - barHeight / 2, x2: cx, y2: barY + barHeight / 2 },
          style: { stroke: c.text, lineWidth: 2 },
        })
      }
      return { type: 'group', children }
    }

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (p) => {
          const row = rows[p.dataIndex]
          const lead =
            row.better == null
              ? row.lead === 0
                ? 'Equal'
                : 'Missing a value'
              : `${row.better === 'left' ? left.name : right.name} by ${formatLead(row.rawLead)}`
          return [
            `<b>${label(row.metric)}</b>`,
            `${left.name}: <b>${formatValue(row.left)}</b>`,
            `${right.name}: <b>${formatValue(row.right)}</b>`,
            lead,
          ].join('<br>')
        },
      },
      graphic: [
        // The centre line, through every row.
        {
          type: 'line',
          silent: true,
          z: -1,
          shape: { x1: cx, y1: 0, x2: cx, y2: rows.length * rowHeight },
          style: { stroke: c.line, lineWidth: 1 },
        },
      ],
      series: [
        {
          type: 'custom',
          coordinateSystem: 'none',
          renderItem,
          data: rows.map((_, i) => i),
        },
      ],
    }
  }
}

// An empty column (just added, no metrics yet) stays an empty square.
const options = computed(() =>
  columnRows.value.map((rows) => (rows.length ? columnOption(rows) : null)),
)
</script>

<template>
  <div class="butterfly" :class="{ fill }">
    <div class="legend">
      <span class="side left"><i></i>{{ left.name }}</span>
      <span class="side right">{{ right.name }}<i></i></span>
    </div>
    <div class="columns">
      <div v-for="(option, i) in options" :key="i" class="column">
        <EChart v-if="option" :option="option" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.butterfly {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;

  &.fill {
    flex: 1;
    min-height: 0;

    .columns {
      flex: 1;
      flex-wrap: nowrap;
      min-height: 0;
    }

    .column {
      flex: 1 1 0;
      aspect-ratio: auto;
    }
  }
}

.legend {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8rem;

  .side {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
  }

  i {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  .left i {
    background: $accent-color;
  }

  .right i {
    background: $secondary-accent-color;
  }
}

.columns {
  display: flex;
  flex-wrap: wrap;
  // A dashboard card sets the gap so its columns line up with the cards around it.
  gap: var(--chart-column-gap, 1rem);
}

// Square columns, side by side; they wrap when there is no room.
.column {
  display: flex;
  flex: 1 1 260px;
  aspect-ratio: 1;
  min-width: 0;

  .echart {
    flex: 1;
  }
}
</style>
