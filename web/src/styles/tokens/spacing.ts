/**
 * Spacing Design Tokens
 * Consistent spacing scale for layout and components
 */

export const SpacingTokens = {
  // Base spacing unit: 4px
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  '2xl': '48px',
  '3xl': '64px',
  '4xl': '96px',
  '5xl': '128px',

  // Component-specific spacing
  component: {
    padding: {
      button: '12px 24px',
      input: '14px 16px',
      card: '24px',
      modal: '32px'
    },
    gap: {
      tight: '8px',
      normal: '16px',
      loose: '24px',
      relaxed: '32px'
    },
    margin: {
      section: '48px',
      element: '16px'
    }
  },

  // Layout spacing
  layout: {
    container: {
      maxWidth: '1400px',
      padding: '24px'
    },
    section: {
      padding: '64px 24px'
    }
  }
} as const;

export type SpacingToken = typeof SpacingTokens;
