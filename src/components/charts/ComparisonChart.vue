<script setup>
// A radar or butterfly chart comparing players and groups (see services/charts/comparison.js),
// or a hint when it can't be drawn. Used by the table's chart panel and by dashboard cards.
import { computed } from 'vue'

import ButterflyChart from '@/components/charts/ButterflyChart.vue'
import RadarChart from '@/components/charts/RadarChart.vue'
import { useComparisonChart } from '@/composables/useComparisonChart'
import { RADAR_MIN_METRICS } from '@/services/charts/comparison'

const props = defineProps({
  type: { type: String, required: true }, // 'radar' | 'butterfly'
  // Radar metrics, and butterfly columns of metrics (the one not drawn is ignored).
  radarMetrics: { type: Array, default: () => [] },
  butterflyColumns: { type: Array, default: () => [[]] },
  // Selected players, 0-2: { name, row }.
  players: { type: Array, required: true },
  filteredRows: { type: Array, required: true },
  positionsRows: { type: Array, required: true },
  aggregate: { type: String, required: true },
  columnInfo: { type: Object, required: true },
  label: { type: Function, required: true },
  // Shown when no players match.
  emptyText: { type: String, default: 'No players match the filters.' },
  // Fill the parent's height (a flex column) instead of drawing square charts, e.g. in a dashboard
  // card, whose chart area has the same height for every chart type.
  fill: { type: Boolean, default: false },
})

const isButterfly = computed(() => props.type === 'butterfly')
// Every butterfly column is drawn, an empty one (just added) as an empty square.
const metrics = computed(() =>
  isButterfly.value ? props.butterflyColumns.flat() : props.radarMetrics,
)

const { shapes, sides, scales } = useComparisonChart({
  type: () => props.type,
  metrics,
  players: () => props.players,
  filteredRows: () => props.filteredRows,
  positionsRows: () => props.positionsRows,
  aggregate: () => props.aggregate,
  columnInfo: () => props.columnInfo,
})

const minMetrics = computed(() => (isButterfly.value ? 1 : RADAR_MIN_METRICS))
const enoughMetrics = computed(() => metrics.value.length >= minMetrics.value)
</script>

<template>
  <template v-if="enoughMetrics && filteredRows.length">
    <div v-if="!isButterfly" class="chart-box" :class="{ fill }">
      <RadarChart :metrics="radarMetrics" :label="label" :shapes="shapes" :scales="scales" />
    </div>
    <ButterflyChart
      v-else
      :columns="butterflyColumns"
      :label="label"
      :left="sides.left"
      :right="sides.right"
      :scales="scales"
      :fill="fill"
    />
  </template>
  <p v-else-if="!enoughMetrics" class="hint chart-box" :class="{ fill }">
    Pick at least {{ minMetrics }} metric{{ minMetrics === 1 ? '' : 's' }} for the
    {{ isButterfly ? 'chart' : 'radar' }}.
  </p>
  <p v-else class="hint chart-box" :class="{ fill }">{{ emptyText }}</p>
</template>

<style lang="scss" scoped>
.chart-box {
  display: flex;
  aspect-ratio: 1;

  &.fill {
    flex: 1;
    min-height: 0;
    aspect-ratio: auto;
  }

  .echart {
    flex: 1;
  }
}

.hint {
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 1rem;
  text-align: center;
  opacity: 0.7;
}
</style>
