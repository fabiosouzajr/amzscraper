import React from 'react';
import { ChevronRight as ChevronRightIcon } from 'lucide-react';
import styles from './Table.module.css';

export type TableSize = 'sm' | 'md' | 'lg';
export type TableVariant = 'default' | 'striped' | 'bordered';

export interface TableColumn<T> {
  /**
   * Column key (used for data access)
   */
  key: string;

  /**
   * Column header text
   */
  header: React.ReactNode;

  /**
   * Render function for cell content
   */
  render?: (row: T, index: number) => React.ReactNode;

  /**
   * Cell alignment
   */
  align?: 'left' | 'center' | 'right';

  /**
   * Whether column is sortable
   */
  sortable?: boolean;

  /**
   * Current sort direction ('asc' | 'desc' | null)
   */
  sortDirection?: 'asc' | 'desc' | null;

  /**
   * Callback when column header is clicked
   */
  onSort?: () => void;

  /**
   * Custom className for this column
   */
  className?: string;

  /**
   * Width of column
   */
  width?: string;
}

export interface TableProps<T> {
  /**
   * Table data
   */
  data: T[];

  /**
   * Column definitions
   */
  columns: TableColumn<T>[];

  /**
   * Table variant
   */
  variant?: TableVariant;

  /**
   * Table size
   */
  size?: TableSize;

  /**
   * Optional row key extractor
   */
  rowKey?: (row: T, index: number) => string;

  /**
   * Optional row click handler
   */
  onRowClick?: (row: T, index: number) => void;

  /**
   * Optional custom row className
   */
  getRowClassName?: (row: T, index: number) => string;

  /**
   * Whether to show empty state
   */
  showEmptyState?: boolean;

  /**
   * Empty state message
   */
  emptyMessage?: string;

  /**
   * Custom className
   */
  className?: string;

  /**
   * Whether table is loading
   */
  loading?: boolean;
}

export const Table = <T extends Record<string, unknown>>({
  data,
  columns,
  variant = 'default',
  size = 'md',
  rowKey,
  onRowClick,
  getRowClassName,
  showEmptyState = true,
  emptyMessage = 'No data available',
  className = '',
  loading = false,
}: TableProps<T>) => {
  const getRowKeyFn = rowKey
    ? rowKey
    : (row: T, index: number) => `${index}-${JSON.stringify(row)}`;

  if (loading) {
    return (
      <div className={`${styles.tableWrapper} ${styles[variant]} ${className}`}>
        <div className={styles.loadingState}>
          <div className={styles.loadingSpinner} />
        </div>
      </div>
    );
  }

  if (data.length === 0 && showEmptyState) {
    return (
      <div className={`${styles.tableWrapper} ${styles[variant]} ${className}`}>
        <div className={styles.emptyState}>{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className={`${styles.tableWrapper} ${styles[variant]} ${className}`}>
      {/* Desktop Table */}
      <div className={styles.desktopTable}>
        <table className={`${styles.table} ${styles[size]}`}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`${styles.th} ${column.align ? styles[column.align] : ''} ${
                    column.className || ''
                  }`}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className={styles.sortButton}
                      onClick={column.onSort}
                      aria-sort={
                        column.sortDirection === 'asc'
                          ? 'ascending'
                          : column.sortDirection === 'desc'
                            ? 'descending'
                            : 'none'
                      }
                    >
                      <span className={styles.thContent}>{column.header}</span>
                      {column.sortDirection && (
                        <span className={styles.sortIndicator}>
                          {column.sortDirection === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className={styles.thContent}>{column.header}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => {
              const key = getRowKeyFn(row, rowIndex);
              const rowClassName = getRowClassName?.(row, rowIndex) || '';
              const isClickable = onRowClick !== undefined;

              return (
                <tr
                  key={key}
                  className={`${styles.tr} ${isClickable ? styles.clickable : ''} ${rowClassName}`}
                  onClick={isClickable ? () => onRowClick!(row, rowIndex) : undefined}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${styles.td} ${column.align ? styles[column.align] : ''} ${
                        column.className || ''
                      }`}
                    >
                      {column.render
                        ? column.render(row, rowIndex)
                        : String(row[column.key] ?? '')}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className={styles.mobileCards}>
        {data.map((row, rowIndex) => {
          const key = getRowKeyFn(row, rowIndex);
          const rowClassName = getRowClassName?.(row, rowIndex) || '';
          const isClickable = onRowClick !== undefined;

          return (
            <div
              key={key}
              className={`${styles.card} ${isClickable ? styles.clickable : ''} ${rowClassName}`}
              onClick={isClickable ? () => onRowClick!(row, rowIndex) : undefined}
            >
              {columns.map((column) => (
                <div
                  key={column.key}
                  className={`${styles.cardRow} ${column.align ? styles[column.align] : ''}`}
                >
                  <span className={styles.cardLabel}>{column.header}</span>
                  <span className={styles.cardValue}>
                    {column.render
                      ? column.render(row, rowIndex)
                      : String(row[column.key] ?? '')}
                  </span>
                  {isClickable && (
                    <ChevronRightIcon size={16} className={styles.cardArrow} />
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};
