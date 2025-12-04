/**
 * Mock implementation of @xenova/transformers for testing
 * Provides mock embedding generation without requiring actual transformer models
 */

export class MockFeatureExtractionPipeline {
  async generate(inputs: string | string[]): Promise<any> {
    const texts = Array.isArray(inputs) ? inputs : [inputs];

    // Return mock embeddings (384-dimensional vectors with random values)
    return {
      tolist: () => texts.map(() => Array(384).fill(0).map(() => Math.random()))
    };
  }
}

export async function pipeline(task: string, model?: string): Promise<any> {
  if (task === 'feature-extraction') {
    return new MockFeatureExtractionPipeline();
  }
  throw new Error(`Unsupported pipeline task: ${task}`);
}

export class FeatureExtractionPipeline extends MockFeatureExtractionPipeline {}

// Default export for compatibility
export default {
  pipeline,
  FeatureExtractionPipeline
};
