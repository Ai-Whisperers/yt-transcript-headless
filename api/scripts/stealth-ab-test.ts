/**
 * A/B Test Script: Stealth vs Raw Chromium
 *
 * Tests extraction success rates with stealth techniques enabled vs disabled.
 * Runs 100 extractions in each mode and compares:
 * - Success rate
 * - Average extraction time
 * - Error types and frequency
 * - Browser stability
 *
 * Usage:
 *   npm run stealth-test
 */

import { BrowserManager } from '../src/infrastructure/BrowserManager';
import { TranscriptExtractor } from '../src/infrastructure/TranscriptExtractor';
import { Logger } from '../src/infrastructure/Logger';
import * as fs from 'fs';
import * as path from 'path';

interface TestResult {
  mode: 'stealth' | 'raw';
  iteration: number;
  videoId: string;
  success: boolean;
  duration: number;
  error?: string;
  errorType?: string;
  timestamp: string;
}

interface TestSummary {
  mode: 'stealth' | 'raw';
  totalTests: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  errorBreakdown: Record<string, number>;
}

// Sample of popular YouTube videos for testing (diverse content types)
const TEST_VIDEO_IDS = [
  'dQw4w9WgXcQ', // Music video
  'jNQXAC9IVRw', // Educational (Me at the zoo)
  '9bZkp7q19f0', // Music (Gangnam Style)
  'kJQP7kiw5Fk', // Music (Despacito)
  'OPf0YbXqDm0', // Educational (Mark Rober)
  'BaW_jenozKc', // Music (Shape of You)
  'RgKAFK5djSk', // Music (Wrecking Ball)
  'hT_nvWreIhg', // Educational (VSauce)
  'L_jWHffIx5E', // Music (Smells Like Teen Spirit)
  'YQHsXMglC9A', // Music (Hello - Adele)
];

class StealthABTest {
  private logger: Logger;
  private results: TestResult[] = [];

  constructor() {
    this.logger = new Logger('stealth-ab-test');
  }

