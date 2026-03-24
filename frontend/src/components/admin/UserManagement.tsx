import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/api';
import type { User } from '../../types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';

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
    <div className="user-management">
      <div className="user-management-header">
        <h2>{t('admin.users.title')}</h2>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          {t('admin.users.createUser')}
        </button>
      </div>

      <div className="search-box">
        <input
          type="text"
          placeholder={t('admin.users.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">{t('admin.users.loading')}</div>
      ) : (
        <table className="admin-table">
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
            {users.length === 0 ? (
              <tr>
                <td colSpan={8}>{t('admin.users.noUsersFound')}</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>
                    <span className={`role-badge role-${user.role?.toLowerCase()}`}>
                      {user.role}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${user.is_disabled ? 'disabled' : 'active'}`}>
                      {user.is_disabled ? t('admin.users.disabled') : t('admin.users.active')}
                    </span>
                  </td>
                  <td>{user.product_count || 0}</td>
                  <td>{user.list_count || 0}</td>
                  <td>{user.price_history_count || 0}</td>
                  <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-small"
                      onClick={() => handleViewStats(user)}
                    >
                      {t('admin.users.viewStats')}
                    </button>
                    {user.is_disabled ? (
                      <button
                        className="btn btn-small btn-success"
                        onClick={() => handleEnableUser(user.id)}
                      >
                        {t('admin.users.enable')}
                      </button>
                    ) : (
                      <button
                        className="btn btn-small btn-danger"
                        onClick={() => handleDisableUser(user.id)}
                      >
                        {t('admin.users.disable')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="modal" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t('admin.users.createUser')}</h3>
            <form onSubmit={handleCreateUser}>
              <div className="form-group">
                <label>{t('auth.username')}</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>{t('admin.users.newPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder={t('admin.users.passwordPlaceholder')}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
              </div>
              <div className="modal-actions">
                <button type="button" onClick={() => setShowCreateModal(false)}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary">
                  {t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User Stats Modal */}
      {showStatsModal && selectedUser && (
        <div className="modal" onClick={() => setShowStatsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>{t('admin.users.userStats', { username: selectedUser.username })}</h3>
            {selectedUser.stats && (
              <div className="user-stats-grid">
                <div className="stat-card">
                  <h4>{t('admin.users.products')}</h4>
                  <p className="stat-value">{selectedUser.stats.product_count}</p>
                </div>
                <div className="stat-card">
                  <h4>{t('admin.users.lists')}</h4>
                  <p className="stat-value">{selectedUser.stats.list_count}</p>
                </div>
                <div className="stat-card">
                  <h4>{t('admin.users.priceHistory')}</h4>
                  <p className="stat-value">{selectedUser.stats.price_history_count}</p>
                </div>
              </div>
            )}
            <div className="user-actions">
              <div className="form-group">
                <label>{t('admin.users.newPassword')}</label>
                <input
                  type="password"
                  minLength={6}
                  placeholder={t('admin.users.passwordPlaceholder')}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                />
              </div>
              <form onSubmit={handleResetPassword}>
                <div className="modal-actions">
                  <button type="button" onClick={() => setShowStatsModal(false)}>
                    {t('common.cancel')}
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {t('common.save')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
