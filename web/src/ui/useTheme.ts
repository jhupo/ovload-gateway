import { ref, watch } from 'vue'
const saved = localStorage.getItem('ovload-theme')
const dark = ref(saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches)
watch(dark, value => {
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  localStorage.setItem('ovload-theme', value ? 'dark' : 'light')
}, { immediate: true })
export function useTheme() { return { dark, toggleTheme: () => { dark.value = !dark.value } } }
