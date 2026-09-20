<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import Checkbox from 'primevue/checkbox'
import { Play, Pause, RotateCcw, Sun, Moon, Languages, Download } from '@lucide/vue'
import { createParticleScene, type ReviewView } from './scene'
import type { LayerId } from './models'

const { t, locale } = useI18n()
const host = ref<HTMLElement>()
const ready = ref(false), error = ref(false), playing = ref(false), dark = ref(false)
const selected = ref<ReviewView>('all')
const layerIds: LayerId[] = ['room', 'desk', 'character', 'laptop', 'screen', 'hands', 'flow']
const layers = ref<LayerId[]>([...layerIds])
const viewOptions = computed(() => ['all', 'world', 'open', 'grip', 'room'].map(value => ({ value, label: t(`asset.view.${value}`) })))
let scene: ReturnType<typeof createParticleScene> | undefined
let oldTheme: string | null = null

function selectView(value: ReviewView | null) {
  if (!value) return
  selected.value = value; playing.value = false
  scene?.setView(value)
  layers.value = scene?.inspect().layers ?? [...layerIds]
}
function togglePlay() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { scene?.setView(selected.value); return }
  playing.value = !playing.value
  if (playing.value) scene?.play(); else scene?.pause()
}
function restart() {
  selected.value = 'all'; layers.value = [...layerIds]
  scene?.restart(); playing.value = scene?.inspect().running ?? false
}
function changeLayers(value: LayerId[]) {
  layers.value = value
  layerIds.forEach(id => scene?.setLayer(id, value.includes(id)))
}
function download() {
  const image = scene?.capture()
  if (!image) return
  const anchor = document.createElement('a')
  anchor.href = image; anchor.download = `ovload-particles-${selected.value}.png`; anchor.click()
}
watch(dark, value => { document.documentElement.dataset.theme = value ? 'dark' : 'light'; scene?.setDark(value) })
watch(locale, () => scene?.setLabel(t('asset.canvas')))
onMounted(() => {
  oldTheme = document.documentElement.getAttribute('data-theme')
  document.documentElement.dataset.theme = 'light'
  try {
    scene = createParticleScene(host.value!, () => { ready.value = true })
    scene.setLabel(t('asset.canvas'))
    // Read-only hooks for repeatable visual and lifecycle checks in this dev entry.
    Object.defineProperty(window, '__ovloadParticleReview', { configurable: true, value: scene })
  } catch { error.value = true }
})
onUnmounted(() => {
  scene?.dispose()
  delete (window as Window & { __ovloadParticleReview?: unknown }).__ovloadParticleReview
  if (oldTheme === null) document.documentElement.removeAttribute('data-theme')
  else document.documentElement.setAttribute('data-theme', oldTheme)
})
</script>

<template>
  <main class="asset-review" :class="{ dark }">
    <header class="review-header">
      <div class="review-brand"><span class="brand-symbol" aria-hidden="true">O</span><strong>OVLOAD</strong><span class="review-divider"></span><span>{{ t('asset.title') }}</span></div>
      <div class="review-utilities">
        <span class="review-status">{{ t('asset.draft') }}</span>
        <Button text rounded :aria-label="t('asset.language')" @click="locale = locale === 'en' ? 'zh-CN' : 'en'"><Languages :size="18" /></Button>
        <Button text rounded :aria-label="t('asset.theme')" @click="dark = !dark"><Sun v-if="dark" :size="18" /><Moon v-else :size="18" /></Button>
      </div>
    </header>
    <section class="review-workspace">
      <div class="scene-heading"><p>{{ t('asset.eyebrow') }}</p><h1>{{ t('asset.heading') }}</h1></div>
      <div ref="host" class="particle-stage" :aria-label="t('asset.canvas')"></div>
      <p v-if="error" class="scene-error" role="alert">{{ t('asset.error') }}</p>
      <aside class="layer-panel" :aria-label="t('asset.layers')">
        <p>{{ t('asset.layers') }}</p>
        <label v-for="id in layerIds" :key="id" :for="`layer-${id}`">
          <Checkbox :model-value="layers" :input-id="`layer-${id}`" :value="id" :disabled="!ready" @update:model-value="changeLayers" />
          <span>{{ t(`asset.layer.${id}`) }}</span>
        </label>
      </aside>
      <span class="orbit-hint">{{ t('asset.orbit') }}</span>
    </section>
    <footer class="review-footer">
      <SelectButton :model-value="selected" :options="viewOptions" option-label="label" option-value="value" :allow-empty="false" :disabled="!ready" :aria-label="t('asset.views')" @update:model-value="selectView" />
      <div class="play-controls">
        <Button text :aria-label="t('asset.replay')" :disabled="!ready" @click="restart"><RotateCcw :size="17" /></Button>
        <Button severity="secondary" :disabled="!ready" :aria-label="t(playing ? 'asset.pause' : 'asset.play')" @click="togglePlay"><Pause v-if="playing" :size="16" /><Play v-else :size="16" /><span>{{ t(playing ? 'asset.pause' : 'asset.play') }}</span></Button>
        <Button text :aria-label="t('asset.save')" :disabled="!ready" @click="download"><Download :size="17" /></Button>
      </div>
    </footer>
  </main>
