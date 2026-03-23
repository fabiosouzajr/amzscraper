import React, { useState, useRef, useEffect, Children, isValidElement, ReactElement } from 'react';
import styles from './Tabs.module.css';

export interface TabProps {
  /**
   * Tab identifier
   */
  value: string;

  /**
   * Tab label text
   */
  label: React.ReactNode;

  /**
   * Optional icon
   */
  icon?: React.ReactNode;

  /**
   * Whether the tab is disabled
   */
  disabled?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export interface TabsProps {
  /**
   * Currently selected tab value
   */
  value: string;

  /**
   * Callback when tab changes
   */
  onChange: (value: string) => void;

  /**
   * Tab children
   */
  children: React.ReactNode;

  /**
   * Variant style
   */
  variant?: 'default' | 'underlined' | 'pills';

  /**
   * Size
   */
  size?: 'sm' | 'md' | 'lg';

  /**
   * Whether tabs are full width
   */
  fullWidth?: boolean;

  /**
   * Custom className
   */
  className?: string;
}

export interface TabPanelProps {
  /**
   * Panel identifier (must match tab value)
   */
  value: string;

  /**
   * Panel content
   */
  children: React.ReactNode;

  /**
   * Custom className
   */
  className?: string;
}

/* ========================================
   TAB COMPONENT
   ======================================== */

export const Tab: React.FC<TabProps> = ({
  value,
  label,
  icon,
  disabled = false,
  className = '',
}) => {
  return (
    <button
      type="button"
      role="tab"
      data-value={value}
      disabled={disabled}
      className={`${styles.tab} ${disabled ? styles.disabled : ''} ${className}`}
    >
      {icon && <span className={styles.tabIcon}>{icon}</span>}
      <span className={styles.tabLabel}>{label}</span>
    </button>
  );
};

/* ========================================
   TAB PANEL COMPONENT
   ======================================== */

export const TabPanel: React.FC<TabPanelProps> = ({
  value,
  children,
  className = '',
}) => {
  return (
    <div
      role="tabpanel"
      data-value={value}
      className={`${styles.panel} ${className}`}
    >
      {children}
    </div>
  );
};

/* ========================================
   TABS COMPONENT
   ======================================== */

export const Tabs: React.FC<TabsProps> = ({
  value,
  onChange,
  children,
  variant = 'underlined',
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const [activeTab, setActiveTab] = useState(value);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});

  // Update active tab when value prop changes
  useEffect(() => {
    setActiveTab(value);
  }, [value]);

  // Update indicator position
  useEffect(() => {
    if (variant === 'underlined' && tabsRef.current) {
      const activeButton = tabsRef.current.querySelector<HTMLButtonElement>(
        `button[data-value="${activeTab}"]:not(:disabled)`
      );
      if (activeButton) {
        const rect = activeButton.getBoundingClientRect();
        const containerRect = tabsRef.current.getBoundingClientRect();
        setIndicatorStyle({
          left: rect.left - containerRect.left,
          width: rect.width,
        });
      }
    }
  }, [activeTab, variant]);

  const tabs = Children.toArray(children).filter(
    (child): child is ReactElement<TabProps> => isValidElement(child) && child.type === Tab
  );

  const panels = Children.toArray(children).filter(
    (child): child is ReactElement<TabPanelProps> =>
      isValidElement(child) && child.type === TabPanel
  );

  const handleTabClick = (tabValue: string) => {
    setActiveTab(tabValue);
    onChange(tabValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (tabs.length === 0) return;

    const currentIndex = tabs.findIndex(
      (tab) => (tab as ReactElement<TabProps>).props.value === activeTab
    );

    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex] as ReactElement<TabProps>;
    handleTabClick(nextTab.props.value);
  };

  return (
    <div className={`${styles.tabs} ${className}`}>
      <div
        ref={tabsRef}
        className={`${styles.tabList} ${styles[variant]} ${styles[size]} ${
          fullWidth ? styles.fullWidth : ''
        }`}
        role="tablist"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => {
          const tabProps = (tab as ReactElement<TabProps>).props;
          return (
            <Tab
              key={tabProps.value}
              {...tabProps}
              disabled={tabProps.disabled}
            />
          );
        })}

        {variant === 'underlined' && (
          <div className={styles.indicator} style={indicatorStyle} />
        )}
      </div>

      <div className={styles.panels}>
        {panels.map((panel) => {
          const panelProps = (panel as ReactElement<TabPanelProps>).props;
          const isActive = panelProps.value === activeTab;
          return (
            <div
              key={panelProps.value}
              className={`${styles.panelWrapper} ${
                isActive ? styles.active : styles.hidden
              }`}
            >
              {isActive && <TabPanel {...panelProps} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/* ========================================
   SIMPLE TABS (imperative API)
   ======================================== */

export interface SimpleTabsProps {
  tabs: Array<{ value: string; label: string; icon?: React.ReactNode; disabled?: boolean }>;
  value: string;
  onChange: (value: string) => void;
  variant?: 'default' | 'underlined' | 'pills';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  className?: string;
}

export const SimpleTabs: React.FC<SimpleTabsProps> = ({
  tabs,
  value,
  onChange,
  variant = 'underlined',
  size = 'md',
  fullWidth = false,
  className = '',
}) => {
  const [indicatorStyle, setIndicatorStyle] = React.useState<React.CSSProperties>({});
  const tabsListRef = useRef<HTMLDivElement>(null);

  // Update indicator position
  useEffect(() => {
    if (variant === 'underlined' && tabsListRef.current) {
      const activeButton = tabsListRef.current.querySelector<HTMLButtonElement>(
        `button[data-value="${value}"]:not(:disabled)`
      );
      if (activeButton) {
        const rect = activeButton.getBoundingClientRect();
        const containerRect = tabsListRef.current.getBoundingClientRect();
        setIndicatorStyle({
          left: rect.left - containerRect.left,
          width: rect.width,
        });
      }
    }
  }, [value, variant, tabs]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex((tab) => tab.value === value);
    if (currentIndex === -1) return;

    let nextIndex = currentIndex;

    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab.disabled) {
      onChange(nextTab.value);
    }
  };

  return (
    <div className={`${styles.tabList} ${styles[variant]} ${styles[size]} ${
      fullWidth ? styles.fullWidth : ''
    } ${className}`} role="tablist" onKeyDown={handleKeyDown} ref={tabsListRef}>
      {tabs.map((tab) => (
        <Tab key={tab.value} value={tab.value} label={tab.label} icon={tab.icon} disabled={tab.disabled} />
      ))}

      {variant === 'underlined' && (
        <div className={styles.indicator} style={indicatorStyle} />
      )}
    </div>
  );
};
