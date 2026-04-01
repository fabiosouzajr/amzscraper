import { useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import styles from './SetupWizard.module.css';

interface SetupWizardProps {
  onSetupComplete: (token: string) => void;
}

export default function SetupWizard({ onSetupComplete }: SetupWizardProps) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError(t('setup.passwordMismatch'));
      return;
    }

    setLoading(true);
    try {
      const result = await api.setupAdmin(username, password);
      onSetupComplete(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>{t('setup.title')}</h1>
        <p className={styles.subtitle}>{t('setup.subtitle')}</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="setup-username" className={styles.label}>
              {t('setup.username')}
            </label>
            <input
              id="setup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              minLength={3}
              maxLength={30}
              required
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="setup-password" className={styles.label}>
              {t('setup.password')}
            </label>
            <input
              id="setup-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="setup-confirm" className={styles.label}>
              {t('setup.confirmPassword')}
            </label>
            <input
              id="setup-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={styles.input}
              minLength={6}
              required
              autoComplete="new-password"
            />
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}

          <button
            type="submit"
            className={styles.button}
            disabled={loading || !username || !password || !confirmPassword}
          >
            {loading ? t('setup.creating') : t('setup.createAdmin')}
          </button>
        </form>
      </div>
    </div>
  );
}
