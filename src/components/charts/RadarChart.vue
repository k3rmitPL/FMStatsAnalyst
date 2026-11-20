<script setup>
// Radar chart of comparison shapes (see services/charts/comparison.js). Every metric has its own
// 0-100 scale; the axes are labelled with real values, and the tooltip shows the real values.
import { computed } from 'vue'

import EChart from '@/components/charts/EChart.vue'
import { scaleValue, unscaleValue } from '@/services/charts/stats'
import { chartColors } from '@/services/charts/theme'
import { formatCell } from '@/utils/format'

// Points of the scale labelled on every axis (0-100).
const LABELLED_LEVELS = [50, 100]
// Axis names longer than this wrap onto more lines.
const NAME_LINE_LENGTH = 14
// Room around the radar for the axis names, and below it for the legend (px).
const NAME_MARGIN = 58
const LEGEND_HEIGHT = 44

const props = defineProps({
  metrics: { type: Array, required: true },
  // Display label of a metric.
  label: { type: Function, required: true },
  // [{ key, name, role: 'primary' | 'secondary' | 'faint', values: { [metric]: number } }]
  shapes: { type: Array, required: true },
  // { [metric]: { min, max, lowerBetter } | null }
  scales: { type: Object, required: true },
})

/** Breaks a name into lines of about NAME_LINE_LENGTH characters, at spaces. */
function wrapName(text) {
  const lines = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && line.length + word.length + 1 > NAME_LINE_LENGTH) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.join('\n')
}

function shapeStyle(role, c) {
  if (role === 'faint') {
    return {
      lineStyle: { color: c.faint, width: 1 },
      areaStyle: { color: c.faint },
      itemStyle: { color: c.faint },
      symbol: 'none',
    }
  }
  const color = role === 'primary' ? c.primary : c.secondary
  const fill = role === 'primary' ? c.primaryFill : c.secondaryFill
  return {
    lineStyle: { color, width: 2 },
    areaStyle: { color: fill },
    itemStyle: { color },
    symbolSize: 10,
  }
}

const option = computed(() => {
  const { metrics, shapes, scales, label } = props
  const c = chartColors()

  // A function of the chart's size: the value labels are placed in pixels along each axis.
  return ({ width, height }) => {
    const cx = width / 2
    const cy = (height - LEGEND_HEIGHT) / 2
    const radius = Math.max(20, Math.min(width / 2, (height - LEGEND_HEIGHT) / 2) - NAME_MARGIN)
    const step = (Math.PI * 2) / metrics.length

    // Real values at the labelled levels of each axis (clockwise from the top, like the radar).
    const valueLabels = []
    metrics.forEach((m, i) => {
      const scale = scales[m]
      if (!scale) return
      const angle = Math.PI / 2 - i * step
      for (const level of LABELLED_LEVELS) {
        const r = ((radius * level) / 100) * 0.85
        valueLabels.push({
          type: 'text',
          silent: true,
          x: cx + Math.cos(angle) * r,
          y: cy - Math.sin(angle) * r,
          style: {
            text: formatCell(unscaleValue(level, scale)),
            fill: c.text,
            opacity: 0.6,
            fontSize: 10,
            align: 'center',
            verticalAlign: 'middle',
          },
        })
      }
    })

    return {
      animationDuration: 300,
      legend: {
        bottom: 0,
        data: shapes.filter((s) => s.role !== 'faint').map((s) => s.name),
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (p) => {
          const shape = shapes.find((s) => s.name === p.name)
          if (!shape) return ''
          const lines = metrics.map((m) => {
            const value = shape.values[m]
            return `${label(m)}: <b>${typeof value === 'number' ? formatCell(value) : '–'}</b>`
          })
          return [`<b>${shape.name}</b>`, ...lines].join('<br>')
        },
      },
      radar: {
        center: [cx, cy],
        radius,
        startAngle: 90,
        clockwise: true,
        splitNumber: 4,
        axisName: { fontSize: 11, lineHeight: 13 },
        indicator: metrics.map((m) => ({ name: wrapName(label(m)), min: 0, max: 100 })),
      },
      graphic: valueLabels,
      series: [
        {
          type: 'radar',
          // Faint shapes first, so they are drawn behind the others.
          data: [...shapes]
            .sort((a, b) => (a.role === 'faint' ? -1 : 0) - (b.role === 'faint' ? -1 : 0))
            .map((s) => ({
              name: s.name,
              // A missing value sits at the centre; the tooltip shows it as missing.
              value: metrics.map((m) => scaleValue(s.values[m], scales[m]) ?? 0),
              ...shapeStyle(s.role, c),
            })),
        },
      ],
    }
  }
})
</script>

<template>
  <EChart :option="option" />
</template>
