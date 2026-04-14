import React from 'react';
import styles from './Card.module.css';

export type CardElevation = 0 | 1 | 2;
export type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps {
  children: React.ReactNode;
  elevation?: CardElevation;
  padding?: CardPadding;
  className?: string;
  onClick?: () => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({
  children,
  elevation = 1,
  padding = 'md',
  className = '',
  onClick,
  header,
  footer,
}) => {
  const hasClick = onClick !== undefined;
  const elevationClass = styles[`elevation${elevation}`];
  const paddingClass = styles[`padding${padding.charAt(0).toUpperCase() + padding.slice(1)}`];

  return (
    <div
      className={`${styles.card} ${elevationClass} ${paddingClass} ${
        hasClick ? styles.clickable : ''
      } ${className}`}
      onClick={onClick}
    >
      {header && <div className={styles.header}>{header}</div>}
      <div className={styles.content}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </div>
  );
};
