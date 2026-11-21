import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components'
import { init, use as registerCharts } from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'

registerCharts([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  MarkLineComponent,
  SVGRenderer,
])

export function createTelemetryChart(container: HTMLDivElement) {
  return init(container, undefined, { renderer: 'svg' })
}
