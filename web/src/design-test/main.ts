import '../ui/fonts.css'
import { createApp } from 'vue'
import DesignTest from './DesignTest.vue'
import { i18n } from '../i18n'
import { installUi } from '../ui/config'
import '../style.css'
import './gallery.css'
import '../ui/material.css'
import '../ui/motion.css'
const app = createApp(DesignTest)
app.use(i18n)
installUi(app)
app.mount('#app')
