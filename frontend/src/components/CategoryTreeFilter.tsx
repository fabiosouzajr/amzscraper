import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { CategoryTreeNode } from '../types';
import styles from './CategoryTreeFilter.module.css';

interface CategoryTreeFilterProps {
  selectedCategory: string;
  onChange: (category: string) => void;
}

// Recursive node for the dropdown tree
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
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = node.name === selectedCategory;

  return (
    <div className={styles.catTreeNode}>
      <div
        className={`${styles.catTreeRow}${isSelected ? ` ${styles.selected}` : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      >
        {hasChildren ? (
          <button
            className={styles.catTreeExpand}
            onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className={styles.catTreeLeafIcon}>•</span>
        )}
        <button
          className={styles.catTreeLabel}
          onClick={() => onSelect(node.name)}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && expanded && (
        <div className={styles.catTreeChildren}>
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

export function CategoryTreeFilter({ selectedCategory, onChange }: CategoryTreeFilterProps) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<CategoryTreeNode[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getCategoryTree().then(setTree).catch(console.error);
  }, []);

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
      >
        <span className={styles.catTreeTriggerLabel}>{displayLabel}</span>
        <span className={styles.catTreeTriggerArrow}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.catTreeDropdown}>
          <div
            className={`${styles.catTreeAllRow}${!selectedCategory ? ` ${styles.selected}` : ''}`}
            onClick={handleClearAll}
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
