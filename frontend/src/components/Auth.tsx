import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Button, Card, Input } from '../design-system';
import styles from './Auth.module.css';

export function Auth() {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate passwords match when registering
    if (!isLogin && password !== verifyPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
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
            {isLogin ? t('auth.login') : t('auth.register')}
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
            {!isLogin && (
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
              {isLogin ? t('auth.login') : t('auth.register')}
            </Button>
          </form>
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
              {isLogin ? t('auth.switchToRegister') : t('auth.switchToLogin')}
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
