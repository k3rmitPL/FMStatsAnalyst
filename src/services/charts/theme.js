// The chart theme, built from the --chart-* CSS properties (set from _variables.scss in app.scss),
// so chart colours are edited in SCSS like the rest of the app. JS never defines a colour.

import { echarts } from './echarts'

export const THEME_NAME = 'fm-stats'

let colors = null

/** The chart colours, read once from the CSS properties on :root. */
export function chartColors() {
  if (colors) return colors
  const style = getComputedStyle(document.documentElement)
  const read = (name) => style.getPropertyValue(`--chart-${name}`).trim()
  colors = {
    primary: read('primary'),
    primaryFill: read('primary-fill'),
    primaryFaint: read('primary-faint'),
    secondary: read('secondary'),
    secondaryFill: read('secondary-fill'),
    text: read('text'),
    faint: read('faint'),
    grid: read('grid'),
    line: read('line'),
    muted: read('muted'),
    tooltipBackground: read('tooltip-background'),
    tooltipBorder: read('tooltip-border'),
  }
  return colors
}

let registered = false

/** Registers the theme with ECharts (once); returns its name for `echarts.init`. */
export function useChartTheme() {
  if (registered) return THEME_NAME
  const c = chartColors()
  const fontFamily = getComputedStyle(document.body).fontFamily
  const axis = {
    axisLine: { lineStyle: { color: c.text } },
    axisTick: { lineStyle: { color: c.text } },
    axisLabel: { color: c.text },
    splitLine: { lineStyle: { color: c.grid } },
    nameTextStyle: { color: c.text },
  }
  echarts.registerTheme(THEME_NAME, {
    color: [c.primary, c.secondary],
    backgroundColor: 'transparent',
    textStyle: { color: c.text, fontFamily },
    legend: { textStyle: { color: c.text } },
    tooltip: {
      backgroundColor: c.tooltipBackground,
      borderColor: c.tooltipBorder,
      textStyle: { color: c.text },
    },
    valueAxis: axis,
    categoryAxis: axis,
    radar: {
      axisName: { color: c.text },
      axisLine: { lineStyle: { color: c.grid } },
      splitLine: { lineStyle: { color: c.grid } },
      splitArea: { show: false },
    },
  })
  registered = true
  return THEME_NAME
}
