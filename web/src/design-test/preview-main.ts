import { createApp } from 'vue'
import PreviewApp from './PreviewApp.vue'
import { i18n } from '../i18n'
import { installUi } from '../ui/config'
import '../ui/fonts.css'
import '../style.css'
import '../ui/material.css'
import '../ui/motion.css'
import './preview.css'
const app = createApp(PreviewApp)
app.use(i18n)
installUi(app)
app.mount('#app')
