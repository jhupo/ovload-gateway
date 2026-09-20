import { watch } from 'vue'
import { i18n } from '../i18n'
import { zh_CN } from 'primelocale/js/zh_CN.js'
import { en } from 'primelocale/js/en.js'
import type { App } from 'vue'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const Ovload = definePreset(Aura, {
  semantic: {
    primary: { 50: '#f4f3ff', 100: '#eeedff', 200: '#d9d6ff', 300: '#bbb5ff', 400: '#a29cff', 500: '#7c72ff', 600: '#635bff', 700: '#5148eb', 800: '#4338ca', 900: '#3730a3', 950: '#211b60' },
    colorScheme: {
      light: { primary: { color: '{primary.600}', inverseColor: '#ffffff', hoverColor: '{primary.700}', activeColor: '{primary.800}' } },
      dark: { primary: { color: '{primary.400}', inverseColor: '#101216', hoverColor: '{primary.300}', activeColor: '{primary.200}' }, surface: { 0: '#ffffff', 50: '#eceef3', 100: '#d9dde5', 200: '#c0c7d2', 300: '#abb3c0', 400: '#9aa3b2', 500: '#747f90', 600: '#535e70', 700: '#384150', 800: '#2b303a', 900: '#181b21', 950: '#101216' } },
    },
  },
})

/** Shared library setup used by the lab and future product screens. */
export function installUi(app: App) {
  app.use(PrimeVue, { theme: { preset: Ovload, options: { darkModeSelector: '[data-theme="dark"]' } }, ripple: true })
  watch(i18n.global.locale, value => { app.config.globalProperties.$primevue.config.locale = { ...app.config.globalProperties.$primevue.config.locale, ...(value === 'en' ? en : zh_CN) } }, { immediate: true })
  app.use(ToastService)
  app.use(ConfirmationService)
  app.directive('tooltip', Tooltip)
}
