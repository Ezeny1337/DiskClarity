import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const resources = {
  'zh-CN': {
    translation: zhCN
  },
  'en-US': {
    translation: enUS
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en-US',
    fallbackLng: 'en-US',

    interpolation: {
      escapeValue: false
    },

    react: {
      useSuspense: false
    }
  });
