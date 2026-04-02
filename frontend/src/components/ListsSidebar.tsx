import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { UserList } from '../types';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/useMediaQuery';
import styles from './ListsSidebar.module.css';

interface ListsSidebarProps {
  onListClick?: (listId: number | null) => void;
  selectedListId?: number | null;
  onListChange?: () => void; // Callback when lists are created/updated/deleted
  navMode?: boolean; // Inline nav mode: no card wrapper, no sticky positioning
}

export function ListsSidebar({ onListClick, selectedListId, onListChange, navMode = false }: ListsSidebarProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const [isCollapsed, setIsCollapsed] = useState(true);
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
      // Notify parent component that lists have changed
      onListChange?.();
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
        onListClick(null); // Clear selection
      }
      // Notify parent component that lists have changed
      onListChange?.();
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
      // Notify parent component that lists have changed
      onListChange?.();
    } catch (err: any) {
      setError(err.message || 'Failed to update list');
    }
  };

  const handleListClickAndClose = (listId: number | null) => {
    onListClick?.(listId);
    if (isMobile) {
      setIsCollapsed(true);
    }
  };

  if (!user) {
    return null;
  }

  const sidebarContent = (
    <>
      <div className={styles.listsSidebarHeader}>
        <h3>{t('lists.title')}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className={styles.createListButton}
          >
            {t('lists.create')}
          </button>
          {isMobile && (
            <button
              onClick={() => setIsCollapsed(true)}
              className={styles.listsSidebarCloseButton}
              title={t('lists.closeLists')}
              aria-label={t('lists.closeLists')}
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showCreateForm && (
        <form onSubmit={handleCreateList} className={styles.createListForm}>
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder={t('lists.listNamePlaceholder')}
            disabled={creating}
            autoFocus
          />
          <div className={styles.formActions}>
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
        <div className={styles.listsList}>
          {/* All Products option */}
          <div
            className={`${styles.listItem} ${styles.allProductsItem}${selectedListId === null ? ` ${styles.selected}` : ''}`}
            onClick={() => handleListClickAndClose(null)}
          >
            <div className={styles.listName}>
              {t('lists.allProducts')}
            </div>
          </div>

          {lists.length === 0 ? (
            <p className="empty-state">{t('lists.noLists')}</p>
          ) : (
            lists.map((list) => (
              <div
                key={list.id}
                className={`${styles.listItem}${selectedListId === list.id ? ` ${styles.selected}` : ''}`}
              >
                {editingListId === list.id ? (
                  <div className={styles.listEditForm}>
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
                    <div className={styles.listEditActions}>
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
                      className={styles.listName}
                      onClick={() => handleListClickAndClose(list.id)}
                    >
                      {list.name}
                    </div>
                    <div className={styles.listActions}>
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
    </>
  );

  if (isMobile) {
    return (
      <>
        {/* Mobile toggle button */}
        <button
          className={styles.listsSidebarToggle}
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-expanded={!isCollapsed}
          aria-label={t('lists.showLists', { count: lists.length })}
        >
          <span>{t('lists.showLists', { count: lists.length })}</span>
          {isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>

        {/* Mobile overlay */}
        {!isCollapsed && (
          <>
            <div
              className={styles.listsSidebarBackdrop}
              onClick={() => setIsCollapsed(true)}
              aria-hidden="true"
            />
            <div className={`${styles.listsSidebar} ${styles.listsSidebarOverlay}`}>
              {sidebarContent}
            </div>
          </>
        )}
      </>
    );
  }

  // Desktop: render normally (or inline in nav mode)
  return (
    <div className={navMode ? styles.listsSidebarNav : styles.listsSidebar}>
      {sidebarContent}
    </div>
  );
}
