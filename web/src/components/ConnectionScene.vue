<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code2, MessageSquare, Layers3, ArrowUpRight } from '@lucide/vue'
const props = withDefaults(defineProps<{phase?:number; selected?:string}>(), {phase:1,selected:'OpenAI'})
const {t:tx} = useI18n()
const providers = ['OpenAI','Gemini','Claude','Grok']
const progression = computed(() => Math.min(1, Math.max(0, props.phase)))
</script>
<template>
  <figure class="connection-scene" :style="{'--connection-progress':progression}" :aria-label="tx('应用通过 Ovload 连接模型')">
    <div class="scene-wash" aria-hidden="true"></div>
    <svg class="connection-lines" viewBox="0 0 700 430" aria-hidden="true" preserveAspectRatio="none">
      <g class="connection-tracks"><path d="M90 106 C215 106 204 214 350 214"/><path d="M90 215 H350"/><path d="M90 324 C215 324 204 214 350 214"/><path v-for="y in [66,166,266,366]" :key="y" :d="`M350 214 C480 214 483 ${y} 610 ${y}`"/></g>
      <g class="connection-active"><path pathLength="1" d="M90 215 H350"/><path pathLength="1" :d="`M350 214 C480 214 483 ${66+providers.indexOf(selected)*100} 610 ${66+providers.indexOf(selected)*100}`"/></g>
      <circle r="3" cx="90" cy="215" class="route-particle"/>
    </svg>
    <div class="scene-inputs"><span><Code2 :size="17"/>{{ tx('应用') }}</span><span><MessageSquare :size="17"/>{{ tx('对话') }}</span><span><Layers3 :size="17"/>{{ tx('工作流') }}</span></div>
    <div class="scene-core"><span>o<span>.</span></span><small>ovload</small></div>
    <div class="scene-models"><span v-for="(provider,i) in providers" :key="provider" :class="{'is-selected':selected===provider}"><b>{{ ['O','✧','C','G'][i] }}</b>{{ provider }}<ArrowUpRight :size="13"/></span></div>
  </figure>
</template>
