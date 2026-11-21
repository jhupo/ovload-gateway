import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import enChannelGroups from './locales/en-channel-groups.json'
import enGatewayCodex from './locales/en-gateway-codex.json'
import enGatewayModels from './locales/en-gateway-models.json'
import enGatewayProfiles from './locales/en-gateway-profiles.json'
import enRetailPricing from './locales/en-retail-pricing.json'
import enUpstreamAccounts from './locales/en-upstream-accounts.json'
import en from './locales/en.json'
import zhChannelGroups from './locales/zh-channel-groups.json'
import zhGatewayCodex from './locales/zh-gateway-codex.json'
import zhGatewayModels from './locales/zh-gateway-models.json'
import zhGatewayProfiles from './locales/zh-gateway-profiles.json'
import zhRetailPricing from './locales/zh-retail-pricing.json'
import zhUpstreamAccounts from './locales/zh-upstream-accounts.json'
import zh from './locales/zh.json'

const resources = {
  en: {
    translation: {
      ...en,
      upstreamAccounts: enUpstreamAccounts,
      channelGroups: enChannelGroups,
    },
    retailPricing: enRetailPricing,
    gatewayCodex: enGatewayCodex,
    gatewayProfiles: enGatewayProfiles,
    gatewayModels: enGatewayModels,
  },
  zh: {
    translation: {
      ...zh,
      upstreamAccounts: zhUpstreamAccounts,
      channelGroups: zhChannelGroups,
    },
    retailPricing: zhRetailPricing,
    gatewayCodex: zhGatewayCodex,
    gatewayProfiles: zhGatewayProfiles,
    gatewayModels: zhGatewayModels,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  })

export default i18n
