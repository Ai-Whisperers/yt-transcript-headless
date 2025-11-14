import { useState, useEffect } from 'react';
import { api, TranscriptFormat, TranscriptResponse, ErrorResponse, TranscriptSegment } from './services/api';

function App() {
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<TranscriptFormat>(TranscriptFormat.JSON);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TranscriptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    // Check API health on mount
    api.checkHealth().then(setApiHealthy);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const response = await api.extractTranscript({ url, format });

    if (response.success) {
      setResult(response);
    } else {
      setError(response.error.message);
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
        </div>
      </header>

      <main className="main">
        <div className="container">
          <div className="input-section">
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <input
                  type="url"
                  className="input-field"
                  placeholder="Enter YouTube URL (e.g., https://www.youtube.com/watch?v=...)"
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
                  <option value={TranscriptFormat.JSON}>JSON</option>
                  <option value={TranscriptFormat.SRT}>SRT</option>
                  <option value={TranscriptFormat.TEXT}>Plain Text</option>
                </select>
              </div>
            </form>

            {loading && (
              <div className="loading">
                <span className="spinner"></span>
                <span>Extracting transcript... This may take a few moments.</span>
              </div>
            )}

            {error && (
              <div className="error">
                Error: {error}
              </div>
            )}

            {apiHealthy === false && (
              <div className="error">
                API service is not available. Please ensure the backend is running.
              </div>
            )}
          </div>

          {result && (
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
                  <pre>{
                    result.data.format === TranscriptFormat.SRT
                      ? result.data.srt
                      : result.data.format === TranscriptFormat.TEXT
                      ? result.data.text
                      : formatTranscript(result.data.transcript)
                  }</pre>
                )}
              </div>

              <div style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                <p>Video: {result.data.videoUrl}</p>
                <p>Extracted at: {new Date(result.data.extractedAt).toLocaleString()}</p>
                <p>Total segments: {result.data.transcript.length}</p>
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            YouTube Transcript Extractor - AI Whisperers
          </div>
        </div>
      </footer>
    </>
  );
}

export default App;