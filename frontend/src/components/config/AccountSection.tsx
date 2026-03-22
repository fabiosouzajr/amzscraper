import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';

interface Props {
  onUnsavedChangesChange: (hasChanges: boolean) => void;
}

export function AccountSection({ onUnsavedChangesChange }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  useEffect(() => {
    const hasChanges =
      passwordForm.currentPassword !== '' ||
      passwordForm.newPassword !== '' ||
      passwordForm.confirmPassword !== '';
    onUnsavedChangesChange(hasChanges);
  }, [passwordForm, onUnsavedChangesChange]);

  const resetForm = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPasswordSuccess(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError(t('config.passwordMismatch'));
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError(t('config.passwordTooShort'));
      return;
    }

    try {
      setChangingPassword(true);
      await api.changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess(t('config.passwordChanged'));
      resetForm();
      setTimeout(() => setPasswordSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || t('config.failedToChangePassword'));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div id="account" className="config-section">
      <h3>{t('config.account')}</h3>
      {user && (
        <div className="account-info-card">
          <div className="account-info-row">
            <span className="account-info-label">{t('config.username')}</span>
            <span className="account-info-value">{user.username}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">{t('config.role')}</span>
            <span className={`role-badge role-${user.role?.toLowerCase()}`}>{user.role}</span>
          </div>
          <div className="account-info-row">
            <span className="account-info-label">{t('config.memberSince')}</span>
            <span className="account-info-value">
              {new Date(user.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
      <form onSubmit={handleChangePassword} className="password-change-form">
        <div className="form-group">
          <label htmlFor="currentPassword">{t('config.currentPassword')}</label>
          <input
            type="password"
            id="currentPassword"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
            disabled={changingPassword}
          />
        </div>
        <div className="form-group">
          <label htmlFor="newPassword">{t('config.newPassword')}</label>
          <input
            type="password"
            id="newPassword"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
            minLength={6}
            disabled={changingPassword}
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">{t('config.confirmPassword')}</label>
          <input
            type="password"
            id="confirmPassword"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
            minLength={6}
            disabled={changingPassword}
          />
        </div>
        <button type="submit" disabled={changingPassword} className="change-password-button">
          {changingPassword ? t('config.changingPassword') : t('config.changePassword')}
        </button>
        {passwordSuccess && <div className="success-message">{passwordSuccess}</div>}
        {error && <div className="error-message">{error}</div>}
      </form>
    </div>
  );
}

