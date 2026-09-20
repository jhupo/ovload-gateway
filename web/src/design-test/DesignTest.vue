<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Moon, Sun, Layers3, SlidersHorizontal, Table2, MessageSquare, ArrowUpRight, Plus, Check, Search, Sparkles, Zap, MoveUpRight, X, PanelLeftClose, PanelLeftOpen, Menu as MenuIcon, Languages } from '@lucide/vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Password from 'primevue/password'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import MultiSelect from 'primevue/multiselect'
import AutoComplete from 'primevue/autocomplete'
import DatePicker from 'primevue/datepicker'
import ToggleSwitch from 'primevue/toggleswitch'
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import Slider from 'primevue/slider'
import SelectButton from 'primevue/selectbutton'
import Tag from 'primevue/tag'
import Badge from 'primevue/badge'
import Chip from 'primevue/chip'
import Avatar from 'primevue/avatar'
import ProgressBar from 'primevue/progressbar'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Popover from 'primevue/popover'
import Menu from 'primevue/menu'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Accordion from 'primevue/accordion'
import AccordionPanel from 'primevue/accordionpanel'
import AccordionHeader from 'primevue/accordionheader'
import AccordionContent from 'primevue/accordioncontent'
import Stepper from 'primevue/stepper'
import StepList from 'primevue/steplist'
import Step from 'primevue/step'
import StepPanels from 'primevue/steppanels'
import StepPanel from 'primevue/steppanel'
import FileUpload from 'primevue/fileupload'
import Tree from 'primevue/tree'
import Timeline from 'primevue/timeline'
import Divider from 'primevue/divider'
import Breadcrumb from 'primevue/breadcrumb'
import { useToast } from 'primevue/usetoast'
import ChartExamples from './ChartExamples.vue'
import { useI18n } from 'vue-i18n'
import { useConfirm } from 'primevue/useconfirm'

