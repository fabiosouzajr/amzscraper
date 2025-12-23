import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { UserList } from '../types';
import { useTranslation } from 'react-i18next';

interface ListsSidebarProps {
  onListClick?: (listId: number) => void;
  selectedListId?: number | null;
}

export function ListsSidebar({ onListClick, selectedListId }: ListsSidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [lists, setLists] = useState<UserList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    if (user) {
      loadLists();
    }
  }, [user]);

  const loadLists = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getLists();
      setLists(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load lists');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) {
      return;
    }

    try {
      setCreating(true);
      setError(null);
      const newList = await api.createList(newListName.trim());
      setLists([...lists, newList]);
      setNewListName('');
      setShowCreateForm(false);
    } catch (err: any) {
      setError(err.message || 'Failed to create list');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteList = async (listId: number) => {
    if (!confirm(t('lists.confirmDelete'))) {
      return;
    }

    try {
      await api.deleteList(listId);
      setLists(lists.filter(list => list.id !== listId));
      if (selectedListId === listId && onListClick) {
        onListClick(-1); // Clear selection
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete list');
    }
  };

  const handleStartEdit = (list: UserList) => {
    setEditingListId(list.id);
    setEditingName(list.name);
  };

  const handleCancelEdit = () => {
    setEditingListId(null);
    setEditingName('');
  };

  const handleSaveEdit = async (listId: number) => {
    if (!editingName.trim()) {
      return;
    }

    try {
      const updated = await api.updateList(listId, editingName.trim());
      setLists(lists.map(list => list.id === listId ? updated : list));
      setEditingListId(null);
      setEditingName('');
    } catch (err: any) {
      setError(err.message || 'Failed to update list');
    }
  };

  if (!user) {
    return null;
  }

  return (
    <div className="lists-sidebar">
      <div className="lists-sidebar-header">
        <h3>{t('lists.title')}</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="create-list-button"
        >
          {t('lists.create')}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showCreateForm && (
        <form onSubmit={handleCreateList} className="create-list-form">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={t('lists.listNamePlaceholder')}
            disabled={creating}
            autoFocus
          />
          <div className="form-actions">
            <button type="submit" disabled={creating || !newListName.trim()}>
              {t('lists.create')}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                setNewListName('');
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="loading">{t('lists.loading')}</div>
      ) : (
        <div className="lists-list">
          {lists.length === 0 ? (
            <p className="empty-state">{t('lists.noLists')}</p>
          ) : (
            lists.map((list) => (
              <div
                key={list.id}
                className={`list-item ${selectedListId === list.id ? 'selected' : ''}`}
              >
                {editingListId === list.id ? (
                  <div className="list-edit-form">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveEdit(list.id);
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      autoFocus
                    />
                    <div className="list-edit-actions">
                      <button onClick={() => handleSaveEdit(list.id)}>
                        {t('common.save')}
                      </button>
                      <button onClick={handleCancelEdit}>
                        {t('common.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className="list-name"
                      onClick={() => onListClick?.(list.id)}
                    >
                      {list.name}
                    </div>
                    <div className="list-actions">
                      <button
                        onClick={() => handleStartEdit(list)}
                        className="edit-button"
                        title={t('lists.rename')}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteList(list.id)}
                        className="delete-button"
                        title={t('lists.delete')}
                      >
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

