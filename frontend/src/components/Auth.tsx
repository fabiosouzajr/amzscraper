import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input } from '../design-system';
import styles from './Auth.module.css';

interface AuthProps {
  registrationEnabled?: boolean;
}

export function Auth({ registrationEnabled = true }: AuthProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If registration is disabled, always show login form
  const effectiveIsLogin = !registrationEnabled ? true : isLogin;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match when registering
    if (!effectiveIsLogin && password !== verifyPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      if (effectiveIsLogin) {
        await login(username, password);
      } else {
        await register(username, password);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <Card elevation={2} padding="lg">
          <h2 className={styles.title}>
            {effectiveIsLogin ? t('auth.login') : t('auth.register')}
          </h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <Input
              id="username"
              label={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={3}
              disabled={loading}
              fullWidth
            />
            <Input
              id="password"
              label={t('auth.password')}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              disabled={loading}
              fullWidth
            />
            {!effectiveIsLogin && (
              <Input
                id="verifyPassword"
                label={t('auth.verifyPassword')}
                type="password"
                value={verifyPassword}
                onChange={(e) => setVerifyPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
                fullWidth
              />
            )}
            {error && <div className={styles.errorMessage}>{error}</div>}
            <Button
              type="submit"
              loading={loading}
              fullWidth
              className={styles.submitButton}
            >
              {effectiveIsLogin ? t('auth.login') : t('auth.register')}
            </Button>
          </form>
          {registrationEnabled && (
            <div className={styles.switchRow}>
              <button
                type="button"
                className={styles.linkButton}
                disabled={loading}
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError(null);
                  setPassword('');
                  setVerifyPassword('');
                }}
              >
                {effectiveIsLogin ? t('auth.switchToRegister') : t('auth.switchToLogin')}
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
