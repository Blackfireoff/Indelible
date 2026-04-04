/**
 * Mock for @xenova/transformers in Jest tests.
 * Returns simple mock embeddings (not semantic).
 */

export const pipeline = jest.fn().mockImplementation(() => {
  return Promise.resolve((text: string | string[]) => {
    // Generate mock embeddings (384 dims as per all-MiniLM-L6-v2)
    const mockEmbedding = () => Array.from({ length: 384 }, () => Math.random() * 0.1);

    if (Array.isArray(text)) {
      return {
        data: text.map(() => mockEmbedding()),
      };
    }
    return {
      data: mockEmbedding(),
    };
  });
});

export type FeatureExtractionPipeline = {
  (text: string | string[], options: { pooling: string; normalize: boolean }): Promise<{
    data: number[][];
  }>;
};
