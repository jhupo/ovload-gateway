import { i18n } from './i18n'
import { installUi } from './ui/config'
import './ui/fonts.css'
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './ui/motion.css'
import './ui/public.css'
import './style.css'

const app = createApp(App)
app.use(i18n)
app.use(router)
installUi(app)
app.mount('#app')
