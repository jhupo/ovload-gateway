<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { Languages, LogIn, Moon, Sun, X } from '@lucide/vue'
import LoginPanel from '../components/LoginPanel.vue'
import { useTheme } from '../ui/useTheme'
import type { createHomepageScene } from '../scene/homepage'

const { t, locale } = useI18n()
const { dark, toggleTheme } = useTheme()
const route = useRoute(), router = useRouter()
const host = ref<HTMLElement>(), loginButton = ref<InstanceType<typeof Button>>()
const ready = ref(false), failed = ref(false), animateDialog = ref(false)
const dialog = computed(() => route.path === '/login')
let scene: ReturnType<typeof createHomepageScene> | undefined, disposed = false
function openLogin(){ animateDialog.value=true;void router.push('/login') }
function closeLogin(){ animateDialog.value=false;void router.push('/') }
function toggleLanguage(){locale.value=locale.value==='en'?'zh-CN':'en'}
function syncDialog(immediate=false){scene?.setLogin(dialog.value,(loginButton.value as unknown as { $el?: HTMLElement })?.$el?.getBoundingClientRect(),immediate)}
watch(dialog,async()=>{await nextTick();syncDialog()})
watch(dark,value=>scene?.setDark(value))
onMounted(async()=>{
  try {
    const {createHomepageScene}=await import('../scene/homepage')
    if(disposed)return
    scene=createHomepageScene(host.value!,()=>{ready.value=true},()=>{failed.value=true;ready.value=true})
    scene.setDark(dark.value)
    if(dialog.value)syncDialog(true)
    if(import.meta.env.DEV)Object.defineProperty(window,'__ovloadHomepage',{configurable:true,value:scene})
  }catch{failed.value=true;ready.value=true}
})
onUnmounted(()=>{
  disposed=true;scene?.dispose()
  if(import.meta.env.DEV)delete (window as Window & {__ovloadHomepage?:unknown}).__ovloadHomepage
})
</script>

<template>
  <main class="gateway-home" :class="{ 'is-ready':ready, 'is-login':dialog, 'scene-unavailable':failed }">
    <h1 class="sr-only">{{ t('Ovload Gateway 首页') }}</h1>
    <div ref="host" class="gateway-canvas" aria-hidden="true"></div>
    <div class="scene-vignette" aria-hidden="true"></div>
    <header class="gateway-header">
      <div class="gateway-tools">
        <Button text rounded :aria-label="dark?t('切换浅色主题'):t('切换深色主题')" @click="toggleTheme"><Sun v-if="dark" :size="15"/><Moon v-else :size="15"/></Button>
        <span class="tools-separator" aria-hidden="true"></span>
        <Button text rounded :aria-label="t('切换语言')" @click="toggleLanguage"><Languages :size="15"/></Button>
        <Button ref="loginButton" class="gateway-login" text rounded :aria-label="t('登录')" @click="openLogin"><LogIn :size="15"/></Button>
      </div>
    </header>
    <p v-if="failed" class="canvas-unavailable" role="status">{{ t('home.sceneUnavailable') }}</p>
    <footer class="gateway-footer">
      <span class="connection-caption">{{ t('home.caption') }}</span>
      <span class="footer-brand">© {{ new Date().getFullYear() }} Ovload</span>
    </footer>
    <Dialog :visible="dialog" modal dismissable-mask :draggable="false" :class="['gateway-auth',{'gateway-auth-animated':animateDialog}]" :header="t('登录')" :close-button-props="{text:true,'aria-label':t('关闭弹窗')}" @update:visible="value=>{if(!value)closeLogin()}">
      <template #closeicon><X :size="18"/></template>
      <LoginPanel id-prefix="signin"/>
    </Dialog>
  </main>
</template>

