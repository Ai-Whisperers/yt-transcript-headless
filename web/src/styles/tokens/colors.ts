/**
 * Color Design Tokens
 * Web3.0 inspired dark palette with steel gradients
 * Follows hexagonal architecture: Pure design constants with zero dependencies
 */

export const ColorTokens = {
  // Steel gradient base colors
  steel: {
    900: '#0a0e14',
    800: '#121820',
    700: '#1a222d',
    600: '#232d3d',
    500: '#2d3a4d',
    400: '#3f5166',
    300: '#556b85',
    200: '#7589a3',
    100: '#a0b3cc',
    50: '#cdd7e5'
  },

  // Accent colors for interactions
  accent: {
    primary: '#64b5f6',
    primaryDark: '#2196f3',
    secondary: '#81c784',
    tertiary: '#ba68c8',
    warning: '#ffb74d',
    error: '#ef5350',
    success: '#66bb6a'
  },

  // Glass overlay colors (with alpha)
  glass: {
    overlay: 'rgba(18, 24, 32, 0.4)',
    border: 'rgba(117, 137, 163, 0.15)',
    highlight: 'rgba(100, 181, 246, 0.05)',
    shadow: 'rgba(10, 14, 20, 0.6)'
  },

  // Semantic colors
  semantic: {
    background: '#0a0e14',
    surface: '#121820',
    surfaceElevated: '#1a222d',
    border: 'rgba(117, 137, 163, 0.15)',
    text: {
      primary: '#e8eef5',
      secondary: '#a0b3cc',
      tertiary: '#7589a3',
      disabled: '#556b85'
    }
  },

  // Gradient definitions
  gradients: {
    steel: 'linear-gradient(135deg, #1a222d 0%, #0a0e14 100%)',
    steelReverse: 'linear-gradient(135deg, #0a0e14 0%, #1a222d 100%)',
    accent: 'linear-gradient(135deg, #2196f3 0%, #64b5f6 100%)',
    shimmer: 'linear-gradient(90deg, transparent 0%, rgba(100, 181, 246, 0.1) 50%, transparent 100%)',
    radial: 'radial-gradient(circle at 50% 50%, #232d3d 0%, #0a0e14 100%)',
    mesh: `
      radial-gradient(at 40% 20%, rgba(33, 150, 243, 0.15) 0px, transparent 50%),
      radial-gradient(at 80% 0%, rgba(129, 199, 132, 0.1) 0px, transparent 50%),
      radial-gradient(at 0% 50%, rgba(186, 104, 200, 0.1) 0px, transparent 50%)
    `
  }
} as const;

export type ColorToken = typeof ColorTokens;
