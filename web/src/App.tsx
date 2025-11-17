import { useState, useEffect } from 'react';
import {
  api,
  TranscriptFormat,
  TranscriptResponse,
  TranscriptSegment,
  ErrorResponse,
  PlaylistResponse,
  HealthResponse
} from './services/api';
import { getErrorMessage } from './utils/errorMessages';

function App() {
  // Mode state
  const [mode, setMode] = useState<'single' | 'playlist'>('single');

  // Form state
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<TranscriptFormat>(TranscriptFormat.JSON);
  const [availableFormats, setAvailableFormats] = useState<TranscriptFormat[]>([]);
  const [maxVideos, setMaxVideos] = useState(10);

  // UI state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscriptResponse | null>(null);
  const [playlistResult, setPlaylistResult] = useState<PlaylistResponse | null>(null);
  const [error, setError] = useState<ErrorResponse['error'] | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    // Initialize on mount: check health and load formats
    const initialize = async () => {
      try {
        const [healthData, formatsData] = await Promise.all([
          api.checkHealth(),
          api.getFormats()
        ]);

        setHealth(healthData);
        setAvailableFormats(formatsData.formats);
        setFormat(formatsData.default);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        // Set fallback formats if API fails
        setAvailableFormats(Object.values(TranscriptFormat));
        setFormat(TranscriptFormat.JSON);
      }
    };

    initialize();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // NO client-side validation - backend validates
    setLoading(true);
    setError(null);
    setResult(null);
    setPlaylistResult(null);

    if (mode === 'single') {
      const response = await api.extractTranscript({ url, format });

      if (response.success) {
        setResult(response);
      } else {
        setError(response.error);
      }
    } else {
      const response = await api.extractPlaylist({ url, format, maxVideos });

      if (response.success) {
        setPlaylistResult(response);
      } else if (response.error) {
        setError(response.error);
      }
    }

    setLoading(false);
  };

  const downloadTranscript = () => {
    if (!result) return;

    let content = '';
    let filename = '';
    let mimeType = '';

    switch (result.data.format) {
      case TranscriptFormat.SRT:
        content = result.data.srt || '';
        filename = 'transcript.srt';
        mimeType = 'text/srt';
        break;
      case TranscriptFormat.TEXT:
        content = result.data.text || '';
        filename = 'transcript.txt';
        mimeType = 'text/plain';
        break;
      default:
        content = JSON.stringify(result.data.transcript, null, 2);
        filename = 'transcript.json';
        mimeType = 'application/json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadVideoTranscript = (videoResult: any) => {
    if (!videoResult.transcript) return;

    const content = JSON.stringify(videoResult.transcript, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${videoResult.videoId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (!result) return;

    let content = '';
    if (result.data.format === TranscriptFormat.SRT) {
      content = result.data.srt || '';
    } else if (result.data.format === TranscriptFormat.TEXT) {
      content = result.data.text || '';
    } else {
      content = JSON.stringify(result.data.transcript, null, 2);
    }

    navigator.clipboard.writeText(content);
  };

  const formatTranscript = (transcript: TranscriptSegment[]): string => {
    return transcript.map(seg => `${seg.time} ${seg.text}`).join('\n');
  };

  return (
    <>
      <header className="header">
        <div className="container">
          <h1>YouTube Transcript Extractor</h1>
          {health && (
            <div className="health-indicator" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
              {health.status === 'healthy' ? (
                <span style={{ color: '#10b981' }}>✓ API Healthy</span>
              ) : (
                <span style={{ color: '#ef4444' }}>✗ API Unhealthy</span>
              )}
              {health.queue && (
                <span style={{ marginLeft: '1rem', color: '#6b7280' }}>
                  Queue: {health.queue.active} active, {health.queue.pending} pending
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="input-section">
            {/* Mode Toggle */}
            <div className="mode-toggle" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`button ${mode === 'single' ? '' : 'button-secondary'}`}
                onClick={() => setMode('single')}
                style={{ flex: 1 }}
              >
                Single Video
              </button>
              <button
                type="button"
                className={`button ${mode === 'playlist' ? '' : 'button-secondary'}`}
                onClick={() => setMode('playlist')}
                style={{ flex: 1 }}
              >
                Playlist
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input
                  type="url"
                  className="input-field"
                  placeholder={
                    mode === 'single'
                      ? 'Enter YouTube URL (e.g., https://www.youtube.com/watch?v=...)'
                      : 'Enter YouTube Playlist URL (e.g., https://www.youtube.com/playlist?list=...)'
                  }
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={loading}
                />
                <button type="submit" className="button" disabled={loading}>
                  {loading ? 'Extracting...' : 'Extract'}
                </button>
              </div>

              <div className="format-selector">
                <label htmlFor="format">Output Format:</label>
                <select
                  id="format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as TranscriptFormat)}
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
                  <label htmlFor="maxVideos">Max Videos (1-100):</label>
                  <input
                    type="number"
                    id="maxVideos"
                    min="1"
                    max="100"
                    value={maxVideos}
                    onChange={(e) => setMaxVideos(parseInt(e.target.value) || 10)}
                    disabled={loading}
                    style={{
                      padding: '0.5rem',
                      borderRadius: '0.375rem',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              )}
            </form>

            {loading && (
              <div className="loading">
                <span className="spinner"></span>
                <span>
                  {mode === 'playlist'
                    ? 'Extracting playlist transcripts... This may take several minutes.'
                    : 'Extracting transcript... This may take a few moments.'}
                </span>
              </div>
            )}

            {error && (
              <div className="error">
                {(() => {
                  const errorInfo = getErrorMessage(error.code);
                  return (
                    <>
                      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{errorInfo.title}</h3>
                      <p style={{ margin: '0.5rem 0' }}>{errorInfo.message}</p>
                      {errorInfo.suggestion && (
                        <p style={{ margin: '0.5rem 0', fontStyle: 'italic' }}>💡 {errorInfo.suggestion}</p>
                      )}
                      {error.correlationId && (
                        <p style={{ margin: '0.5rem 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                          Reference ID: <code>{error.correlationId}</code>
                        </p>
                      )}
                      {error.timestamp && (
                        <p style={{ margin: '0.5rem 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                          Occurred at: {new Date(error.timestamp).toLocaleString()}
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {health === null && !loading && (
              <div className="error">
                API service is not available. Please ensure the backend is running.
              </div>
            )}
          </div>

          {/* Single Video Result */}
          {result && mode === 'single' && (
            <div className="result-section">
              <div className="result-header">
                <h2>Transcript Extracted</h2>
                <div className="action-buttons">
                  <button className="button-secondary" onClick={copyToClipboard}>
                    Copy to Clipboard
                  </button>
                  <button className="button-secondary" onClick={downloadTranscript}>
                    Download
                  </button>
                </div>
              </div>

              <div className="transcript-content">
                {result.data.format === TranscriptFormat.JSON ? (
                  result.data.transcript.map((segment, index) => (
                    <div key={index} className="transcript-segment">
                      <span className="segment-time">{segment.time}</span>
                      <span className="segment-text">{segment.text}</span>
                    </div>
                  ))
                ) : (
                  <pre>
                    {result.data.format === TranscriptFormat.SRT
                      ? result.data.srt
                      : result.data.format === TranscriptFormat.TEXT
                      ? result.data.text
                      : formatTranscript(result.data.transcript)}
                  </pre>
                )}
              </div>

              <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                <p>Video: {result.data.videoUrl}</p>
                <p>Extracted at: {new Date(result.data.extractedAt).toLocaleString()}</p>
                <p>Total segments: {result.data.transcript.length}</p>
              </div>
            </div>
          )}

          {/* Playlist Result */}
          {playlistResult && playlistResult.success && mode === 'playlist' && (
            <div className="result-section">
              <h2>Playlist: {playlistResult.data?.playlistTitle || 'Untitled Playlist'}</h2>

              <div
                className="playlist-stats"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '1rem',
                  marginTop: '1rem',
                  marginBottom: '1.5rem'
                }}
              >
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.375rem' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{playlistResult.data?.totalVideos}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Total Videos</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f3f4f6', borderRadius: '0.375rem' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{playlistResult.data?.processedVideos}</div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Processed</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#dcfce7', borderRadius: '0.375rem' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#16a34a' }}>
                    {playlistResult.data?.successfulExtractions}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Successful</div>
                </div>
                <div style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fee2e2', borderRadius: '0.375rem' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#dc2626' }}>
                    {playlistResult.data?.failedExtractions}
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>Failed</div>
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f3f4f6', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>Video</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>Status</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>Segments</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid #e5e7eb' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {playlistResult.data?.results.map((video) => (
                    <tr key={video.videoId} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '0.75rem' }}>
                        <a
                          href={video.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: '#3b82f6', textDecoration: 'none' }}
                        >
                          {video.videoTitle || video.videoId}
                        </a>
                      </td>
                      <td style={{ padding: '0.75rem' }}>
                        {video.success ? (
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#dcfce7',
                              color: '#16a34a',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem'
                            }}
                          >
                            Success
                          </span>
                        ) : (
                          <span
                            style={{
                              padding: '0.25rem 0.5rem',
                              backgroundColor: '#fee2e2',
                              color: '#dc2626',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem'
                            }}
                          >
                            {video.error?.code || 'Failed'}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem' }}>{video.transcript?.length || 0}</td>
                      <td style={{ padding: '0.75rem' }}>
                        {video.success && (
                          <button
                            className="button-secondary"
                            onClick={() => downloadVideoTranscript(video)}
                            style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
                          >
                            Download
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                <p>Playlist URL: {playlistResult.data?.playlistUrl}</p>
                <p>Extracted at: {playlistResult.data?.extractedAt && new Date(playlistResult.data.extractedAt).toLocaleString()}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">YouTube Transcript Extractor - AI Whisperers</div>
        </div>
      </footer>
    </>
  );
}

export default App;
