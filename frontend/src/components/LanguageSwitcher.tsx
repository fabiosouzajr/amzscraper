import { useTranslation } from 'react-i18next';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className={styles.languageSwitcher}>
      <select
        value={i18n.language}
        onChange={(e) => changeLanguage(e.target.value)}
        className={styles.languageSelect}
      >
        <option value="en">English</option>
        <option value="pt-BR">Português</option>
      </select>
    </div>
  );
}
