# Contributing to YouTube Headless Transcript Extractor

**Doc-Type:** Contributing Guidelines · Version 1.0.0 · Updated 2025-11-14 · AI Whisperers

Thank you for your interest in contributing to this project. This document provides guidelines and instructions for contributing.

## Code of Conduct

### Our Standards

- Use welcoming and inclusive language
- Be respectful of differing viewpoints and experiences
- Gracefully accept constructive criticism
- Focus on what is best for the community
- Show empathy towards other community members

## How to Contribute

### Reporting Issues

Before creating an issue, please check existing issues to avoid duplicates.

When reporting issues, include:
- Clear description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, etc.)
- Error messages and stack traces

### Suggesting Features

Feature requests are welcome. Please provide:
- Clear use case description
- Expected behavior
- Potential implementation approach
- Impact on existing functionality

### Pull Request Process

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/yt-transcript-headless
   cd yt-transcript-headless
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Follow existing code style
   - Add tests for new functionality
   - Update documentation as needed

4. **Test Your Changes**
   ```bash
   npm test
   npm run lint
   ```

5. **Commit with Descriptive Message**
   ```bash
   git commit -m "feat: add support for subtitle language selection"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   ```

## Development Guidelines

### Code Style

- **TypeScript:** Use strict mode and proper typing
- **Functions:** Keep them small and focused (Single Responsibility)
- **Comments:** Explain "why" not "what"
- **Naming:** Use descriptive, self-documenting names

### Architecture Principles

- Follow hexagonal architecture pattern
- Maintain clear separation between layers
- Keep domain logic independent of infrastructure
- Use dependency injection for testability

### Testing Requirements

- Write unit tests for business logic
- Add integration tests for API endpoints
- Include E2E tests for critical user flows
- Maintain minimum 80% code coverage

### Commit Message Format

Follow conventional commits specification:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- **feat:** New feature
- **fix:** Bug fix
- **docs:** Documentation changes
- **style:** Code style changes (formatting, etc.)
- **refactor:** Code refactoring
- **test:** Test additions or corrections
- **chore:** Maintenance tasks

### Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for public APIs
- Include inline comments for complex logic
- Update API documentation for endpoint changes

## Review Process

### What We Look For

1. **Code Quality**
   - Clean, readable code
   - Proper error handling
   - No code duplication
   - Performance considerations

2. **Testing**
   - Adequate test coverage
   - Tests pass in CI
   - Edge cases handled

3. **Documentation**
   - Clear commit messages
   - Updated documentation
   - Code comments where needed

4. **Compatibility**
   - Backward compatibility maintained
   - Cross-platform considerations
   - Security best practices

### Review Timeline

- Initial review within 48 hours
- Feedback addressed promptly
- Merge after approval from maintainer

## Local Development Setup

### Prerequisites

```bash
# Install Node.js 18+
node --version

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### Running Tests

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm test
```

### Building

```bash
# Build API
cd api && npm run build

# Build Web
cd web && npm run build
```

## Questions?

Feel free to open an issue for any questions about contributing.

Thank you for contributing to make this project better!