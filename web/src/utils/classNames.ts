/**
 * Class Name Utilities
 * Helper functions for managing CSS class names
 * Follows functional programming principles
 */

/**
 * Conditionally join class names together
 * Filters out falsy values
 */
export function classNames(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Generate glass effect class name
 */
export function glassClassName(variant: 'primary' | 'elevated' | 'subtle' = 'primary', hover = false): string {
  const base = `glass-${variant}`;
  return hover ? `${base} glass-hover` : base;
}

/**
 * Generate interactive element class names
 */
export function interactiveClassName(options: {
  ripple?: boolean;
  magnetic?: boolean;
  interactive?: boolean;
} = {}): string {
  const { ripple = true, magnetic = false, interactive = true } = options;

  return classNames(
    interactive && 'cursor-interactive',
    ripple && 'ripple',
    magnetic && 'magnetic'
  );
}

/**
 * Generate scroll reveal class name
 */
export function scrollRevealClassName(direction: 'up' | 'down' | 'left' | 'right' | 'scale' = 'up'): string {
  if (direction === 'up') return 'scroll-reveal';
  return `scroll-reveal-${direction}`;
}

/**
 * Generate animation class name
 */
export function animationClassName(name: string, duration?: string): string {
  const base = `animate-${name}`;
  return duration ? `${base} animation-${duration}` : base;
}
