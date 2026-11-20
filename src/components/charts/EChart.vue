<script setup>
// One ECharts chart filling this element, in the app's chart theme. The chart follows the element's
// size, and the option is replaced whenever it changes.
//
// `option` is an ECharts option object, or a function of the chart's size ({ width, height }) for
// charts that place things in pixels (it is called again after every resize).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { echarts } from '@/services/charts/echarts'
import { useChartTheme } from '@/services/charts/theme'

const props = defineProps({
  option: { type: [Object, Function], required: true },
  // Components replaced (not merged) on every update, keeping the rest of the chart's state, such
  // as its zoom. Empty: the whole option is replaced.
  replaceMerge: { type: Array, default: () => [] },
})

// ECharts mouse events on the chart's items (e.g. a dot or a polygon), with ECharts' params.
const emit = defineEmits(['click'])

const el = ref(null)
let chart = null
let observer = null
let size = { width: 0, height: 0 }
let rendered = false

function render() {
  if (!chart || !size.width || !size.height) return
  const option = typeof props.option === 'function' ? props.option(size) : props.option
  // notMerge: the new option replaces the old one, so removed series and components disappear.
  if (rendered && props.replaceMerge.length) {
    chart.setOption(option, { replaceMerge: props.replaceMerge })
  } else {
    chart.setOption(option, { notMerge: true })
  }
  rendered = true
}

onMounted(() => {
  chart = echarts.init(el.value, useChartTheme())
  chart.on('click', (params) => emit('click', params))
  observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect
    // A hidden chart (e.g. in an inactive tab) has no size; keep the last drawing until it's back.
    if (!width || !height) return
    const changed = width !== size.width || height !== size.height
    size = { width, height }
    chart.resize()
    // The first size draws the chart; later ones redraw only size-dependent options.
    if (changed && (!rendered || typeof props.option === 'function')) render()
  })
  observer.observe(el.value)
})

watch(() => props.option, render)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})

defineExpose({
  /** The ECharts instance (null before mounting), for actions such as highlighting. */
  getChart: () => chart,
})
</script>

<template>
  <div ref="el" class="echart"></div>
</template>

<style scoped>
.echart {
  width: 100%;
  height: 100%;
  min-height: 0;
}
</style>
