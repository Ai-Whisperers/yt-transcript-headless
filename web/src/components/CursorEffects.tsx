/**
 * Cursor Effects Component
 * Renders custom cursor elements with glow and trail effects
 * Follows Clean Architecture: Presentational component
 */

import { useCursorEffects } from '../hooks/useCursorEffects';
import type { CursorEffectConfig } from '../types';

interface CursorEffectsProps extends Partial<CursorEffectConfig> {
  // Extends CursorEffectConfig for type consistency
}

export function CursorEffects({
  enableCustomCursor = true,
  enableGlow = true,
  enableParticles = false
}: CursorEffectsProps) {
  const {
    isHovering,
    isClicking,
    cursorDotRef,
    cursorRingRef,
    cursorGlowRef
  } = useCursorEffects({
    enableCustomCursor,
    enableGlow,
    enableParticles
  });

  if (!enableCustomCursor) {
    return null;
  }

  return (
    <>
      <div
        className={`custom-cursor ${isHovering ? 'cursor-hover' : ''} ${isClicking ? 'cursor-click' : ''}`}
      >
        <div ref={cursorDotRef} className="cursor-dot" />
        <div ref={cursorRingRef} className="cursor-ring" />
      </div>
      {enableGlow && <div ref={cursorGlowRef} className="cursor-glow" />}
    </>
  );
}
