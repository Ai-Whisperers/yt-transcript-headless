/**
 * Mode Toggle Component
 * Presentational component for switching between single video and playlist modes
 * Follows Single Responsibility Principle: Only renders mode selection UI
 */

import { APP_TEXT } from '../constants/text';

interface ModeToggleProps {
  mode: 'single' | 'playlist';
  onModeChange: (mode: 'single' | 'playlist') => void;
}

export function ModeToggle({ mode, onModeChange }: ModeToggleProps) {
  return (
    <div className="mode-toggle">
      <button
        className={`button ${mode === 'single' ? '' : 'button-secondary'}`}
        onClick={() => onModeChange('single')}
        type="button"
      >
        {APP_TEXT.MODE_SINGLE}
      </button>
      <button
        className={`button ${mode === 'playlist' ? '' : 'button-secondary'}`}
        onClick={() => onModeChange('playlist')}
        type="button"
      >
        {APP_TEXT.MODE_PLAYLIST}
      </button>
    </div>
  );
}
