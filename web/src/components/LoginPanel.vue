<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Button from 'primevue/button'
import { ArrowRight, LockKeyhole } from '@lucide/vue'
const {t:tx} = useI18n()
const email = ref('')
const password = ref('')
const confirmation = ref('')
const mode = ref<'login' | 'register'>('login')
const isRegister = computed(() => mode.value === 'register')
defineProps<{idPrefix:string}>()
</script>
<template>
  <section class="login-panel" :aria-labelledby="idPrefix+'-title'">
    <span class="login-emblem"><LockKeyhole :size="21" :stroke-width="1.5"/></span>
    <h2 :id="idPrefix+'-title'">{{ tx(isRegister ? '注册' : '登录') }}</h2>
    <form @submit.prevent>
      <div class="login-field"><label :for="idPrefix+'-email'">{{ tx('邮箱') }}</label><InputText :id="idPrefix+'-email'" v-model="email" type="email" autocomplete="username" placeholder="you@example.com" fluid/></div>
      <div class="login-field"><label :for="idPrefix+'-password'">{{ tx('密码') }}</label><Password :input-id="idPrefix+'-password'" v-model="password" autocomplete="current-password" :feedback="false" toggle-mask fluid/></div>
      <div v-if="isRegister" class="login-field"><label :for="idPrefix+'-confirmation'">{{ tx('确认密码') }}</label><Password :input-id="idPrefix+'-confirmation'" v-model="confirmation" autocomplete="new-password" :feedback="false" :toggle-mask="false" fluid/></div>
      <Button type="submit" class="sweep-button" disabled fluid :aria-describedby="idPrefix+'-status'"><span>{{ tx(isRegister ? '注册' : '登录') }}</span><ArrowRight :size="17"/></Button>
      <small :id="idPrefix+'-status'" class="login-status">{{ tx('功能暂未开放') }}</small>
      <Button type="button" class="auth-switch" text severity="secondary" @click="mode=isRegister?'login':'register'">{{ tx(isRegister ? '已有账号，登录' : '没有账号，注册') }}</Button>
    </form>
  </section>
</template>