const { t: tx, locale } = useI18n()
const collapsed = ref(localStorage.getItem('ovload-nav-collapsed') === 'true')
const mobileNav = ref(false)
watch(collapsed, value => localStorage.setItem('ovload-nav-collapsed', String(value)))
const editDialog = ref(false)
const draftName = ref('')
const dirty = computed(() => draftName.value !== name.value)
function openEditor() { draftName.value = name.value; editDialog.value = true }
function saveEditor() { name.value = draftName.value; editDialog.value = false; notify('示例设置已更新，仅保留在当前页面') }
const navItems = [{href:'#overview',icon:Layers3,label:'组件概览'},{href:'#inputs',icon:SlidersHorizontal,label:'输入与选择'},{href:'#data',icon:Table2,label:'数据与导航'},{href:'#feedback',icon:MessageSquare,label:'反馈与浮层'}]
const dark = ref(localStorage.getItem('ovload-theme') === 'dark' || (!localStorage.getItem('ovload-theme') && matchMedia('(prefers-color-scheme: dark)').matches))
function applyTheme() { document.documentElement.dataset.theme = dark.value ? 'dark' : 'light' }
function toggleTheme() { dark.value = !dark.value; localStorage.setItem('ovload-theme', dark.value ? 'dark' : 'light'); applyTheme() }
applyTheme()
const toast = useToast()
const confirm = useConfirm()
function notify(detail: string, context = '') { toast.add({ severity: 'success', summary: tx('预览反馈'), detail: context ? `${context} · ${tx(detail)}` : tx(detail), life: 4000 }) }
const dialog = ref(false)
const drawer = ref(false)
const popover = ref<InstanceType<typeof Popover>>()
const menu = ref<InstanceType<typeof Menu>>()
const busy = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function save() { busy.value = true; timer = setTimeout(() => { busy.value = false; notify('示例设置已更新，仅保留在当前页面') }, 700) }
onUnmounted(() => clearTimeout(timer))
function askDelete() { confirm.require({ header: tx('确认移除示例？'), message: tx('仅演示确认流程，不会删除真实数据。'), acceptLabel: tx('确认示例操作'), rejectLabel: tx('取消'), accept: () => notify('已确认示例移除操作') }) }
const scene = ref('glass')
const name = ref('Production workspace')
const email = ref('invalid-email')
const validEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value))
const password = ref('')
const description = ref('')
const enabled = ref(true)
const agreed = ref(false)
const scope = ref('工作空间')
const count = ref(5)
const quota = ref(38)
const selectedProvider = ref('全部供应商')
const providers = ['全部供应商', 'OpenAI', 'Gemini', 'Grok']
const models = ref(['Responses'])
const date = ref<Date[]>()
const model = ref('')
const suggestions = ref<string[]>([])
function suggest(event: { query: string }) { suggestions.value = ['gpt-5.5', 'gemini-pro', 'grok'].filter(v => v.includes(event.query.toLowerCase())) }
const query = ref('')
const filter = ref('所有账号')
const selectedRows = ref([])
const rows = [
 { id: 1, name: 'Atlas · Primary', provider: 'OpenAI', status: '可用', quota: 38 },
 { id: 2, name: 'Orion · Workspace', provider: 'Gemini', status: '可用', quota: 64 },
 { id: 3, name: 'Nova · Research', provider: 'Grok', status: '冷却中', quota: 100 },
 { id: 4, name: 'Vega · Sandbox', provider: 'OpenAI', status: '停用', quota: 12 },
]
const filtered = computed(() => rows.filter(row => row.name.toLowerCase().includes(query.value.toLowerCase()) && (selectedProvider.value === '全部供应商' || row.provider === selectedProvider.value) && (filter.value === '所有账号' || row.status === filter.value)))
function clearFilters() { query.value = ''; filter.value = '所有账号'; selectedProvider.value = '全部供应商' }
const menuItems = [{ label: '查看示例详情', command: () => { drawer.value = true } }, { label: '移除示例', command: askDelete }]
const nodes = [{ key: '0', label: '生产工作空间', children: [{ key: '0-0', label: 'OpenAI 账号组' }, { key: '0-1', label: 'Gemini 账号组' }] }, { key: '1', label: '测试工作空间' }]
const localizedNodes = computed(() => nodes.map(node => ({...node,label:tx(node.label),children:node.children?.map(child => ({...child,label:tx(child.label)}))})))
const treeSelection = ref({})
const uploaded = ref('')
const events = [{ name: '接收请求', detail: '12:30:00 · 时间线示例' }, { name: '选择账号', detail: '12:30:00 · Atlas' }, { name: '响应完成', detail: '12:30:02 · 正常结束' }]
</script>

