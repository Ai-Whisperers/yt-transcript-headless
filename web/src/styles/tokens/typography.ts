/**
 * Typography Design Tokens
 * Web3.0 inspired typography with modern font stacks
 */

export const TypographyTokens = {
  // Font families
  fontFamily: {
    primary: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`,
    mono: `'JetBrains Mono', 'Fira Code', 'Courier New', monospace`,
    display: `'Space Grotesk', 'Inter', sans-serif`
  },

  // Font sizes
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '64px'
  },

  // Font weights
  fontWeight: {
    light: 300,
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800
  },

  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2
  },

  // Letter spacing
  letterSpacing: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.025em',
    wider: '0.05em',
    widest: '0.1em'
  },

  // Text styles (pre-composed combinations)
  textStyles: {
    h1: {
      fontSize: '48px',
      fontWeight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.02em'
    },
    h2: {
      fontSize: '36px',
      fontWeight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.01em'
    },
    h3: {
      fontSize: '30px',
      fontWeight: 600,
      lineHeight: 1.4,
      letterSpacing: '0'
    },
    h4: {
      fontSize: '24px',
      fontWeight: 600,
      lineHeight: 1.5,
      letterSpacing: '0'
    },
    body: {
      fontSize: '16px',
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: '0'
    },
    bodyLarge: {
      fontSize: '18px',
      fontWeight: 400,
      lineHeight: 1.7,
      letterSpacing: '0'
    },
    bodySmall: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.5,
      letterSpacing: '0'
    },
    caption: {
      fontSize: '12px',
      fontWeight: 400,
      lineHeight: 1.4,
      letterSpacing: '0.025em'
    },
    code: {
      fontSize: '14px',
      fontWeight: 400,
      lineHeight: 1.6,
      letterSpacing: '0'
    }
  }
} as const;

export type TypographyToken = typeof TypographyTokens;
