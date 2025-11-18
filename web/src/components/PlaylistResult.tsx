/**
 * Playlist Result Component
 * Presentational component for displaying playlist extraction results
 * Follows Single Responsibility Principle: Only renders playlist UI
 */

import { useState } from 'react';
import { APP_TEXT } from '../constants/text';
import { PlaylistResponse, VideoTranscriptResult } from '../services/api';

interface PlaylistResultProps {
  result: PlaylistResponse;
}

export function PlaylistResult({ result }: PlaylistResultProps) {
  const [expandedVideos, setExpandedVideos] = useState<Set<string>>(new Set());

  if (!result.data) {
    return null;
  }

  const toggleVideo = (videoId: string) => {
    const newExpanded = new Set(expandedVideos);
    if (newExpanded.has(videoId)) {
      newExpanded.delete(videoId);
    } else {
      newExpanded.add(videoId);
    }
    setExpandedVideos(newExpanded);
  };

  return (
    <div className="result-section">
      <h2>{APP_TEXT.RESULT_TITLE_PLAYLIST} {result.data.playlistTitle || APP_TEXT.RESULT_UNTITLED_PLAYLIST}</h2>

      <div className="playlist-summary">
        <p>{APP_TEXT.RESULT_PLAYLIST_URL} {result.data.playlistUrl}</p>
        <p>{APP_TEXT.RESULT_EXTRACTED_AT} {result.data.extractedAt && new Date(result.data.extractedAt).toLocaleString()}</p>
        <p>{APP_TEXT.RESULT_TOTAL_VIDEOS} {result.data.totalVideos}</p>
        <p>{APP_TEXT.RESULT_PROCESSED_VIDEOS} {result.data.processedVideos}</p>
        <p>{APP_TEXT.RESULT_SUCCESSFUL} {result.data.successfulExtractions}</p>
        <p>{APP_TEXT.RESULT_FAILED} {result.data.failedExtractions}</p>
      </div>

      <div className="playlist-videos">
        {result.data.results.map((video: VideoTranscriptResult) => (
          <VideoCard
            key={video.videoId}
            video={video}
            expanded={expandedVideos.has(video.videoId)}
            onToggle={() => toggleVideo(video.videoId)}
          />
        ))}
      </div>
    </div>
  );
}

interface VideoCardProps {
  video: VideoTranscriptResult;
  expanded: boolean;
  onToggle: () => void;
}

function VideoCard({ video, expanded, onToggle }: VideoCardProps) {
  return (
    <div className="video-card">
      <div className="video-card-header">
        <div>
          <h4 className="video-card-title">
            {video.videoTitle || APP_TEXT.RESULT_NO_TITLE}
          </h4>
          <p className="video-card-id">{video.videoId}</p>
        </div>
        <span className={`video-card-status ${video.success ? 'success' : 'error'}`}>
          {video.success ? '✓ Success' : '✗ Failed'}
        </span>
      </div>

      {video.success && video.transcript && (
        <>
          <button
            className="button-secondary cursor-interactive ripple"
            onClick={onToggle}
          >
            {expanded ? APP_TEXT.BUTTON_HIDE_TRANSCRIPT : APP_TEXT.BUTTON_VIEW_TRANSCRIPT}
          </button>

          {expanded && (
            <div className="transcript-content">
              {video.transcript.map((segment, index) => (
                <div key={index} className="transcript-segment">
                  <span className="segment-time">{segment.time}</span>
                  <span className="segment-text">{segment.text}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!video.success && video.error && (
        <div className="video-card-error">
          {video.error.message}
        </div>
      )}
    </div>
  );
}
