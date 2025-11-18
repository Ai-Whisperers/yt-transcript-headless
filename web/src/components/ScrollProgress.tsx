/**
 * Scroll Progress Component
 * Renders a progress bar showing scroll position
 * Follows Clean Architecture: Presentational component
 */

import { useScrollEffects } from '../hooks/useScrollEffects';

interface ScrollProgressProps {
  enabled?: boolean;
  className?: string;
}

export function ScrollProgress({ enabled = true, className }: ScrollProgressProps) {
  const { scrollProgress } = useScrollEffects({
    enableProgressBar: enabled,
    enableReveal: false,
    enableParallax: false,
    enableStickyHeader: false
  });

  if (!enabled) {
    return null;
  }

  return (
    <div className={`scroll-progress ${className || ''}`}>
      <div
        className="scroll-progress-bar"
        style={{ transform: `scaleX(${scrollProgress / 100})` }}
      />
    </div>
  );
}
