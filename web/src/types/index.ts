/**
 * Type Exports and Re-exports
 * Centralized type definitions for design system and API
 * Follows hexagonal architecture: Pure type definitions layer
 */

// Re-export all API types for convenience
export type {
  TranscriptSegment,
  TranscriptRequest,
  TranscriptResponse,
  ErrorResponse,
  PlaylistRequest,
  VideoTranscriptResult,
  PlaylistResponse,
  HealthResponse,
  BrowserHealthResponse,
  MetricsResponse
} from '../services/api';

export { TranscriptFormat } from '../services/api';

// Re-export design token types
export type {
  ColorToken,
  GlassmorphismToken,
  SpacingToken,
  TypographyToken,
  AnimationToken
} from '../styles/tokens';

// Component-specific types
export interface BaseComponentProps {
  className?: string;
  children?: React.ReactNode;
}

export interface InteractiveComponentProps extends BaseComponentProps {
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  onHover?: (event: React.MouseEvent<HTMLElement>) => void;
  disabled?: boolean;
}

// Scroll effect types
export interface ScrollRevealConfig {
  threshold?: number;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale';
}

// Cursor effect types
export interface CursorEffectConfig {
  enableCustomCursor?: boolean;
  enableGlow?: boolean;
  enableRipple?: boolean;
  enableMagnetic?: boolean;
  enableParticles?: boolean;
  magneticStrength?: number;
}

// Glass effect types
export type GlassVariant = 'primary' | 'elevated' | 'subtle';

export interface GlassComponentProps extends BaseComponentProps {
  variant?: GlassVariant;
  hover?: boolean;
}

// Animation types
export type AnimationDuration = 'fast' | 'normal' | 'slow' | 'slower';
export type AnimationEasing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'spring' | 'bounce';

export interface AnimationConfig {
  duration?: AnimationDuration;
  easing?: AnimationEasing;
  delay?: number;
}
