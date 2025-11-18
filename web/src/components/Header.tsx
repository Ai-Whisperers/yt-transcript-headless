/**
 * Header Component
 * Presentational component for application header
 * Follows Single Responsibility Principle: Only renders header UI
 */

import { APP_TEXT } from '../constants/text';
import { HealthResponse } from '../services/api';
import { useScrollEffects } from '../hooks/useScrollEffects';

interface HeaderProps {
  health: HealthResponse | null;
}

export function Header({ health }: HeaderProps) {
  const { isScrolled } = useScrollEffects({
    enableReveal: false,
    enableParallax: false,
    enableProgressBar: false,
    enableStickyHeader: true
  });

  return (
    <header className={`header ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="container">
        <h1>{APP_TEXT.TITLE}</h1>
        {health && (
          <div className="health-indicator">
            {health.status === 'healthy' ? (
              <span className="health-status-healthy">{APP_TEXT.STATUS_HEALTHY}</span>
            ) : (
              <span className="health-status-unhealthy">{APP_TEXT.STATUS_UNHEALTHY}</span>
            )}
            <span className="health-details">
              {APP_TEXT.STATUS_UPTIME}: {Math.floor(health.uptime)}s |{' '}
              {APP_TEXT.STATUS_MEMORY}: {health.memory?.usagePercent?.toFixed(1) || 0}%
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