</template>

<style scoped>
.asset-review { --review-bg: #f6f5f2; --review-ink: #25323c; --review-muted: #7c8488; --review-rule: #dce0df; display: flex; flex-direction: column; height: 100dvh; min-height: 580px; background: var(--review-bg); color: var(--review-ink); }
.asset-review.dark { --review-bg: #10151b; --review-ink: #e1e8ec; --review-muted: #81919e; --review-rule: #28333d; }
.review-header { min-height: 76px; padding: 0 40px; border-bottom: 1px solid var(--review-rule); display: flex; align-items: center; justify-content: space-between; z-index: 2; }
.review-brand, .review-utilities, .play-controls { display: flex; align-items: center; gap: 16px; }
.review-brand strong { letter-spacing: .14em; font-size: 15px; }
.review-brand > span:last-child { font-size: 12px; color: var(--review-muted); }
.brand-symbol { width: 24px; height: 24px; font-size: 24px; font-weight: 800; line-height: 1; transform: rotate(-24deg); }
.review-divider { height: 18px; width: 1px; background: var(--review-rule); margin: 0 8px; }
.review-status { font-size: 11px; color: var(--review-muted); letter-spacing: .04em; }
.review-workspace { position: relative; flex: 1; min-height: 390px; isolation: isolate; }
.particle-stage { position: absolute; inset: 0; }
.particle-stage :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: none; outline-offset: -4px; }
.particle-stage :deep(canvas:focus-visible) { outline: 2px solid #7894a7; }
.scene-heading { position: absolute; top: 32px; left: 42px; z-index: 1; pointer-events: none; }
.scene-heading p { margin: 0 0 8px; color: var(--review-muted); font-size: 10px; letter-spacing: .20em; }
.scene-heading h1 { margin: 0; font-size: 23px; font-weight: 500; letter-spacing: -.04em; }
.layer-panel { position: absolute; right: 32px; top: 38px; z-index: 2; padding: 12px 14px 14px; background: color-mix(in srgb, var(--review-bg), transparent 18%); border-radius: 12px; }
.layer-panel p { margin: 0 0 16px; font-size: 11px; color: var(--review-muted); letter-spacing: .12em; }
.layer-panel label { display: flex; gap: 10px; align-items: center; min-height: 34px; cursor: pointer; font-size: 12px; }
.layer-panel :deep(.p-checkbox) { --p-checkbox-width: 15px; --p-checkbox-height: 15px; --p-checkbox-checked-background: #657c89; --p-checkbox-checked-border-color: #657c89; }
.orbit-hint { position: absolute; left: 42px; bottom: 22px; font-size: 11px; color: var(--review-muted); pointer-events: none; }
.review-footer { z-index: 2; min-height: 85px; display: flex; align-items: center; justify-content: space-between; padding: 18px 40px; gap: 20px; border-top: 1px solid var(--review-rule); }
.review-footer :deep(.p-togglebutton) { font-size: 12px; min-width: 72px; }
.scene-error { position: absolute; top: 45%; left: 15%; right: 15%; text-align: center; }
@media (max-width: 700px) {
  .asset-review { min-height: 680px; }
  .review-header { min-height: 64px; padding: 0 18px; }
  .review-brand { gap: 8px; } .review-brand strong { font-size: 12px; } .review-divider, .review-status { display: none; }
  .review-utilities { gap: 2px; }
  .scene-heading { left: 20px; top: 20px; } .scene-heading h1 { font-size: 19px; }
  .layer-panel { right: 12px; top: auto; bottom: 20px; display: flex; gap: 8px; flex-wrap: wrap; max-width: 250px; padding: 8px; }
  .layer-panel p { width: 100%; margin: 0; } .layer-panel label { font-size: 10px; min-height: 28px; }
  .orbit-hint { left: 20px; bottom: 110px; max-width: 120px; font-size: 10px; }
  .review-footer { padding: 12px 15px; flex-wrap: wrap; justify-content: center; gap: 10px; }
  .review-footer :deep(.p-togglebutton) { min-width: 0; font-size: 11px; padding: 6px; }
}
</style>