<style>
.gateway-home{--home-bg:#e3e6e8;--home-ink:#233747;--home-muted:#566875;--home-rule:#b2bcc4;position:relative;isolation:isolate;height:100svh;min-height:560px;overflow:hidden;background:var(--home-bg);color:var(--home-ink);transition:background .65s,color .4s}
[data-theme=dark] .gateway-home{--home-bg:#101216;--home-ink:#eceef3;--home-muted:#939ead;--home-rule:#2b303a}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.gateway-canvas{position:absolute;inset:0;z-index:-2;opacity:1;transition:opacity 1.15s .82s,filter 1.15s .82s}
.gateway-canvas canvas{display:block;width:100%;height:100%}
.scene-vignette{position:absolute;inset:0;pointer-events:none;z-index:-1;background:linear-gradient(0deg,var(--home-bg),transparent 10%,transparent 90%,color-mix(in srgb,var(--home-bg) 78%,transparent)),radial-gradient(ellipse at 50% 44%,transparent 68%,color-mix(in srgb,var(--home-bg) 42%,transparent) 100%)}
.gateway-header{position:absolute;inset:0 0 auto;display:flex;align-items:center;justify-content:flex-end;padding:22px 3%;z-index:2}
.gateway-tools{display:flex;align-items:center;gap:1px;padding:3px;border:1px solid color-mix(in srgb,var(--home-ink) 8%,transparent);border-radius:999px;background:color-mix(in srgb,var(--home-ink) 6%,transparent);backdrop-filter:blur(16px);opacity:.24;transform:translateY(-3px);transition:opacity 1.6s,transform 1.6s,background .4s}
[data-theme=dark] .gateway-tools{background:#172131;border-color:#223047}
.is-ready .gateway-tools,.gateway-tools:hover,.gateway-tools:focus-within,.is-login .gateway-tools{opacity:1;transform:none}
.gateway-tools .p-button{width:30px;min-width:30px;height:30px;min-height:30px;padding:0;color:var(--home-muted);box-shadow:none}
.gateway-tools .p-button:hover,.gateway-tools .p-button:focus-visible{color:var(--home-ink);background:color-mix(in srgb,var(--home-ink) 10%,transparent)}
.tools-separator{width:1px;height:16px;background:var(--home-rule);margin:0 3px}
.gateway-footer{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:7px;color:var(--home-muted);white-space:nowrap}
.connection-caption{font-size:10px;letter-spacing:.6px}.footer-brand{font-size:9px;opacity:.72}
.is-login .gateway-canvas{opacity:0;filter:blur(8px)}.is-login .gateway-footer{opacity:0;transition:opacity .72s .78s}
.canvas-unavailable{position:absolute;top:48%;left:50%;transform:translate(-50%,-50%);color:var(--home-muted);font-size:13px;text-align:center}
.gateway-auth.p-dialog{width:380px;max-width:calc(100vw - 32px);border:0;background:color-mix(in srgb,var(--surface) 94%,transparent);border-radius:22px;box-shadow:0 30px 110px #131d2910;overflow:hidden}
.gateway-auth .p-dialog-header{position:absolute;right:10px;top:10px;z-index:1;padding:0}.gateway-auth .p-dialog-title{display:none}.gateway-auth .p-dialog-header-actions{margin:0}
.gateway-auth .p-dialog-close-button{width:36px;height:36px;border-radius:8px;box-shadow:none}
.gateway-auth .p-dialog-content{padding:0}
.p-dialog-mask:has(.gateway-auth){background:transparent;backdrop-filter:none}
@keyframes gateway-auth-arrive{0%,52%{opacity:0;transform:translate(40vw,-65vh) scale(.08) rotate(4deg)}62%{opacity:.22;transform:translate(32vw,-50vh) scale(.16) rotate(2.5deg)}100%{opacity:1;transform:none}}
.gateway-auth-animated{animation:gateway-auth-arrive 1.9s linear both!important;transform-origin:86% 0}
.gateway-auth .login-panel{border:0;border-radius:0;padding:40px 34px 30px;background:transparent;box-shadow:none}
.gateway-auth .auth-switch.p-button{width:100%;min-height:34px;margin:3px 0 0;background:transparent;color:var(--home-muted);font-size:11px;box-shadow:none}
.gateway-auth .auth-switch .p-ink{display:none}
.gateway-auth .auth-switch.p-button:hover{background:color-mix(in srgb,var(--home-ink) 5%,transparent)}
.gateway-auth .auth-switch.p-button:focus-visible{outline:2px solid color-mix(in srgb,var(--home-ink) 24%,transparent);outline-offset:2px;background:transparent}
@media(max-width:700px){
 .gateway-home{min-height:540px}.gateway-header{padding:12px}.gateway-tools{gap:0;padding:2px}.tools-separator{height:14px;margin:0 1px}.gateway-tools .p-button{width:27px;min-width:27px;height:27px;min-height:27px}.gateway-tools svg{width:13px;height:13px}
 .gateway-footer{bottom:14px}.connection-caption{font-size:9px}
 .gateway-auth .login-panel{padding:36px 28px 26px}
}
@media(prefers-reduced-motion:reduce){.gateway-tools{opacity:1;transform:none}.gateway-canvas,.gateway-footer{transition:none!important}.gateway-auth-animated{animation:none!important}}
</style>
