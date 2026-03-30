import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { adminApi } from '../../services/api';
import type { User } from '../../types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Modal, Button, Input, Badge, EmptyState } from '../../design-system';
import styles from './UserManagement.module.css';
import tableStyles from './AdminTable.module.css';

export function UserManagement() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  const [resetPassword, setResetPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, [debouncedSearch]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getUsers(50, 0, debouncedSearch || undefined);
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminApi.createUser(newUser.username, newUser.password, 'USER');
      setNewUser({ username: '', password: '' });
      setShowCreateModal(false);
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };

  const handleDisableUser = async (userId: number) => {
    if (!confirm(t('admin.users.confirmDisable'))) return;
    try {
      await adminApi.disableUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Failed to disable user:', error);
    }
  };

  const handleEnableUser = async (userId: number) => {
    try {
      await adminApi.enableUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Failed to enable user:', error);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    if (!confirm(t('admin.users.confirmResetPassword'))) return;
    try {
      await adminApi.resetPassword(selectedUser.id, resetPassword);
      setResetPassword('');
      setShowStatsModal(false);
      setSelectedUser(null);
      alert(t('admin.users.passwordReset'));
    } catch (error) {
      console.error('Failed to reset password:', error);
    }
  };

  const handleViewStats = async (user: User) => {
    try {
      const stats = await adminApi.getUserStats(user.id);
      setSelectedUser({ ...user, stats });
      setShowStatsModal(true);
    } catch (error) {
      console.error('Failed to load user stats:', error);
    }
  };

  return (
    <div className={styles.userManagement}>
      <div className={styles.userManagementHeader}>
        <h2>{t('admin.users.title')}</h2>
        <Button onClick={() => setShowCreateModal(true)} variant="primary">
          {t('admin.users.createUser')}
        </Button>
      </div>

      <div className={styles.searchBox}>
        <input
          type="text"
          placeholder={t('admin.users.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">{t('admin.users.loading')}</div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={debouncedSearch ? t('admin.users.noUsersMatchSearch') : t('admin.users.noUsersFound')}
          description={debouncedSearch ? t('admin.users.noUsersMatchSearchHint') : undefined}
        />
      ) : (
        <div className={tableStyles.tableWrapper}>
          <table className={tableStyles.adminTable}>
          <thead>
            <tr>
              <th>{t('admin.users.username')}</th>
              <th>{t('admin.users.role')}</th>
              <th>{t('admin.users.status')}</th>
              <th>{t('admin.users.products')}</th>
              <th>{t('admin.users.lists')}</th>
              <th>{t('admin.users.priceHistory')}</th>
              <th>{t('admin.users.createdAt')}</th>
              <th>{t('admin.users.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td data-label={t('admin.users.username')}>{user.username}</td>
                <td data-label={t('admin.users.role')}>
                  <Badge variant={user.role === 'ADMIN' ? 'info' : 'neutral'}>
                    {user.role}
                  </Badge>
                </td>
                <td data-label={t('admin.users.status')}>
                  <Badge variant={user.is_disabled ? 'danger' : 'success'}>
                    {user.is_disabled ? t('admin.users.disabled') : t('admin.users.active')}
                  </Badge>
                </td>
                <td data-label={t('admin.users.products')}>{user.product_count || 0}</td>
                <td data-label={t('admin.users.lists')}>{user.list_count || 0}</td>
                <td data-label={t('admin.users.priceHistory')}>{user.price_history_count || 0}</td>
                <td data-label={t('admin.users.createdAt')}>{new Date(user.created_at).toLocaleDateString()}</td>
                <td data-label={t('admin.users.actions')}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleViewStats(user)}
                  >
                    {t('admin.users.viewStats')}
                  </Button>
                  {user.is_disabled ? (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleEnableUser(user.id)}
                    >
                      {t('admin.users.enable')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleDisableUser(user.id)}
                    >
                      {t('admin.users.disable')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      )}

      {/* Create User Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('admin.users.createUser')}
        size="md"
      >
        <form onSubmit={handleCreateUser}>
          <div className={styles.formGroup}>
            <label>{t('auth.username')}</label>
            <Input
              type="text"
              required
              minLength={3}
              value={newUser.username}
              onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
            />
          </div>
          <div className={styles.formGroup}>
            <label>{t('admin.users.newPassword')}</label>
            <Input
              type="password"
              required
              minLength={6}
              placeholder={t('admin.users.passwordPlaceholder')}
              value={newUser.password}
              onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            />
          </div>
          <div className={styles.modalActions}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCreateModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary">
              {t('common.save')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* User Stats Modal */}
      <Modal
        isOpen={showStatsModal && selectedUser !== null}
        onClose={() => setShowStatsModal(false)}
        title={t('admin.users.userStats', { username: selectedUser?.username || '' })}
        size="md"
      >
        {selectedUser && selectedUser.stats && (
          <>
            <div className={styles.userStatsGrid}>
              <div className={styles.statCard}>
                <h4>{t('admin.users.products')}</h4>
                <p className={styles.statValue}>{selectedUser.stats.product_count}</p>
              </div>
              <div className={styles.statCard}>
                <h4>{t('admin.users.lists')}</h4>
                <p className={styles.statValue}>{selectedUser.stats.list_count}</p>
              </div>
              <div className={styles.statCard}>
                <h4>{t('admin.users.priceHistory')}</h4>
                <p className={styles.statValue}>{selectedUser.stats.price_history_count}</p>
              </div>
            </div>
            <div className={styles.userActions}>
              <div className={styles.formGroup}>
                <label>{t('admin.users.newPassword')}</label>
                <Input
                  type="password"
                  minLength={6}
                  placeholder={t('admin.users.passwordPlaceholder')}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <form onSubmit={handleResetPassword}>
                <div className={styles.modalActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowStatsModal(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" variant="primary">
                    {t('common.save')}
                  </Button>
                </div>
              </form>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
