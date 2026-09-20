import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from './zh-CN.json'
import en from './en.json'
const saved = localStorage.getItem('ovload-locale')
export const i18n = createI18n({
  legacy: false,
  locale: saved === 'en' ? 'en' : 'zh-CN',
  fallbackLocale: false,
  messages: { 'zh-CN': zh, en },
  // Phrase keys are resolved literally, including punctuation in sample copy.
  messageResolver: (messages, path) => (messages as Record<string, string>)[path] ?? null,
})

watch(i18n.global.locale, value => { document.documentElement.lang = value; localStorage.setItem('ovload-locale', value) }, {immediate:true})
