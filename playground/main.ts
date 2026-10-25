import '@dskripchenko/ui/styles/all.css'
import '../src/vue/flow.css'
import { createApp } from 'vue'
import App from './App.vue'

const params = new URLSearchParams(location.search)
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light'
createApp(App).mount('#app')
