/**
 * Transcript Result Component
 * Presentational component for displaying single video transcript results
 * Follows Single Responsibility Principle: Only renders result UI
 */

import { APP_TEXT } from '../constants/text';
import { TranscriptResponse } from '../services/api';

interface TranscriptResultProps {
  result: TranscriptResponse;
  onCopy: () => void;
  onDownload: () => void;
}

export function TranscriptResult({ result, onCopy, onDownload }: TranscriptResultProps) {
  return (
    <div className="result-section">
      <div className="result-header">
        <h2>{APP_TEXT.RESULT_TITLE_SINGLE}</h2>
        <div className="action-buttons">
          <button className="button-secondary" onClick={onCopy}>
            {APP_TEXT.BUTTON_COPY}
          </button>
          <button className="button-secondary" onClick={onDownload}>
            {APP_TEXT.BUTTON_DOWNLOAD}
          </button>
        </div>
      </div>

      <div className="transcript-content">
        {result.data.transcript.map((segment, index) => (
          <div key={index} className="transcript-segment">
            <span className="segment-time">{segment.time}</span>
            <span className="segment-text">{segment.text}</span>
          </div>
        ))}
      </div>

      <div className="result-metadata">
        <p>{APP_TEXT.RESULT_VIDEO} {result.data.videoUrl}</p>
        <p>{APP_TEXT.RESULT_EXTRACTED_AT} {new Date(result.data.extractedAt).toLocaleString()}</p>
        <p>{APP_TEXT.RESULT_TOTAL_SEGMENTS} {result.data.transcript.length}</p>
      </div>
    </div>
  );
}
