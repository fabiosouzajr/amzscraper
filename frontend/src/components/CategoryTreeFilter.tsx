import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import { CategoryTreeNode } from '../types';

interface CategoryTreeFilterProps {
  selectedCategory: string;
  onChange: (category: string) => void;
}

// Recursive node for the dropdown tree
function TreeNode({
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
    <div className="cat-tree-node">
      <div
        className={`cat-tree-row${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
      >
        {hasChildren ? (
          <button
            className="cat-tree-expand"
            onClick={(e) => { e.stopPropagation(); setExpanded(x => !x); }}
            aria-label={expanded ? 'collapse' : 'expand'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        ) : (
          <span className="cat-tree-leaf-icon">•</span>
        )}
        <button
          className="cat-tree-label"
          onClick={() => onSelect(node.name)}
        >
          {node.name}
        </button>
      </div>
      {hasChildren && expanded && (
        <div className="cat-tree-children">
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
}

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
    <div className="cat-tree-filter" ref={containerRef}>
      <button
        className={`cat-tree-trigger${selectedCategory ? ' has-value' : ''}`}
        onClick={() => setOpen(x => !x)}
        type="button"
      >
        <span className="cat-tree-trigger-label">{displayLabel}</span>
        <span className="cat-tree-trigger-arrow">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="cat-tree-dropdown">
          <div
            className={`cat-tree-all-row${!selectedCategory ? ' selected' : ''}`}
            onClick={handleClearAll}
          >
            {t('products.allCategories')}
          </div>
          <div className="cat-tree-scroll">
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
