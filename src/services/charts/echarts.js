// ECharts with only the parts the app uses, so the bundle stays small. Import `echarts` from here,
// never from 'echarts' itself (that would pull in every chart type).

import { CustomChart, LineChart, RadarChart, ScatterChart } from 'echarts/charts'
import {
  BrushComponent,
  DataZoomComponent,
  GraphicComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  RadarComponent,
  ToolboxComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  ScatterChart,
  RadarChart,
  CustomChart,
  // The scatter's diagonal.
  LineChart,
  GridComponent,
  RadarComponent,
  TooltipComponent,
  LegendComponent,
  BrushComponent,
  // The brush (the scatter's lasso) always adds a toolbox to the option, even with no buttons.
  ToolboxComponent,
  DataZoomComponent,
  MarkLineComponent,
  GraphicComponent,
  CanvasRenderer,
])

export { echarts }
