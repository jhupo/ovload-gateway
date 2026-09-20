import { createApp } from 'vue'
import AssetReview from './AssetReview.vue'
import { i18n } from '../i18n'
import { installUi } from '../ui/config'
import '../ui/fonts.css'
import '../style.css'

const app = createApp(AssetReview)
app.use(i18n)
installUi(app)
app.mount('#app')
