import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import ta from './locales/ta.json';

// To add a new language:
// 1. Create a new JSON file in ./locales/ (e.g., hi.json for Hindi)
// 2. Copy en.json and translate all values
// 3. Import it here and add to resources + supportedLngs
const resources = {
  en: { translation: en },
  ta: { translation: ta }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: ['en', 'ta'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage']
    },
    interpolation: {
      escapeValue: false
    },
    returnNull: false,
    returnEmptyString: false
  });

export default i18n;
