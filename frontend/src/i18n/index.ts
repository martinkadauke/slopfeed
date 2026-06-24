import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import en from './en.json';

export const LANG_KEY = 'slopfeed_lang';

void i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de },
    en: { translation: en },
  },
  lng: 'en', // forced English for now (language switching disabled)
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: string): void {
  localStorage.setItem(LANG_KEY, lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
