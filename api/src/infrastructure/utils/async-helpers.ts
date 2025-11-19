/**
 * Shared async utility functions
 */

/**
 * Wait/delay helper for async operations
 * @param ms - Milliseconds to wait
 * @returns Promise that resolves after the specified delay
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
