# YouTube Transcript Web Interface
**Doc-Type:** Module Documentation · Version 1.0.0 · Updated 2025-11-19 · AI Whisperers

## Purpose

Frontend web interface for YouTube transcript extraction service built with React, TypeScript, and Vite.

---

## Quick Start

### Development Mode
```bash
npm run dev      # Vite dev server with HMR on port 5173
```

### Production Build
```bash
npm run build    # TypeScript compilation + Vite build to dist/
npm run preview  # Preview production build locally
```

### Testing
```bash
npm test              # Run all tests with Vitest
npm run test:unit     # Unit tests only
npm run test:e2e      # End-to-end tests
npm run test:watch    # Watch mode with UI
npm run test:coverage # Generate coverage report
```

---

## Architecture

### Component Structure

```
src/
├── main.tsx           # Application entry point
├── App.tsx            # Root component
├── components/        # Reusable UI components
├── pages/             # Page-level components
├── services/
│   └── api.ts        # API client (Axios)
└── styles/
    └── README.md     # Styling guidelines
```

### Design Patterns

**Component Organization:**
- Functional components with hooks
- Props interface definitions
- TypeScript strict mode
- Component-level state management

**API Communication:**
- Centralized Axios instance in `services/api.ts`
- Type-safe request/response interfaces
- Error handling with structured responses
- 60-second timeout for long-running extractions

---

## Key Features

### Transcript Extraction
- YouTube URL input with validation
- Format selection (JSON, SRT, Text)
- Real-time extraction status
- Copy to clipboard functionality
- Download as file

### User Experience
- Responsive design (mobile, tablet, desktop)
- Loading states with progress indicators
- Error messages with actionable guidance
- Syntax highlighting for JSON format

### API Integration
- RESTful API client in `services/api.ts`
- Type-safe interfaces matching backend
- Automatic retry on network errors
- CORS-enabled communication

---

## Configuration

### Environment Variables

Create `.env.local` for development:
```env
VITE_API_URL=http://localhost:3000
```

Production build uses relative path `/api` by default.

### Build Configuration

`vite.config.ts`:
- React plugin with Fast Refresh
- TypeScript path resolution
- Production optimization
- Preview server on port 4173

---

## Development

### Hot Module Replacement
```bash
npm run dev
# Changes auto-reload in browser
# React Fast Refresh preserves component state
```

### Adding New Features

1. **Components** - Create in `components/` or `pages/`
2. **API Methods** - Add to `services/api.ts`
3. **Types** - Define interfaces for props and API responses
4. **Styles** - Follow styling guidelines in `styles/README.md`
5. **Tests** - Add component tests with React Testing Library

### Testing Strategy

**Unit Tests:**
- Component rendering with `@testing-library/react`
- User interactions with `@testing-library/user-event`
- API mocking with Vitest
- Snapshot testing for UI consistency

**E2E Tests:**
- Full user workflows with Playwright
- Integration with backend API
- Cross-browser testing

---

## Docker

### Development Build
```bash
docker build --target development -t yt-transcript-web:dev .
docker run -p 5173:5173 yt-transcript-web:dev
```

### Production Build
```bash
docker build -t yt-transcript-web:prod .
docker run -p 4173:4173 yt-transcript-web:prod
```

Production image serves static files with preview server.

---

## API Client Usage

### TranscriptAPI Class

```typescript
import { TranscriptAPI } from './services/api';

const api = new TranscriptAPI();

// Extract transcript
const response = await api.extractTranscript({
  url: 'https://youtube.com/watch?v=xyz',
  format: 'json'
});

if (response.success) {
  console.log(response.data.transcript);
} else {
  console.error(response.error);
}

// Get supported formats
const formats = await api.getSupportedFormats();
```

### Type Definitions

```typescript
interface TranscriptRequest {
  url: string;
  format: 'json' | 'srt' | 'text';
}

interface TranscriptSegment {
  time: string;
  text: string;
}

interface TranscriptResponse {
  success: true;
  data: {
    transcript: TranscriptSegment[];
    format: string;
    videoUrl: string;
    extractedAt: string;
  };
}

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
  };
}
```

---

## Scripts Reference

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Production build (TypeScript + Vite) |
| `npm run preview` | Preview production build |
| `npm test` | Run tests with Vitest |
| `npm run test:unit` | Unit tests only |
| `npm run test:e2e` | E2E tests with Playwright |
| `npm run test:watch` | Watch mode with Vitest UI |
| `npm run test:coverage` | Generate coverage report |
| `npm run lint` | ESLint validation |

---

## Dependencies

### Production
- `react` - UI library
- `react-dom` - React DOM renderer
- `axios` - HTTP client for API communication

### Development
- `typescript` - Type safety
- `vite` - Fast build tool with HMR
- `@vitejs/plugin-react` - React support for Vite
- `vitest` - Unit testing framework
- `@testing-library/react` - React component testing
- `@testing-library/user-event` - User interaction simulation
- `@playwright/test` - E2E testing
- `happy-dom` - Lightweight DOM implementation
- `eslint` - Code linting

---

## Deployment

### Static Hosting

After `npm run build`, deploy `dist/` folder to:
- **Cloudflare Pages** - See [Cloudflare Pages](../docs/cloudflare/cloudflare-pages.md)
- **Vercel** - Zero-config deployment
- **Netlify** - Drag-and-drop deployment
- **AWS S3 + CloudFront** - Enterprise hosting

### Docker Deployment

```bash
docker build -t yt-transcript-web:prod .
docker run -d -p 80:4173 yt-transcript-web:prod
```

### Kubernetes Deployment

Serve static files from backend container or use separate nginx/caddy container. See [Deployment Guide](../docs/DEPLOYMENT.md).

---

## Browser Support

- **Chrome/Edge** - Latest 2 versions
- **Firefox** - Latest 2 versions
- **Safari** - Latest 2 versions
- **Mobile** - iOS Safari 14+, Chrome Android 90+

---

## Related Documentation

- [Main README](../README.md) - Project overview
- [Documentation Index](../docs/README.md) - All documentation
- [API Reference](../docs/API.md) - Backend API specification
- [Local Development](../local-dev/README.md) - Development setup
- [Deployment Guide](../docs/DEPLOYMENT.md) - Deployment options

---

## Support

- **Issues:** https://github.com/Ai-Whisperers/yt-transcript-headless/issues
- **Discussions:** https://github.com/Ai-Whisperers/yt-transcript-headless/discussions

---

**Version:** 1.0.0
**License:** MIT
**Maintainer:** AI Whisperers