<template>
  <div class="gallery" :class="{'nav-collapsed': collapsed}">
    <aside id="desktop-navigation" class="gallery-side"><a href="/" class="brand" aria-label="Ovload Gateway"><span class="mark">o</span><span class="brand-name">ovload<span class="brand-dot">.</span></span></a><span class="eyebrow">WORKSPACE</span><nav><a v-for="item in navItems" :key="item.href" :href="item.href" :aria-label="tx(item.label)" :title="collapsed ? tx(item.label) : undefined"><component :is="item.icon" :size="16"/><span>{{ tx(item.label) }}</span></a></nav><div class="gallery-side-note">Less friction.<br>More possibility.<small>OVLOAD / COMPONENT LAB</small></div></aside>
    <div class="gallery-workspace"><header class="gallery-header"><div class="header-leading"><Button class="desktop-nav-toggle" text severity="secondary" :aria-label="collapsed ? tx('展开导航') : tx('收起导航')" :aria-expanded="!collapsed" aria-controls="desktop-navigation" @click="collapsed = !collapsed"><PanelLeftOpen v-if="collapsed" :size="16"/><PanelLeftClose v-else :size="16"/></Button><Button class="mobile-nav-toggle" text severity="secondary" :aria-label="tx('打开导航')" :aria-expanded="mobileNav" @click="mobileNav = true"><MenuIcon :size="18"/></Button><Breadcrumb :model="[{ label: tx('设计工作台'), url: '#overview' }, { label: tx('组件评审') }]"/></div><div class="gallery-row"><Languages :size="16" class="locale-icon"/><Select v-model="locale" :options="[{label:'简体中文',value:'zh-CN'},{label:'English',value:'en'}]" option-label="label" option-value="value" aria-label="Language / 语言" class="locale-select"/><Button :aria-label="dark ? tx('切换浅色主题') : tx('切换深色主题')" severity="secondary" text @click="toggleTheme"><Transition name="theme-icon" mode="out-in"><Sun v-if="dark" key="sun" :size="16"/><Moon v-else key="moon" :size="16"/></Transition></Button></div></header>
    <main class="gallery-main"><nav class="gallery-row" aria-label="Design"><a href="/">{{ tx('首页') }}</a><a href="/preview.html?view=user">{{ tx('用户空间') }}</a><a href="/preview.html?view=admin">{{ tx('管理控制台') }}</a></nav>
      <section id="overview" class="gallery-heading"><div><span class="eyebrow">OVLOAD / EXPERIENCE LAB</span><h1>{{ tx('让每一次交互，') }}<br><span>{{ tx('都有恰好的回应。') }}</span></h1><p>{{ tx('柔和的光，轻盈的层次，以及指尖可见的反馈。') }}</p></div><Tag :value="tx('交互设计预览 · 03')" severity="secondary"/></section>
      <section class="experience-stage" :aria-label="tx('交互动效体验区')">
        <div class="stage-copy"><div class="stage-kicker"><Sparkles :size="15"/> FLUID BY DESIGN</div><h2>{{ tx('轻一点，') }}<br>{{ tx('感受多一点。') }}</h2><p>{{ tx('透过界面看见光，') }}<br>{{ tx('让状态变化自然发生。') }}</p><div class="stage-actions"><Button :label="tx('预览新建弹窗')" @click="dialog = true"><template #icon><Plus :size="17"/></template></Button><Button :label="tx('打开详情抽屉')" text @click="drawer = true"><template #icon><MoveUpRight :size="16"/></template></Button></div></div>
        <div class="stage-visual"><div class="light-sphere sphere-a"></div><div class="light-sphere sphere-b"></div><div class="light-sphere sphere-c"></div><div class="floating-note"><span class="mini-dot"></span>All systems in harmony</div><div class="glass-specimen"><div class="specimen-top"><span class="specimen-icon"><Layers3 :size="23"/></span><Tag value="LIVE PREVIEW" severity="secondary"/></div><SelectButton v-model="scene" :options="[{label:tx('玻璃层次'),value:'glass'},{label:tx('状态切换'),value:'motion'}]" option-label="label" option-value="value" :allow-empty="false" :aria-label="tx('效果演示切换')"/><div class="specimen-content"><Transition name="scene" mode="out-in"><div v-if="scene === 'glass'" key="glass"><span class="specimen-caption">YOUR WORKSPACE</span><h3>Everything,<br>beautifully connected.</h3><div class="specimen-avatars"><Avatar label="OA" shape="circle"/><Avatar label="GE" shape="circle"/><Avatar label="GR" shape="circle"/><small>{{ tx('一个入口，无限可能') }}</small></div></div><div v-else key="motion"><span class="specimen-caption">FEEL THE TRANSITION</span><h3>{{ tx('自然切换，') }}<br>{{ tx('保持专注。') }}</h3><p class="specimen-description">{{ tx('内容淡入、位移与层次变化，') }}<br>{{ tx('让每一次操作都有清晰反馈。') }}</p></div></Transition></div><div class="specimen-bottom"><span><Zap :size="14"/>Ready when you are</span><Button :aria-label="tx('体验点击波纹')" rounded @click="notify('你刚刚体验了点击波纹与通知动画')"><MoveUpRight :size="19"/></Button></div></div><div class="floating-chip"><Check :size="14"/> Designed to feel right.</div></div>
      </section>
      <ChartExamples :dark="dark"/>
      <section class="gallery-metrics"><article class="gallery-card"><div class="gallery-between"><span>{{ tx('示例请求量') }}</span><ArrowUpRight :size="17"/></div><strong class="gallery-number">128,430 <small>{{ tx('次') }}</small></strong><div class="gallery-bars" aria-hidden="true"><i v-for="(h,i) in [30,42,34,54,49,61,54,78,62,89,80,100]" :key="i" :style="{height: h+'%'}"></i></div><small>{{ tx('图形与数字排版样本') }}</small></article><article class="gallery-card"><div class="gallery-between"><span>{{ tx('额度进度') }}</span><Tag :value="tx('正常')" severity="success"/></div><strong class="gallery-number">{{ quota }}<small> / 100%</small></strong><ProgressBar :value="quota" :show-value="false"/><small>{{ tx('与下方额度滑块联动') }}</small></article><article class="gallery-card"><div class="gallery-between"><span>{{ tx('状态与标记') }}</span><Badge value="4"/></div><strong class="gallery-number">Ready<small> to review</small></strong><div class="gallery-row"><Tag :value="tx('可用')" severity="success"/><Tag :value="tx('冷却中')" severity="warn"/><Tag :value="tx('异常')" severity="danger"/><Tag :value="tx('停用')" severity="secondary"/></div></article></section>
      <div class="gallery-section"><div><h2>{{ tx('基础操作') }}</h2></div><small>01 / ACTIONS</small></div>
      <section class="gallery-grid"><article class="gallery-card"><h3>{{ tx('按钮与触感') }}</h3><div class="gallery-row"><Button class="sweep-button" :label="tx('保存示例')" :loading="busy" @click="save"/><Button :label="tx('次要操作')" severity="secondary" @click="notify('次要操作已触发')"/><Button :label="tx('轻量操作')" text @click="notify('轻量操作已触发')"/></div><div class="gallery-row"><Button :label="tx('危险操作')" severity="danger" outlined @click="askDelete"/><Button :label="tx('不可用')" disabled/><Button :label="tx('加载中')" loading disabled/><Button v-tooltip.top="tx('添加一个示例')" :aria-label="tx('添加示例')" rounded outlined @click="dialog = true"><Plus :size="17"/></Button></div><Divider/><div class="gallery-between"><label for="auto-refresh">{{ tx('自动刷新') }}<small>{{ tx('仅演示开关状态') }}</small></label><ToggleSwitch v-model="enabled" input-id="auto-refresh"/></div><div class="gallery-field"><label for="quota-slider">{{ tx('额度使用率') }} · {{ quota }}%</label><Slider v-model="quota" input-id="quota-slider" :aria-label="tx('额度使用率')"/></div></article>
      <article class="gallery-card"><h3>{{ tx('身份与选项') }}</h3><div class="gallery-row"><Avatar label="OV" shape="circle"/><Avatar label="AI"/><Chip :label="tx('生产环境')"/><Chip :label="tx('可移除标签')" removable><template #removeicon="{removeCallback, keydownCallback}"><X :size="14" :stroke-width="1.75" role="button" tabindex="0" :aria-label="tx('移除标签')" @click="removeCallback" @keydown="keydownCallback"/></template></Chip><Badge value="12" severity="info"/></div><Divider/><div class="gallery-row"><Checkbox v-model="agreed" input-id="agree" binary/><label for="agree">{{ tx('启用示例选项') }}</label></div><div class="gallery-row"><template v-for="item in ['工作空间','个人']" :key="item"><RadioButton v-model="scope" :input-id="item" name="scope" :value="item"/><label :for="item">{{ tx(item) }}</label></template></div><SelectButton v-model="filter" :options="['所有账号','可用','冷却中'].map(value => ({value,label:tx(value)}))" option-label="label" option-value="value" :allow-empty="false" :aria-label="tx('账号状态筛选')"/></article></section>
      <div id="inputs" class="gallery-section"><div><h2>{{ tx('输入，自然顺手') }}</h2></div><small>02 / INPUTS</small></div>
      <section class="gallery-grid"><article class="gallery-card"><h3>{{ tx('文本与校验') }}</h3><div class="gallery-field"><label for="workspace-name">{{ tx('工作空间名称') }}</label><InputText id="workspace-name" v-model="name"/></div><div class="gallery-field"><label for="email">{{ tx('通知邮箱') }}</label><InputText id="email" v-model="email" :invalid="!validEmail" :aria-invalid="!validEmail" aria-describedby="email-hint"/><small id="email-hint" :class="{'gallery-error': !validEmail}">{{ validEmail ? tx('邮箱格式正确') : tx('请输入有效邮箱，例如 name@example.com') }}</small></div><div class="gallery-field"><label for="password">{{ tx('密码控件') }}</label><Password v-model="password" input-id="password" toggle-mask :feedback="false" :placeholder="tx('仅输入演示文本')" fluid/></div><div class="gallery-field"><label for="description">{{ tx('备注') }}</label><Textarea id="description" v-model="description" rows="3" auto-resize :placeholder="tx('输入示例说明…')"/></div><InputText :value="tx('禁用输入样式')" disabled :aria-label="tx('禁用输入示例')" fluid/></article>
      <article class="gallery-card"><h3>{{ tx('选择与范围') }}</h3><div class="gallery-field"><label for="provider">{{ tx('供应商筛选') }}</label><Select v-model="selectedProvider" input-id="provider" :options="providers.map(value => ({value,label:tx(value)}))" option-label="label" option-value="value"/></div><div class="gallery-field"><label for="protocols">{{ tx('协议能力') }}</label><MultiSelect v-model="models" input-id="protocols" :options="['Responses','Chat Completions','Messages','WebSocket']" display="chip" :placeholder="tx('选择协议')"><template #chipicon="{removeCallback, item}"><Button text class="chip-remove" :aria-label="tx('移除协议') + ' ' + item" @click.stop="removeCallback($event, item)"><X :size="14" :stroke-width="1.75"/></Button></template></MultiSelect></div><div class="gallery-field"><label for="model">{{ tx('模型自动补全') }}</label><AutoComplete v-model="model" input-id="model" :suggestions="suggestions" @complete="suggest" :placeholder="tx('输入 g 搜索')" dropdown/></div><div class="gallery-field"><label for="date-range">{{ tx('查询日期范围') }}</label><DatePicker v-model="date" input-id="date-range" selection-mode="range" :manual-input="false" show-icon date-format="yy-mm-dd" show-button-bar :placeholder="tx('选择起止日期')"/></div><div class="gallery-field"><label for="concurrency">{{ tx('并发数量') }}</label><InputNumber v-model="count" input-id="concurrency" :min="1" :max="20" show-buttons/></div></article></section>
      <div id="data" class="gallery-section"><div><h2>{{ tx('数据，自有秩序') }}</h2></div><small>03 / DATA & NAVIGATION</small></div>
      <section class="gallery-card gallery-table"><div class="gallery-toolbar"><SelectButton v-model="filter" :options="['所有账号','可用','冷却中'].map(value => ({value,label:tx(value)}))" option-label="label" option-value="value" :allow-empty="false" :aria-label="tx('表格状态筛选')"/><div class="gallery-search"><Search :size="16"/><InputText v-model="query" :aria-label="tx('搜索示例账号')" :placeholder="tx('搜索账号名称…')"/></div></div><DataTable v-model:selection="selectedRows" :value="filtered" data-key="id" paginator :rows="3" :rows-per-page-options="[3,5,10]" table-style="min-width: 42rem" removable-sort><Column selection-mode="multiple" header-style="width:3rem"/><Column field="name" :header="tx('账号名称')" sortable><template #body="{data}"><div class="gallery-account"><Avatar :label="data.provider.slice(0,2).toUpperCase()"/><div><strong>{{ data.name }}</strong><small>{{ tx('示例账号 · 非真实连接') }}</small></div></div></template></Column><Column field="provider" :header="tx('供应商')" sortable/><Column field="status" :header="tx('状态')"><template #body="{data}"><Tag :value="tx(data.status)" :severity="data.status === '可用' ? 'success' : data.status === '冷却中' ? 'warn' : 'secondary'"/></template></Column><Column field="quota" :header="tx('窗口额度')" sortable><template #body="{data}"><ProgressBar :value="data.quota"/></template></Column><Column :header="tx('操作')"><template #body="{data}"><Button :label="tx('查看')" text size="small" @click="notify('示例账号', data.name)"/></template></Column><template #empty><div class="gallery-empty"><h3>{{ tx('没有匹配的账号') }}</h3><p>{{ tx('调整筛选条件或搜索关键词。') }}</p><Button :label="tx('清除筛选')" severity="secondary" @click="clearFilters"/></div></template></DataTable><small class="gallery-selection">{{ tx('账号选择摘要', {count:filtered.length,selected:selectedRows.length}) }}</small></section>
      <section class="gallery-grid gallery-spaced"><article class="gallery-card"><h3>{{ tx('页签与折叠面板') }}</h3><Tabs value="0"><TabList><Tab value="0">{{ tx('概览') }}</Tab><Tab value="1">{{ tx('配置') }}</Tab><Tab value="2">{{ tx('记录') }}</Tab></TabList><TabPanels><TabPanel value="0"><Message severity="info" :closable="false">{{ tx('暂无数据') }}</Message></TabPanel><TabPanel value="1">{{ tx('等待配置') }}</TabPanel><TabPanel value="2">{{ tx('暂无真实请求记录。') }}</TabPanel></TabPanels></Tabs><Accordion value="0"><AccordionPanel value="0"><AccordionHeader>{{ tx('账号出口设置') }}</AccordionHeader><AccordionContent>{{ tx('等待配置') }}</AccordionContent></AccordionPanel><AccordionPanel value="1"><AccordionHeader>{{ tx('用量与额度说明') }}</AccordionHeader><AccordionContent>{{ tx('暂无数据') }}</AccordionContent></AccordionPanel></Accordion></article><article class="gallery-card"><h3>{{ tx('分组树与事件时间线') }}</h3><Tree v-model:selection-keys="treeSelection" :value="localizedNodes" selection-mode="single"/><Divider/><Timeline :value="events"><template #content="{item}"><strong>{{ tx(item.name) }}</strong><small>{{ tx(item.detail) }}</small></template></Timeline></article></section>
      <div id="feedback" class="gallery-section"><div><h2>{{ tx('反馈，恰到好处') }}</h2></div><small>04 / FEEDBACK</small></div>
      <section class="gallery-grid"><article class="gallery-card gallery-plan"><Tag value="PLAN PREVIEW"/><h3>Pro workspace</h3><p>{{ tx('为持续构建的团队，留出更多空间。') }}</p><strong class="gallery-number">¥ 99 <small>{{ tx('/ 月 · 示例价格') }}</small></strong><ul><li><Check :size="16"/>{{ tx('统一的模型访问入口') }}</li><li><Check :size="16"/>{{ tx('清晰的用量与请求记录') }}</li><li><Check :size="16"/>{{ tx('账号与工作空间管理') }}</li></ul><Button :label="tx('预览选择反馈')" fluid @click="notify('仅套餐设计预览，不会创建订单')"/></article><article class="gallery-card"><h3>{{ tx('提示与加载状态') }}</h3><Message severity="success" :closable="false">{{ tx('设置已更新 · 成功状态示例') }}</Message><Message severity="warn" :closable="false">{{ tx('账号正在冷却 · 等待额度重置') }}</Message><Message severity="error" :closable="false">{{ tx('无法连接 · 请检查网络设置') }}</Message><div class="gallery-skeleton"><Skeleton shape="circle" size="2.5rem"/><div><Skeleton width="85%"/><Skeleton width="55%"/></div></div><div class="gallery-row"><Button :label="tx('触发通知')" outlined @click="notify('操作成功 · 可以关闭这条通知')"/><Button :label="tx('打开确认弹窗')" severity="secondary" @click="dialog = true"/><Button :label="tx('编辑弹窗示例')" outlined @click="openEditor"/></div></article></section>
      <section class="gallery-grid gallery-spaced"><article class="gallery-card"><h3>{{ tx('浮层与本地文件选择') }}</h3><div class="gallery-row"><Button :label="tx('预览侧边抽屉')" @click="drawer = true"/><Button :label="tx('信息浮层')" outlined @click="popover?.toggle($event)"/><Button :label="tx('更多操作')" severity="secondary" aria-haspopup="true" aria-controls="example-menu" @click="menu?.toggle($event)"/></div><Popover ref="popover"><Tag :value="tx('账号出口详情')" severity="info"/></Popover><Menu id="example-menu" ref="menu" :model="menuItems.map(item => ({...item,label:tx(item.label)}))" popup/><Divider/><FileUpload mode="basic" name="sample" accept="application/json" :max-file-size="100000" :choose-label="tx('选择本地 JSON 示例')" custom-upload :auto="false" @select="uploaded = $event.files[0]?.name ?? ''"/><small>{{ uploaded || tx('尚未选择文件') }}</small></article><article class="gallery-card"><h3>{{ tx('多步骤流程') }}</h3><Stepper value="1" linear><StepList><Step value="1">{{ tx('选择') }}</Step><Step value="2">{{ tx('确认') }}</Step><Step value="3">{{ tx('完成') }}</Step></StepList><StepPanels><StepPanel v-slot="{activateCallback}" value="1"><p>{{ tx('选择供应商') }}</p><Button :label="tx('下一步')" @click="activateCallback('2')"/></StepPanel><StepPanel v-slot="{activateCallback}" value="2"><p>{{ tx('确认配置') }}</p><div class="gallery-row"><Button :label="tx('上一步')" severity="secondary" @click="activateCallback('1')"/><Button :label="tx('确认并继续')" @click="activateCallback('3')"/></div></StepPanel><StepPanel v-slot="{activateCallback}" value="3"><Message severity="success">{{ tx('已完成') }}</Message><Button :label="tx('重新体验')" text @click="activateCallback('1')"/></StepPanel></StepPanels></Stepper></article></section>
      <footer class="gallery-footer"><span>ovload. <small>Design with intention.</small></span><small>{{ tx('设计预览 · 示例数据') }}</small></footer>
    </main></div>
    <Dialog v-model:visible="dialog" modal dismissable-mask :close-button-props="{class: 'ui-close', outlined: false, rounded: false, text: true, severity: 'secondary', 'aria-label': tx('关闭弹窗')}" :header="tx('确认这次示例操作？')" :style="{width: '28rem'}" :breakpoints="{'640px':'92vw'}"><template #closeicon><X :size="16" :stroke-width="1.75"/></template><div class="gallery-field"><label for="dialog-workspace">{{ tx('工作空间') }}</label><InputText id="dialog-workspace" :value="name" readonly/></div><template #footer><Button :label="tx('取消')" severity="secondary" @click="dialog = false"/><Button :label="tx('确认示例操作')" @click="dialog = false; notify('示例操作已确认')"/></template></Dialog>
    <Drawer :close-button-props="{class: 'ui-close', outlined: false, rounded: false, text: true, 'aria-label': tx('关闭详情')}" v-model:visible="drawer" :header="tx('账号详情预览')" position="right" class="gallery-drawer"><template #closeicon><X :size="16" :stroke-width="1.75"/></template><Tag :value="tx('示例账号')" severity="info"/><h3>Atlas · Primary</h3><Divider/><dl><dt>{{ tx('供应商') }}</dt><dd>OpenAI</dd><dt>{{ tx('连接状态') }}</dt><dd>{{ tx('未连接真实上游') }}</dd></dl></Drawer>
    <Dialog v-model:visible="editDialog" modal :header="tx('编辑工作空间')" :dismissable-mask="!dirty" :close-on-escape="!dirty" :closable="!dirty" :style="{width:'28rem'}" :close-button-props="{class:'ui-close',text:true,outlined:false,rounded:false}"><template #closeicon><X :size="16"/></template><Message v-if="dirty" severity="warn" :closable="false">{{ tx('有未保存修改，请保存或明确放弃。') }}</Message><div class="gallery-field"><label for="draft-name">{{ tx('工作空间名称') }}</label><InputText id="draft-name" v-model="draftName"/></div><template #footer><Button :label="dirty ? tx('放弃修改') : tx('取消')" severity="secondary" @click="editDialog = false"/><Button :label="tx('保存修改')" :disabled="!draftName.trim()" @click="saveEditor"/></template></Dialog>
    <Drawer v-model:visible="mobileNav" :header="tx('导航')" :aria-label="tx('导航')" class="navigation-drawer" :close-button-props="{class:'ui-close',text:true,outlined:false,rounded:false,'aria-label':tx('关闭导航')}"><template #closeicon><X :size="16"/></template><nav><a v-for="item in navItems" :key="item.href" :href="item.href" @click="mobileNav = false"><component :is="item.icon" :size="16"/>{{ tx(item.label) }}</a></nav></Drawer>
    <Toast position="bottom-right"/><ConfirmDialog :dismissable-mask="false" :close-on-escape="false" :closable="false"/>
  </div>
</template>
