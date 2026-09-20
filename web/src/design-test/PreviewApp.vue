<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowUpRight, Plus, Activity, LayoutDashboard, KeyRound, Users, Layers3, Settings2, Moon, Sun, X, Search, PanelLeftClose, PanelLeftOpen, Menu } from '@lucide/vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import Dialog from 'primevue/dialog'
import Drawer from 'primevue/drawer'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import ChartExamples from './ChartExamples.vue'
import { useTheme } from '../ui/useTheme'
const {t:tx,locale} = useI18n()
const {dark,toggleTheme} = useTheme()
const admin = ref(new URLSearchParams(location.search).get('view') === 'admin')
const collapsed = ref(false)
const mobileNav = ref(false)
const navItems = computed(() => [{href:"#overview",label:"总览",icon:LayoutDashboard},{href:"#activity",label:"请求记录",icon:Activity},{href:admin.value?"#accounts":"#keys",label:admin.value?"账号管理":"模型访问",icon:Users},{href:"#settings",label:"系统设置",icon:Settings2}])
const query = ref('')
const chosen = ref('OpenAI')
const dialog = ref(false)
const draft = ref('')
const keyName = ref('Production')
const accounts = [{name:'Atlas',provider:'OpenAI',status:'可用',quota:'38%'},{name:'Willow',provider:'Gemini',status:'可用',quota:'24%'},{name:'Birch',provider:'Grok',status:'冷却中',quota:'100%'}]
const filtered = computed(()=>accounts.filter(account => (account.name+' '+account.provider).toLowerCase().includes(query.value.toLowerCase())))
function switchView(value:boolean) { admin.value=value; query.value=''; history.replaceState(null,'',value?'?view=admin':'?view=user') }
function save() { if (!draft.value.trim()) return; keyName.value=draft.value.trim(); dialog.value=false }
function focusView() { document.querySelector<HTMLElement>('.preview-content h1')?.focus({preventScroll:true}) }
</script>
<template>
  <div class="review-ribbon"><a href="/">ovload.</a><div><Button :label="tx('用户')" :aria-pressed="!admin" text @click="switchView(false)"/><Button :label="tx('管理员')" :aria-pressed="admin" text @click="switchView(true)"/></div><span>{{ tx('设计预览') }}</span></div>
  <div class="dashboard-preview" :class="{'is-collapsed':collapsed}">
    <aside class="preview-side"><a href="/" class="preview-brand"><span>o</span><b>ovload.</b></a><div class="preview-workspace"><span class="workspace-initial">O</span><span>Ovload Studio<small>Pro workspace</small></span></div><nav :aria-label="tx('导航')"><a href="#overview" class="active" :aria-label="tx('总览')"><LayoutDashboard :size="17"/><span>{{ tx('总览') }}</span></a><a href="#activity" :aria-label="tx('请求记录')"><Activity :size="17"/><span>{{ tx('请求记录') }}</span></a><a :href="admin?'#accounts':'#keys'" :aria-label="tx(admin?'账号管理':'模型访问')"><component :is="admin?Users:KeyRound" :size="17"/><span>{{ tx(admin?'账号管理':'模型访问') }}</span></a><a href="#settings" :aria-label="tx('系统设置')"><Settings2 :size="17"/><span>{{ tx('系统设置') }}</span></a></nav><div class="preview-side-bottom"><span class="user-avatar">A</span><span>Alex Morgan<small>alex@example.com</small></span></div></aside>
    <div class="preview-workspace-main"><header class="preview-header"><div><Button class="preview-mobile-menu" text :aria-label="tx('打开导航')" :aria-expanded="mobileNav" @click="mobileNav=true"><Menu :size="17"/></Button><Button class="preview-collapse" text :aria-label="tx(collapsed?'展开导航':'收起导航')" @click="collapsed=!collapsed"><PanelLeftOpen v-if="collapsed" :size="16"/><PanelLeftClose v-else :size="16"/></Button><span>{{ tx(admin?'管理控制台':'工作空间') }}</span><span class="header-slash">/</span><span>{{ tx('总览') }}</span></div><div><Tag :value="tx('示例数据')" severity="secondary"/><Select v-model="locale" :options="[{label:'中文',value:'zh-CN'},{label:'EN',value:'en'}]" option-label="label" option-value="value" aria-label="Language / 语言"/><Button text :aria-label="tx(dark?'切换浅色主题':'切换深色主题')" @click="toggleTheme"><Sun v-if="dark" :size="17"/><Moon v-else :size="17"/></Button><span class="user-avatar">A</span></div></header>
    <Transition name="page" mode="out-in" @after-enter="focusView"><main :key="String(admin)" class="preview-content">
      <section id="overview" class="preview-title"><div><span class="quiet-label">{{ admin?'OVLOAD / ADMINISTRATION':'YOUR WORKSPACE' }}</span><h1 tabindex="-1">{{ tx(admin?'运行概况':'你好，Alex') }}<span v-if="!admin">.</span></h1><p v-if="!admin">{{ tx('今天，从一个想法开始。') }}</p></div><Button v-if="!admin" class="sweep-button" @click="draft='';dialog=true"><Plus :size="16"/><span>{{ tx('创建密钥') }}</span></Button><span v-else class="preview-date">{{ tx('近七天') }}</span></section>
      <section v-if="!admin" class="workspace-banner"><div><span class="quiet-label">ONE CONNECTION. MORE POSSIBILITY.</span><h2>{{ tx('选择，不必设限。') }}</h2><div class="banner-models"><span>OpenAI</span><span>Gemini</span><span>Claude</span><span>Grok</span></div></div><a href="#keys" class="banner-action" :aria-label="tx('模型访问')"><ArrowUpRight :size="24"/></a><div class="banner-arc" aria-hidden="true"></div></section>
      <section class="preview-metrics"><article><span>{{ tx(admin?'请求成功率':'本月请求') }}</span><strong>{{ admin?'99.98':'128,430' }}<small>{{ admin?'%':'' }}</small></strong><span class="metric-foot"><i></i>{{ admin?'2xx / 3xx':'+12.8%' }}</span><Activity :size="18"/></article><article><span>{{ tx(admin?'可用账号':'剩余额度') }}</span><strong>{{ admin?'24':'¥ 862' }}<small>{{ admin?'/ 28':'' }}</small></strong><span class="metric-foot">{{ admin?'OpenAI · Gemini · Grok':'Pro workspace' }}</span><Layers3 :size="18"/></article><article><span>{{ tx('平均延迟') }}</span><strong>324<small>ms</small></strong><span class="metric-foot">P50 · 7d</span><Activity :size="18"/></article></section>
      <section id="activity"><ChartExamples :dark="dark"/></section>
      <section v-if="admin" id="accounts" class="preview-panel"><div class="panel-heading"><h2>{{ tx('账号资源') }}</h2><div class="preview-search"><Search :size="15"/><InputText v-model="query" :placeholder="tx('搜索账号名称…')" :aria-label="tx('搜索示例账号')"/></div></div><DataTable :value="filtered" table-style="min-width:34rem"><Column field="name" :header="tx('账号名称')"/><Column field="provider" :header="tx('供应商')"/><Column :header="tx('状态')"><template #body="{data}"><Tag :value="tx(data.status)" :severity="data.status==='可用'?'success':'warn'"/></template></Column><Column field="quota" :header="tx('窗口额度')"/><template #empty>{{ tx('没有匹配的账号') }}</template></DataTable></section>
      <section v-else id="keys" class="preview-panel key-panel"><div><span class="key-icon"><KeyRound :size="20"/></span><div><h2>{{ keyName }}</h2><span>ov_demo_••••••••••••</span></div></div><Button text :label="tx('查看详情')" @click="draft=keyName;dialog=true"/></section>
      <section id="settings" class="preview-panel preferences-panel"><div><h2>{{ tx('模型偏好') }}</h2><span>{{ chosen }}</span></div><Select v-model="chosen" :options="['OpenAI','Gemini','Claude','Grok']" :aria-label="tx('模型偏好')"/></section>
    </main></Transition></div>
    <Drawer v-model:visible="mobileNav" :header="tx('导航')" :aria-label="tx('导航')" class="preview-navigation"><template #closeicon><X :size="16"/></template><nav><a v-for="item in navItems" :key="item.href" :href="item.href" @click="mobileNav=false"><component :is="item.icon" :size="17"/>{{ tx(item.label) }}</a></nav></Drawer>
    <Dialog v-model:visible="dialog" modal :header="tx('创建密钥')" :dismissable-mask="!draft" :close-on-escape="!draft" :closable="!draft" :style="{width:'27rem'}" :breakpoints="{'640px':'92vw'}"><template #closeicon><X :size="16"/></template><label for="preview-key">{{ tx('密钥名称') }}</label><InputText id="preview-key" v-model="draft" fluid/><template #footer><Button :label="tx('取消')" severity="secondary" @click="dialog=false"/><Button class="sweep-button" :label="tx('保存')" :disabled="!draft.trim()" @click="save"/></template></Dialog>
  </div>
</template>
