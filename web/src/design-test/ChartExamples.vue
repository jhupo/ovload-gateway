<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { use } from 'echarts/core'
import { LineChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, AriaComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import { TrendingUp, ChartPie } from '@lucide/vue'
use([LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, AriaComponent, SVGRenderer])
const props = defineProps<{dark: boolean}>()
const { t: tx, locale } = useI18n()
const metric = ref('requests')
const motion = matchMedia('(prefers-reduced-motion: reduce)')
const reduced = ref(motion.matches)
const updateMotion = () => { reduced.value = motion.matches }
onMounted(() => motion.addEventListener('change',updateMotion))
onUnmounted(() => motion.removeEventListener('change',updateMotion))
const number = computed(() => new Intl.NumberFormat(locale.value))
const labels = ['09/13','09/14','09/15','09/16','09/17','09/18','09/19']
const series = {requests:[1620,920,790,885,975,750,110], users:[95,160,145,245,310,355,420], latency:[460,380,350,410,290,320,270]}
const chartText = computed(() => props.dark ? '#adb5c4' : '#667085')
const shared = computed(() => ({ animation:!reduced.value, animationDuration:450, animationDurationUpdate:350, textStyle:{fontFamily:'Inter Variable, Noto Sans SC Variable, sans-serif',fontSize:12}, aria:{enabled:true}, tooltip:{renderMode:'html',confine:true,backgroundColor:props.dark?'rgba(30,33,44,.96)':'rgba(255,255,255,.96)',borderColor:props.dark?'#394150':'#e4e7ec',textStyle:{color:props.dark?'#eceef3':'#18202a',fontFamily:'Inter Variable, Noto Sans SC Variable, sans-serif',fontSize:12},extraCssText:'border-radius:10px;box-shadow:0 6px 24px #00000016;backdrop-filter:blur(14px);'} }))
const lineOption = computed(() => ({...shared.value,tooltip:{...shared.value.tooltip,trigger:'axis',valueFormatter:(v:unknown)=>number.value.format(Number(v))},grid:{left:42,right:18,top:25,bottom:32},xAxis:{type:'category',boundaryGap:false,data:labels,axisLine:{show:false},axisTick:{show:false},axisLabel:{color:chartText.value,fontSize:12,margin:15}},yAxis:{type:'value',axisLabel:{color:chartText.value,fontSize:12},splitLine:{lineStyle:{type:'dashed',color:props.dark?'#ffffff0c':'#1018280a'}}},series:[{type:'line',name:tx(metric.value==='requests'?'请求量':metric.value==='users'?'用户增长':'响应延迟'),data:series[metric.value as keyof typeof series],smooth:.35,symbol:'circle',symbolSize:7,showSymbol:false,lineStyle:{width:2,color:'#13b995'},itemStyle:{color:'#13b995',borderWidth:2,borderColor:props.dark?'#181b21':'#ffffff'},areaStyle:{color:{type:'linear',x:0,y:0,x2:0,y2:1,colorStops:[{offset:0,color:'#13b99533'},{offset:1,color:'#13b99500'}]}}}]}))
const pieOption = computed(() => ({...shared.value,tooltip:{...shared.value.tooltip,trigger:'item',formatter:'{b}<br/>{c} ({d}%)'},legend:{bottom:0,left:'center',itemWidth:8,itemHeight:8,icon:'circle',textStyle:{color:chartText.value,fontSize:12}},series:[{name:tx('供应商分布'),type:'pie',radius:['48%','67%'],center:['50%','44%'],avoidLabelOverlap:true,label:{show:false},emphasis:{scaleSize:5},itemStyle:{borderRadius:3},data:[{name:'OpenAI',value:6897,itemStyle:{color:'#5e83e9'}},{name:'Gemini',value:1620,itemStyle:{color:'#49b899'}},{name:'Grok',value:540,itemStyle:{color:'#a68cdd'}}]}]}))
</script>
<template><section class="chart-examples" aria-label="Charts"><article class="gallery-card chart-card"><div class="chart-heading"><h3><TrendingUp :size="16"/>{{ tx('核心趋势') }}</h3><Tabs v-model:value="metric" class="chart-tabs"><TabList><Tab value="requests">{{ tx('请求量') }}</Tab><Tab value="users">{{ tx('用户增长') }}</Tab><Tab value="latency">{{ tx('响应延迟') }}</Tab></TabList></Tabs></div><VChart :option="lineOption" autoresize class="data-chart line-chart"/><small>{{ tx('示例数据') }}</small></article><article class="gallery-card chart-card"><h3><ChartPie :size="16"/>{{ tx('供应商分布') }}</h3><VChart :option="pieOption" autoresize class="data-chart donut-chart"/></article></section></template>