  /**
   * Run extraction test with specified stealth mode
   */
  private async runTest(
    mode: 'stealth' | 'raw',
    iteration: number,
    videoId: string
  ): Promise<TestResult> {
    const startTime = Date.now();
    const testLogger = new Logger(`${mode}-test-${iteration}`);

    // Set environment variable for this test
    process.env.ENABLE_STEALTH = mode === 'stealth' ? 'true' : 'false';

    const browserManager = new BrowserManager(testLogger);
    const extractor = new TranscriptExtractor(browserManager, testLogger);

    try {
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      await extractor.extract(videoUrl);

      const duration = Date.now() - startTime;

      return {
        mode,
        iteration,
        videoId,
        success: true,
        duration,
        timestamp: new Date().toISOString()
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Classify error type
      let errorType = 'UNKNOWN';
      if (error.message.includes('NO_TRANSCRIPT')) {
        errorType = 'NO_TRANSCRIPT';
      } else if (error.message.includes('timeout')) {
        errorType = 'TIMEOUT';
      } else if (error.message.includes('navigation')) {
        errorType = 'NAVIGATION_FAILED';
      } else if (error.message.includes('Target closed')) {
        errorType = 'BROWSER_CRASH';
      } else if (error.message.includes('blocked')) {
        errorType = 'BLOCKED_BY_YOUTUBE';
      }

      return {
        mode,
        iteration,
        videoId,
        success: false,
        duration,
        error: error.message,
        errorType,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Run batch of tests for a specific mode
   */
  private async runBatch(mode: 'stealth' | 'raw', count: number): Promise<void> {
    this.logger.info(`Starting ${mode} mode tests (${count} iterations)`);

    for (let i = 0; i < count; i++) {
      // Rotate through test videos
      const videoId = TEST_VIDEO_IDS[i % TEST_VIDEO_IDS.length];

      this.logger.info(`[${mode}] Test ${i + 1}/${count} - Video: ${videoId}`);

      const result = await this.runTest(mode, i + 1, videoId);
      this.results.push(result);

      // Log immediate result
      if (result.success) {
        this.logger.info(`[${mode}] ✓ Success in ${result.duration}ms`);
      } else {
        this.logger.warn(`[${mode}] ✗ Failed: ${result.errorType} (${result.duration}ms)`);
      }

      // Small delay between tests to avoid rate limiting
      await this.sleep(2000);
    }

    this.logger.info(`Completed ${mode} mode tests`);
  }

  /**
   * Calculate summary statistics for a mode
   */
  private calculateSummary(mode: 'stealth' | 'raw'): TestSummary {
    const modeResults = this.results.filter(r => r.mode === mode);
    const successResults = modeResults.filter(r => r.success);
    const failureResults = modeResults.filter(r => !r.success);

    const durations = successResults.map(r => r.duration);
    const errorBreakdown: Record<string, number> = {};

    failureResults.forEach(r => {
      const errorType = r.errorType || 'UNKNOWN';
      errorBreakdown[errorType] = (errorBreakdown[errorType] || 0) + 1;
    });

    return {
      mode,
      totalTests: modeResults.length,
      successCount: successResults.length,
      failureCount: failureResults.length,
      successRate: (successResults.length / modeResults.length) * 100,
      averageDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      errorBreakdown
    };
  }

  /**
   * Generate markdown report
   */
  private generateReport(): string {
    const stealthSummary = this.calculateSummary('stealth');
    const rawSummary = this.calculateSummary('raw');

    const report = `# Stealth A/B Test Results

**Doc-Type:** Test Results · Version 1.0.0 · Updated ${new Date().toISOString().split('T')[0]} · AI Whisperers

## Executive Summary

This report documents the A/B test comparing YouTube transcript extraction with stealth techniques enabled vs. disabled (raw Chromium).

**Test Configuration:**
- Tests per mode: ${stealthSummary.totalTests}
- Test videos: ${TEST_VIDEO_IDS.length} unique videos (rotated)
- Delay between tests: 2 seconds
- Total test duration: ~${Math.round((this.results.length * 2000 + this.results.reduce((sum, r) => sum + r.duration, 0)) / 60000)} minutes

---

## Results Comparison

| Metric | Stealth Enabled | Raw Chromium | Difference |
|--------|----------------|--------------|------------|
| **Success Rate** | ${stealthSummary.successRate.toFixed(2)}% | ${rawSummary.successRate.toFixed(2)}% | ${(stealthSummary.successRate - rawSummary.successRate).toFixed(2)}% |
| **Success Count** | ${stealthSummary.successCount}/${stealthSummary.totalTests} | ${rawSummary.successCount}/${rawSummary.totalTests} | ${stealthSummary.successCount - rawSummary.successCount} |
| **Failure Count** | ${stealthSummary.failureCount} | ${rawSummary.failureCount} | ${stealthSummary.failureCount - rawSummary.failureCount} |
| **Avg Duration (ms)** | ${Math.round(stealthSummary.averageDuration)} | ${Math.round(rawSummary.averageDuration)} | ${Math.round(stealthSummary.averageDuration - rawSummary.averageDuration)} |
| **Min Duration (ms)** | ${stealthSummary.minDuration} | ${rawSummary.minDuration} | ${stealthSummary.minDuration - rawSummary.minDuration} |
| **Max Duration (ms)** | ${stealthSummary.maxDuration} | ${rawSummary.maxDuration} | ${stealthSummary.maxDuration - rawSummary.maxDuration} |

---

## Error Breakdown

### Stealth Enabled Errors
${Object.entries(stealthSummary.errorBreakdown).length > 0
  ? Object.entries(stealthSummary.errorBreakdown)
    .map(([type, count]) => `- **${type}**: ${count} occurrences (${((count / stealthSummary.failureCount) * 100).toFixed(1)}%)`)
    .join('\n')
  : 'No errors recorded'}

### Raw Chromium Errors
${Object.entries(rawSummary.errorBreakdown).length > 0
  ? Object.entries(rawSummary.errorBreakdown)
    .map(([type, count]) => `- **${type}**: ${count} occurrences (${((count / rawSummary.failureCount) * 100).toFixed(1)}%)`)
    .join('\n')
  : 'No errors recorded'}

---

## Analysis

### Performance Impact
${stealthSummary.averageDuration > rawSummary.averageDuration
  ? `Stealth techniques add ~${Math.round(stealthSummary.averageDuration - rawSummary.averageDuration)}ms overhead per extraction (${(((stealthSummary.averageDuration - rawSummary.averageDuration) / rawSummary.averageDuration) * 100).toFixed(1)}% slower).`
  : `Stealth techniques have minimal performance impact (only ${Math.round(rawSummary.averageDuration - stealthSummary.averageDuration)}ms faster).`}

### Reliability Impact
${stealthSummary.successRate > rawSummary.successRate
  ? `**Stealth techniques IMPROVE reliability** by ${(stealthSummary.successRate - rawSummary.successRate).toFixed(2)}% (${stealthSummary.successCount - rawSummary.successCount} more successful extractions).`
  : stealthSummary.successRate < rawSummary.successRate
    ? `**Raw Chromium is MORE reliable** by ${(rawSummary.successRate - stealthSummary.successRate).toFixed(2)}% (${rawSummary.successCount - stealthSummary.successCount} more successful extractions).`
    : `**No significant difference** in reliability between modes.`}

### Detection Analysis
${rawSummary.errorBreakdown['BLOCKED_BY_YOUTUBE']
  ? `⚠️ **YouTube detection detected**: ${rawSummary.errorBreakdown['BLOCKED_BY_YOUTUBE']} blocks in raw mode vs ${stealthSummary.errorBreakdown['BLOCKED_BY_YOUTUBE'] || 0} in stealth mode.`
  : '✓ No YouTube bot detection observed in either mode during testing.'}

---

## Recommendation

${this.generateRecommendation(stealthSummary, rawSummary)}

---

## Test Data

### Stealth Enabled Results
\`\`\`json
${JSON.stringify(this.results.filter(r => r.mode === 'stealth'), null, 2)}
\`\`\`

### Raw Chromium Results
\`\`\`json
${JSON.stringify(this.results.filter(r => r.mode === 'raw'), null, 2)}
\`\`\`

---

## Reproducibility

To reproduce these tests:

\`\`\`bash
# Run the test script
npm run stealth-test

# Or manually run with different iterations
npx tsx api/scripts/stealth-ab-test.ts --iterations 50
\`\`\`

**Environment:**
- Node.js: ${process.version}
- Playwright: ${require('playwright/package.json').version}
- Platform: ${process.platform}
- Test Date: ${new Date().toISOString()}
`;

    return report;
  }

  /**
   * Generate recommendation based on test results
   */
  private generateRecommendation(stealth: TestSummary, raw: TestSummary): string {
    const reliabilityDiff = stealth.successRate - raw.successRate;
    const blockedInRaw = raw.errorBreakdown['BLOCKED_BY_YOUTUBE'] || 0;
    const blockedInStealth = stealth.errorBreakdown['BLOCKED_BY_YOUTUBE'] || 0;

    // Decision criteria from plan.md:
    // - If stealth causes >10% more failures, disable by default
    // - If YouTube blocks raw chromium, keep stealth mandatory

    if (blockedInRaw > blockedInStealth && blockedInRaw > 5) {
      return `**🔒 KEEP STEALTH ENABLED (MANDATORY)**

YouTube is actively blocking raw Chromium (${blockedInRaw} blocks vs ${blockedInStealth} with stealth). Stealth techniques are necessary for reliable extraction.

**Action:** Keep \`ENABLE_STEALTH=true\` as default. Do not expose to users.`;
    }

    if (reliabilityDiff < -10) {
      return `**❌ DISABLE STEALTH BY DEFAULT**

Stealth techniques are causing ${Math.abs(reliabilityDiff).toFixed(2)}% more failures than raw Chromium. The overhead is not justified.

**Action:** Set \`ENABLE_STEALTH=false\` as default. Remove stealth code in future refactor.`;
    }

    if (reliabilityDiff > 5) {
      return `**✅ KEEP STEALTH ENABLED (RECOMMENDED)**

Stealth techniques improve success rate by ${reliabilityDiff.toFixed(2)}%. The reliability benefit outweighs the overhead.

**Action:** Keep \`ENABLE_STEALTH=true\` as default. Document as best practice.`;
    }

    return `**🤷 NO CLEAR WINNER**

Success rates are similar (${Math.abs(reliabilityDiff).toFixed(2)}% difference). Both modes work reliably.

**Action:** Keep \`ENABLE_STEALTH=true\` for safety, but make it configurable via environment variable for advanced users who want to optimize performance.`;
  }

  /**
   * Save results to file
   */
  private async saveResults(): Promise<void> {
    const outputDir = path.join(__dirname, '../../local');
    const reportPath = path.join(outputDir, 'stealth-test-results.md');
    const rawDataPath = path.join(outputDir, 'stealth-test-data.json');

    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save markdown report
    const report = this.generateReport();
    fs.writeFileSync(reportPath, report, 'utf-8');
    this.logger.info(`Report saved to: ${reportPath}`);

    // Save raw JSON data
    fs.writeFileSync(rawDataPath, JSON.stringify({
      testDate: new Date().toISOString(),
      nodeVersion: process.version,
      playwrightVersion: require('playwright/package.json').version,
      platform: process.platform,
      results: this.results,
      summaries: {
        stealth: this.calculateSummary('stealth'),
        raw: this.calculateSummary('raw')
      }
    }, null, 2), 'utf-8');
    this.logger.info(`Raw data saved to: ${rawDataPath}`);
  }

  /**
   * Run full A/B test
   */
  async run(iterationsPerMode: number = 100): Promise<void> {
    this.logger.info('=== Stealth A/B Test Started ===');
    this.logger.info(`Iterations per mode: ${iterationsPerMode}`);
    this.logger.info(`Test videos: ${TEST_VIDEO_IDS.length}`);

    try {
      // Run stealth mode tests first
      await this.runBatch('stealth', iterationsPerMode);

      // Small break between batches
      this.logger.info('Break between test batches (10 seconds)');
      await this.sleep(10000);

      // Run raw chromium tests
      await this.runBatch('raw', iterationsPerMode);

      // Generate and save results
      await this.saveResults();

      // Print summary to console
      const stealthSummary = this.calculateSummary('stealth');
      const rawSummary = this.calculateSummary('raw');

      this.logger.info('=== Test Complete ===');
      this.logger.info(`Stealth Success Rate: ${stealthSummary.successRate.toFixed(2)}%`);
      this.logger.info(`Raw Success Rate: ${rawSummary.successRate.toFixed(2)}%`);
      this.logger.info(`Difference: ${(stealthSummary.successRate - rawSummary.successRate).toFixed(2)}%`);

    } catch (error: any) {
      this.logger.error('A/B test failed', error);
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run test if executed directly
if (require.main === module) {
  const iterations = parseInt(process.argv[2]) || 100;

  const test = new StealthABTest();
  test.run(iterations)
    .then(() => {
      console.log('\n✅ A/B test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ A/B test failed:', error);
      process.exit(1);
    });
}

export { StealthABTest };
