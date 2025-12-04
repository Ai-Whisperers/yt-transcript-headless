import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  TranscriptFormat,
  TranscriptRequest,
  TranscriptResponse,
  ErrorResponse as TranscriptErrorResponse,
  TranscriptSegment,
} from '../domain/TranscriptSegment';
import {
  PlaylistRequest,
  PlaylistResponse,
  VideoTranscriptResult,
} from '../domain/PlaylistTypes';
import { BatchRequest, BatchResponse, BatchVideoResult } from '../domain/BatchTypes';

type ExtractionResult = TranscriptResponse | TranscriptErrorResponse;

type MenuAction = '1' | '2' | '3' | '4' | '5' | 'x';

const rawBaseUrl = process.env.CLI_API_URL || process.env.API_URL || 'http://localhost:3000/api';
const API_BASE_URL = rawBaseUrl.endsWith('/') ? rawBaseUrl : `${rawBaseUrl}/`;

const rl = createInterface({ input, output });

async function main() {
  console.log('YouTube Transcript CLI');
  console.log('=======================');
  console.log(`API base URL: ${API_BASE_URL}`);

  let exitRequested = false;

  while (!exitRequested) {
    console.log('\nSelect an action:');
    console.log('  [1] Extract single video transcript');
    console.log('  [2] Extract playlist/channel transcripts');
    console.log('  [3] Extract batch transcripts (URLs list)');
    console.log('  [4] Check API health & metrics');
    console.log('  [5] List supported formats');
    console.log('  [x] Exit');

    const choice = (await rl.question('Choice: ')).trim().toLowerCase() as MenuAction;

    try {
      switch (choice) {
        case '1':
          await handleSingleVideo();
          break;
        case '2':
          await handlePlaylist();
          break;
        case '3':
          await handleBatch();
          break;
        case '4':
          await handleHealthCheck();
          break;
        case '5':
          await handleFormats();
          break;
        case 'x':
          exitRequested = true;
          break;
        default:
          console.log('Invalid selection. Please choose a valid option.');
      }
    } catch (error: any) {
      console.error(`\n[CLI ERROR] ${error.message || error}`);
    }
  }

  rl.close();
  console.log('Goodbye!');
}

async function handleSingleVideo() {
  console.log('\nSingle video extraction');

  const url = await promptRequired('YouTube video URL: ');
  const formatInput = (await rl.question('Format (json|srt|text) [json]: ')).trim().toLowerCase();
  const format = parseFormat(formatInput);

  const payload: TranscriptRequest = { url, format };
  const result = await post<ExtractionResult>('transcribe', payload);

  if (!result.success) {
    printError(result);
    return;
  }

  printTranscript(result.data.transcript);
  await maybeSaveTranscript(format, result.data);
}

async function handlePlaylist() {
  console.log('\nPlaylist/Channel extraction');
  console.log('Supported formats:');
  console.log('  - Playlist: https://youtube.com/playlist?list=...');
  console.log('  - Channel: https://youtube.com/@username');
  console.log('  - Channel: https://youtube.com/channel/UCxxx');
  console.log('  - Channel: https://youtube.com/c/ChannelName');
  console.log('');

  const url = await promptRequired('Playlist or Channel URL: ');
  const formatInput = (await rl.question('Format (json|srt|text) [json]: ')).trim().toLowerCase();
  const format = parseFormat(formatInput);
  const maxVideosInput = (await rl.question('Max videos to process [press Enter for default]: ')).trim();
  const maxVideos = maxVideosInput ? Number(maxVideosInput) : undefined;

  if (maxVideos !== undefined && (Number.isNaN(maxVideos) || maxVideos <= 0)) {
    console.log('Invalid max videos value. The service default will be used.');
  }

  const payload: PlaylistRequest = {
    url,
    format,
    maxVideos: Number.isFinite(maxVideos || NaN) ? maxVideos : undefined,
  };

  const result = await post<PlaylistResponse>('transcribe/playlist', payload);

  if (!result.success || !result.data) {
    printError(result);
    return;
  }

  printPlaylistSummary(result.data.results);
  await maybeSaveJson('playlist-results.json', result.data);
}

async function handleBatch() {
  console.log('\nBatch extraction');
  console.log('Enter one URL per line. Submit an empty line to finish.');

  const urls: string[] = [];
  while (true) {
    const value = (await rl.question(`URL ${urls.length + 1}: `)).trim();
    if (!value) break;
    urls.push(value);
  }

  if (urls.length === 0) {
    console.log('No URLs provided. Batch cancelled.');
    return;
  }

  const formatInput = (await rl.question('Format (json|srt|text) [json]: ')).trim().toLowerCase();
  const format = parseFormat(formatInput);

  const payload: BatchRequest = {
    urls,
    format,
  };

  const result = await post<BatchResponse>('transcribe/batch', payload);

  if (!result.success || !result.data) {
    printError(result);
    return;
  }

  printBatchSummary(result.data.results);
  await maybeSaveJson('batch-results.json', result.data);
}

