/**
 * App Container Component
 * Follows Clean Architecture and Container/Presentational pattern
 * Responsibilities:
 * - Application state management
 * - Business logic
 * - API interactions
 * Delegates all presentation to child components
 */

import { useState, useEffect } from 'react';
import {
  api,
  TranscriptFormat,
  TranscriptResponse,
  ErrorResponse,
  PlaylistResponse,
  HealthResponse
} from './services/api';
import {
  Header,
  Footer,
  ModeToggle,
  TranscriptForm,
  ErrorDisplay,
  TranscriptResult,
  PlaylistResult,
  Loading,
  CursorEffects,
  ScrollProgress
} from './components';

function App() {
  // ========== STATE MANAGEMENT ==========
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

  // ========== INITIALIZATION LOGIC ==========
  useEffect(() => {
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
        setAvailableFormats(Object.values(TranscriptFormat));
        setFormat(TranscriptFormat.JSON);
      }
    };

    initialize();
  }, []);

  // ========== EVENT HANDLERS ==========
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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

  const handleModeChange = (newMode: 'single' | 'playlist'): void => {
    setMode(newMode);
    setUrl('');
    setError(null);
    setResult(null);
    setPlaylistResult(null);
  };

  // ========== UTILITY FUNCTIONS ==========
  const downloadTranscript = (): void => {
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

  const copyToClipboard = (): void => {
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

  // ========== RENDER ==========
  return (
    <>
      <CursorEffects enableCustomCursor={true} enableGlow={true} enableParticles={false} />
      <ScrollProgress enabled={true} />
      <Header health={health} />

      <main className="main">
        <div className="container">
          <div className="input-section">
            <ModeToggle mode={mode} onModeChange={handleModeChange} />

            <TranscriptForm
              mode={mode}
              url={url}
              format={format}
              maxVideos={maxVideos}
              loading={loading}
              availableFormats={availableFormats}
              onUrlChange={setUrl}
              onFormatChange={setFormat}
              onMaxVideosChange={setMaxVideos}
              onSubmit={handleSubmit}
            />

            {loading && <Loading />}

            {error && !loading && <ErrorDisplay error={error} />}
          </div>

          {result && !loading && (
            <TranscriptResult
              result={result}
              onCopy={copyToClipboard}
              onDownload={downloadTranscript}
            />
          )}

          {playlistResult && !loading && (
            <PlaylistResult result={playlistResult} />
          )}
        </div>
      </main>

      <Footer />
    </>
  );
}

export default App;
