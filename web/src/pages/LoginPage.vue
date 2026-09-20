<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import ConnectionScene from '../components/ConnectionScene.vue'
import LoginPanel from '../components/LoginPanel.vue'
const {t:tx} = useI18n()
</script>
<template><main class="public-page login-page"><section class="login-story"><span class="quiet-eyebrow">ONE CONNECTION. MORE POSSIBILITY.</span><h1 tabindex="-1">{{ tx('把灵感，') }}<br><span>{{ tx('连接到可能。') }}</span></h1><ConnectionScene/><span class="login-provider-note">OpenAI · Gemini · Claude · Grok <small>{{ tx('接入规划') }}</small></span></section><div class="login-arrival"><LoginPanel id-prefix="signin"/></div></main></template>