async function handleHealthCheck() {
  console.log('\nAPI health');

  const health = await get<any>('health');
  console.log(JSON.stringify(health, null, 2));

  const metricsResponse = await get<{ success: boolean; data?: Record<string, unknown> }>('metrics');
  if (metricsResponse.success && metricsResponse.data) {
    console.log('\nMetrics snapshot:');
    console.log(JSON.stringify(metricsResponse.data, null, 2));
  } else {
    console.log('\nMetrics unavailable.');
  }
}

async function handleFormats() {
  const response = await get<{ success: boolean; data?: { formats: TranscriptFormat[]; default: TranscriptFormat } }>('formats');
  if (!response.success || !response.data) {
    printError(response as TranscriptErrorResponse);
    return;
  }

  console.log('\nSupported formats:');
  response.data.formats.forEach(format => console.log(` - ${format}`));
  console.log(`Default format: ${response.data.default}`);
}

async function promptRequired(message: string): Promise<string> {
  while (true) {
    const value = (await rl.question(message)).trim();
    if (value) {
      return value;
    }
    console.log('Value is required. Please try again.');
  }
}

function parseFormat(value: string): TranscriptFormat {
  if (value && Object.values(TranscriptFormat).includes(value as TranscriptFormat)) {
    return value as TranscriptFormat;
  }

  if (value) {
    console.log(`Unknown format "${value}". Defaulting to json.`);
  }

  return TranscriptFormat.JSON;
}

async function post<T>(endpoint: string, body: unknown): Promise<T> {
  return request<T>('POST', endpoint, body);
}

async function get<T>(endpoint: string): Promise<T> {
  return request<T>('GET', endpoint);
}

async function request<T>(method: 'GET' | 'POST', endpoint: string, body?: unknown): Promise<T> {
  const url = new URL(endpoint.replace(/^\/+/, ''), API_BASE_URL).toString();
  const correlationId = randomUUID();

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-ID': correlationId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload: any = text ? safeJsonParse(text) : undefined;

  if (!response.ok) {
    const message = payload?.error?.message || response.statusText || 'Unknown error';
    const code = payload?.error?.code || response.status;
    throw new Error(`[${code}] ${message}`);
  }

  return payload as T;
}

function safeJsonParse(payload: string) {
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function printTranscript(segments: TranscriptSegment[]) {
  console.log(`\nExtracted ${segments.length} segments:`);
  segments.slice(0, 5).forEach((segment, index) => {
    console.log(`  ${index + 1}. [${segment.time}] ${segment.text}`);
  });

  if (segments.length > 5) {
    console.log(`  ...and ${segments.length - 5} more segments.`);
  }
}

function printPlaylistSummary(results: VideoTranscriptResult[]) {
  console.log(`\nProcessed ${results.length} videos.`);
  const successful = results.filter(video => video.success);
  console.log(`Successful: ${successful.length} · Failed: ${results.length - successful.length}`);

  successful.slice(0, 5).forEach((video, index) => {
    console.log(`  ${index + 1}. ${video.videoTitle || video.videoId} (${video.videoUrl})`);
  });
}

function printBatchSummary(results: BatchVideoResult[]) {
  console.log(`\nProcessed ${results.length} URLs.`);
  const successful = results.filter(result => result.success);
  console.log(`Successful: ${successful.length} · Failed: ${results.length - successful.length}`);
}

async function maybeSaveTranscript(format: TranscriptFormat, data: TranscriptResponse['data']) {
  const shouldSave = await wantsToSave();
  if (!shouldSave) return;

  let contents: string;
  let extension: string;

  switch (format) {
    case TranscriptFormat.SRT:
      contents = data.srt || '';
      extension = 'srt';
      break;
    case TranscriptFormat.TEXT:
      contents = data.text || '';
      extension = 'txt';
      break;
    default:
      contents = JSON.stringify(data.transcript, null, 2);
      extension = 'json';
  }

  const defaultName = `transcript-${Date.now()}.${extension}`;
  await saveToFile(defaultName, contents);
}

async function maybeSaveJson(fileName: string, payload: unknown) {
  const shouldSave = await wantsToSave();
  if (!shouldSave) return;

  await saveToFile(fileName, JSON.stringify(payload, null, 2));
}

async function wantsToSave(): Promise<boolean> {
  const answer = (await rl.question('Save output to file? (y/N): ')).trim().toLowerCase();
  return answer === 'y' || answer === 'yes';
}

async function saveToFile(defaultName: string, contents: string) {
  if (!contents) {
    console.log('No output available to save.');
    return;
  }

  const providedPath = (await rl.question(`File path [${defaultName}]: `)).trim();
  const destination = path.resolve(process.cwd(), providedPath || defaultName);
  await fs.writeFile(destination, contents, 'utf8');
  console.log(`Saved to ${destination}`);
}

function printError(response: TranscriptErrorResponse | { error?: { message?: string; code?: string } }) {
  const message = response.error?.message || 'Unknown error';
  const code = response.error?.code || 'ERROR';
  console.error(`\n[${code}] ${message}`);
}

main().catch(error => {
  console.error(error);
  rl.close();
  process.exitCode = 1;
});
