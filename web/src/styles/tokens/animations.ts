/**
 * Animation Design Tokens
 * Smooth, performant animations for Web3.0 aesthetics
 */

export const AnimationTokens = {
  // Durations
  duration: {
    instant: '100ms',
    fast: '200ms',
    normal: '300ms',
    slow: '400ms',
    slower: '600ms',
    slowest: '1000ms'
  },

  // Easing functions
  easing: {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
  },

  // Common transitions
  transition: {
    default: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    fast: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
    slow: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1)',
    transform: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    opacity: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1)',
    colors: 'background-color 300ms cubic-bezier(0.4, 0, 0.2, 1), border-color 300ms cubic-bezier(0.4, 0, 0.2, 1), color 300ms cubic-bezier(0.4, 0, 0.2, 1)'
  },

  // Keyframe animation names
  keyframes: {
    fadeIn: 'fadeIn',
    fadeOut: 'fadeOut',
    slideUp: 'slideUp',
    slideDown: 'slideDown',
    scaleIn: 'scaleIn',
    shimmer: 'shimmer',
    float: 'float',
    glow: 'glow',
    spin: 'spin',
    pulse: 'pulse'
  }
} as const;

export type AnimationToken = typeof AnimationTokens;
