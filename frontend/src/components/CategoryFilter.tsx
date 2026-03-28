import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useCategories } from '../hooks';
import { CategoryTreeNode } from '../types';
import styles from './CategoryFilter.module.css';

interface CategoryFilterProps {
  selectedCategory: string;
  onChange: (category: string) => void;
}

// Recursive node for the dropdown tree with proper ARIA attributes
const TreeNode = React.memo(function TreeNode({
  node,
  depth,
  selectedCategory,
  onSelect,
}: {
  node: CategoryTreeNode;
  depth: number;
  selectedCategory: string;
  onSelect: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.name === selectedCategory;

  return (
    <div className={styles.catTreeNode}>
      <div
        className={`${styles.catTreeRow}${isSelected ? ` ${styles.selected}` : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-selected={isSelected}
        tabIndex={0}
      >
        {hasChildren ? (
          <button
            className={styles.catTreeExpand}
            onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            aria-label={expanded ? t('products.collapse') : t('products.expand')}
            aria-expanded={expanded}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={styles.catTreeLeafIcon} aria-hidden="true">•</span>
        )}
        <button
          className={styles.catTreeLabel}
          onClick={() => onSelect(node.name)}
          aria-selected={isSelected}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && expanded && (
        <div className={styles.catTreeChildren} role="group">
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={{ ...child, children: [] }}
              depth={depth + 1}
              selectedCategory={selectedCategory}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export function CategoryFilter({ selectedCategory, onChange }: CategoryFilterProps) {
  const { t } = useTranslation();
  const { data: tree = [] } = useCategories();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (name: string) => {
    onChange(name);
    setOpen(false);
  };

  const handleClearAll = () => {
    onChange('');
    setOpen(false);
  };

  const displayLabel = selectedCategory || t('products.allCategories');

  return (
    <div className={styles.catTreeFilter} ref={containerRef}>
      <button
        className={`${styles.catTreeTrigger}${selectedCategory ? ` ${styles.hasValue}` : ''}`}
        onClick={() => setOpen(x => !x)}
        type="button"
        aria-expanded={open}
        aria-haspopup="tree"
        aria-label={t('products.filterByCategory')}
      >
        <span className={styles.catTreeTriggerLabel}>{displayLabel}</span>
        <span className={styles.catTreeTriggerArrow} aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className={styles.catTreeDropdown}
          role="tree"
          aria-label={t('products.categories')}
        >
          <div
            className={`${styles.catTreeAllRow}${!selectedCategory ? ` ${styles.selected}` : ''}`}
            onClick={handleClearAll}
            role="treeitem"
            aria-level={1}
            aria-selected={!selectedCategory}
            tabIndex={0}
          >
            {t('products.allCategories')}
          </div>
          <div className={styles.catTreeScroll}>
            {tree.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedCategory={selectedCategory}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
