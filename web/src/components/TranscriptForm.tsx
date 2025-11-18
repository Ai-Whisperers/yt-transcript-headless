/**
 * Transcript Form Component
 * Presentational component for transcript extraction form
 * Follows Single Responsibility Principle: Only renders form UI
 * Logic handled by container component
 */

import { APP_TEXT } from '../constants/text';
import { TranscriptFormat } from '../services/api';

interface TranscriptFormProps {
  mode: 'single' | 'playlist';
  url: string;
  format: TranscriptFormat;
  maxVideos: number;
  loading: boolean;
  availableFormats: TranscriptFormat[];
  onUrlChange: (url: string) => void;
  onFormatChange: (format: TranscriptFormat) => void;
  onMaxVideosChange: (maxVideos: number) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export function TranscriptForm({
  mode,
  url,
  format,
  maxVideos,
  loading,
  availableFormats,
  onUrlChange,
  onFormatChange,
  onMaxVideosChange,
  onSubmit
}: TranscriptFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <div className="input-group">
        <input
          type="text"
          className="input-field"
          placeholder={
            mode === 'single'
              ? APP_TEXT.PLACEHOLDER_SINGLE_VIDEO
              : APP_TEXT.PLACEHOLDER_PLAYLIST
          }
          value={url}
          onChange={(e) => onUrlChange(e.target.value)}
          disabled={loading}
          required
        />
        <button type="submit" className="button cursor-interactive ripple" disabled={loading}>
          {loading ? APP_TEXT.BUTTON_EXTRACTING : APP_TEXT.BUTTON_EXTRACT}
        </button>
      </div>

      <div className="format-selector">
        <label htmlFor="format">{APP_TEXT.LABEL_FORMAT}</label>
        <select
          id="format"
          value={format}
          onChange={(e) => onFormatChange(e.target.value as TranscriptFormat)}
          disabled={loading}
        >
          {availableFormats.map((fmt) => (
            <option key={fmt} value={fmt}>
              {fmt.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      {mode === 'playlist' && (
        <div className="format-selector">
          <label htmlFor="maxVideos">{APP_TEXT.LABEL_MAX_VIDEOS}</label>
          <input
            type="number"
            id="maxVideos"
            className="input-number"
            min="1"
            max="100"
            value={maxVideos}
            onChange={(e) => onMaxVideosChange(parseInt(e.target.value))}
            disabled={loading}
          />
        </div>
      )}
    </form>
  );
}
