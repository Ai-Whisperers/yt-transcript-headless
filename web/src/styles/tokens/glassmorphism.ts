/**
 * Glassmorphism Design Tokens
 * Web3.0 inspired glass effects with backdrop blur and transparency
 */

export const GlassmorphismTokens = {
  // Glass card variants
  cards: {
    primary: {
      background: 'rgba(26, 34, 45, 0.4)',
      backdropBlur: 'blur(20px)',
      border: '1px solid rgba(117, 137, 163, 0.15)',
      borderRadius: '16px',
      boxShadow: `
        0 8px 32px 0 rgba(10, 14, 20, 0.4),
        inset 0 1px 0 0 rgba(117, 137, 163, 0.1)
      `
    },
    elevated: {
      background: 'rgba(35, 45, 61, 0.5)',
      backdropBlur: 'blur(24px)',
      border: '1px solid rgba(117, 137, 163, 0.2)',
      borderRadius: '20px',
      boxShadow: `
        0 12px 48px 0 rgba(10, 14, 20, 0.6),
        inset 0 1px 0 0 rgba(117, 137, 163, 0.15)
      `
    },
    subtle: {
      background: 'rgba(18, 24, 32, 0.3)',
      backdropBlur: 'blur(16px)',
      border: '1px solid rgba(117, 137, 163, 0.1)',
      borderRadius: '12px',
      boxShadow: `
        0 4px 16px 0 rgba(10, 14, 20, 0.3),
        inset 0 1px 0 0 rgba(117, 137, 163, 0.05)
      `
    }
  },

  // Glass overlay for modals/dialogs
  overlay: {
    background: 'rgba(10, 14, 20, 0.8)',
    backdropBlur: 'blur(12px)'
  },

  // Hover states
  hover: {
    border: 'rgba(100, 181, 246, 0.3)',
    background: 'rgba(26, 34, 45, 0.6)',
    glow: '0 0 20px rgba(100, 181, 246, 0.2)'
  },

  // Active/pressed states
  active: {
    border: 'rgba(100, 181, 246, 0.5)',
    background: 'rgba(35, 45, 61, 0.7)',
    glow: '0 0 24px rgba(100, 181, 246, 0.3)'
  },

  // Frosted glass variants
  frosted: {
    light: {
      background: 'rgba(160, 179, 204, 0.1)',
      backdropBlur: 'blur(10px)',
      saturation: 'saturate(150%)'
    },
    medium: {
      background: 'rgba(117, 137, 163, 0.15)',
      backdropBlur: 'blur(16px)',
      saturation: 'saturate(180%)'
    },
    heavy: {
      background: 'rgba(85, 107, 133, 0.2)',
      backdropBlur: 'blur(24px)',
      saturation: 'saturate(200%)'
    }
  }
} as const;

export type GlassmorphismToken = typeof GlassmorphismTokens;
