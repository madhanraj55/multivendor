import type { ReactNode } from 'react';
import './StateViews.css';

export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="bb-skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bb-skeleton-card">
          <div className="bb-skeleton bb-skeleton-image" />
          <div className="bb-skeleton-body">
            <div className="bb-skeleton bb-skeleton-line bb-skeleton-vendor-line" />
            <div className="bb-skeleton bb-skeleton-title" />
            <div className="bb-skeleton bb-skeleton-price" />
            <div className="bb-skeleton bb-skeleton-btn" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon = '🛍️',
  title,
  description,
  actionText,
  onAction,
  children,
}: {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="bb-empty-state">
      <div className="bb-empty-icon">{icon}</div>
      <h3 className="bb-empty-title">{title}</h3>
      <p className="bb-empty-desc">{description}</p>
      {actionText && onAction && (
        <button type="button" className="bb-btn bb-btn-primary" onClick={onAction}>
          {actionText}
        </button>
      )}
      {children}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We encountered an error loading this information. Please try again.',
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bb-error-state" role="alert">
      <div className="bb-error-icon">⚠️</div>
      <h3 className="bb-error-title">{title}</h3>
      <p className="bb-error-desc">{description}</p>
      {onRetry && (
        <button type="button" className="bb-btn bb-btn-secondary bb-btn-sm" onClick={onRetry}>
          Try Again
        </button>
      )}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="bb-spinner-container">
      <div className="bb-spinner" role="status" aria-label="Loading..." />
    </div>
  );
}
