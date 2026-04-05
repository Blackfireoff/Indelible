/**
 * Example queries and expected responses for each mode.
 * Used for documentation and testing.
 */

export interface ExampleQuery {
  description: string;
  query: string;
  documentIds: string[];
  expectedMode: "general-question" | "verify-claim" | "detect-contradictions";
  notes: string;
}

export const EXAMPLE_QUERIES: ExampleQuery[] = [
  // General Question Examples
  {
    description: "Open-ended question about Trump's tariff statements",
    query: "What did Trump say about tariffs?",
    documentIds: ["doc-001"],
    expectedMode: "general-question",
    notes: "Should retrieve tariff-related chunks and provide cited answer",
  },
  {
    description: "Informational query about tariff policy",
    query: "Tell me about the tariff policy mentioned in the interview",
    documentIds: ["doc-001"],
    expectedMode: "general-question",
    notes: "General informational request",
  },

  // Verify-Claim Examples
  {
    description: "Verify if Trump made a specific claim about tariffs",
    query: "Did Trump say tariffs are working beautifully?",
    documentIds: ["doc-001"],
    expectedMode: "verify-claim",
    notes: "Should verify the claim and return supporting/contradicting citations",
  },
  {
    description: "Check if a specific statement was made",
    query: "Did the press secretary claim tariffs reduced the trade deficit?",
    documentIds: ["doc-002"],
    expectedMode: "verify-claim",
    notes: "Verify claim about press secretary statement",
  },
  {
    description: "Verify numeric claim",
    query: "Did Trump say China is paying us billions?",
    documentIds: ["doc-001"],
    expectedMode: "verify-claim",
    notes: "Verify specific numeric claim",
  },

  // Detect-Contradictions Examples
  {
    description: "Find contradictions in Trump's tariff statements",
    query: "Find contradictions in Trump's statements on tariffs",
    documentIds: ["doc-001"],
    expectedMode: "detect-contradictions",
    notes: "Should retrieve all Trump chunks on tariffs and analyze for contradictions",
  },
  {
    description: "Check for conflicting statements",
    query: "Are there conflicting statements about tariffs in the documents?",
    documentIds: ["doc-001", "doc-002"],
    expectedMode: "detect-contradictions",
    notes: "Cross-document contradiction detection",
  },
  {
    description: "Detect topic-based contradictions",
    query: "What contradictions exist in statements about trade policy?",
    documentIds: ["doc-001", "doc-002"],
    expectedMode: "detect-contradictions",
    notes: "Topic-focused contradiction analysis",
  },
];

// Expected output structure examples (mocked)
export const EXAMPLE_OUTPUTS = {
  "general-question": {
    mode: "general-question",
    answer:
      "Based on the retrieved evidence, Trump stated that 'The tariffs are working beautifully. China is paying us billions. We have never had leverage like this before.' He described the current tariff structure as ensuring American workers are protected while renegotiating fair trade deals.",
    citations: [
      {
        chunkId: "doc-001-chunk-0002",
        quote:
          "Trump: The tariffs are working beautifully. China is paying us billions. We have never had leverage like this before.",
        sourceUrl: "https://example.com/interview-2026-04-04",
        observedAt: "2026-04-04T08:45:00Z",
        storagePointer: "0g://chunks/doc-001/chunk-0002.json",
        attestationId: "att-001",
      },
    ],
    confidence: 0.85,
    evidence: ["doc-001-chunk-0002"],
    limitations: "",
    contradictions: [],
  },

  "verify-claim-supported": {
    mode: "verify-claim",
    verdict: "supported",
    confidence: 0.92,
    explanation:
      "The retrieved chunks provide direct evidence that Trump made this statement. In doc-001-chunk-0002, Trump is quoted saying 'The tariffs are working beautifully. China is paying us billions.' This supports the claim.",
    supportingCitations: [
      {
        chunkId: "doc-001-chunk-0002",
        quote:
          "Trump: The tariffs are working beautifully. China is paying us billions. We have never had leverage like this before.",
        sourceUrl: "https://example.com/interview-2026-04-04",
        observedAt: "2026-04-04T08:45:00Z",
        storagePointer: "0g://chunks/doc-001/chunk-0002.json",
        attestationId: "att-001",
      },
    ],
    contradictingCitations: [],
    nuances: [
      "The claim is supported by direct quotation from the interview transcript.",
      "The statement reflects Trump's viewpoint on tariff effectiveness.",
    ],
    meta: {
      query: "Did Trump say tariffs are working beautifully?",
      speakerQuery: "Trump",
      claimText: "tariffs are working beautifully",
      timeframe: null,
      chunksRetrieved: 3,
      retrievalScoreAvg: 0.82,
      documentsUsed: ["doc-001"],
      model: "qwen-2.5-7b-instruct",
      timestamp: "2026-04-04T15:00:00Z",
    },
  },

  "verify-claim-unverifiable": {
    mode: "verify-claim",
    verdict: "unverifiable",
    confidence: 0.0,
    explanation:
      "No relevant chunks were found in the retrieved documents that address this specific claim. The available chunks do not contain sufficient evidence to verify or refute this statement.",
    supportingCitations: [],
    contradictingCitations: [],
    nuances: [],
    meta: {
      query: "Did Trump say Mexico will pay for the wall?",
      speakerQuery: "Trump",
      claimText: "Mexico will pay for the wall",
      timeframe: null,
      chunksRetrieved: 0,
      retrievalScoreAvg: 0.0,
      documentsUsed: [],
      model: "qwen-2.5-7b-instruct",
      timestamp: "2026-04-04T15:00:00Z",
    },
  },

  "detect-contradictions-found": {
    mode: "detect-contradictions",
    contradictions: [
      {
        id: "contradiction-001",
        description:
          "Trump's statement about tariff scope appears inconsistent across statements.",
        topic: "tariffs",
        chunkIds: ["doc-001-chunk-0002", "doc-002-chunk-0001"],
        quotes: [
          "The tariffs are working beautifully. China is paying us billions.",
          "Our administration has imposed tariffs on Chinese goods totaling $360 billion annually.",
        ],
        severity: "medium",
        timestamps: ["2026-04-04T08:45:00Z", "2026-04-03T14:00:00Z"],
      },
    ],
    summary:
      "One potential inconsistency detected regarding tariff claims across documents. The statements discuss different aspects of tariffs and may not be direct contradictions.",
    meta: {
      query: "Find contradictions in Trump's statements on tariffs",
      speakerQuery: "Trump",
      topic: "tariffs",
      timeframe: null,
      chunksAnalyzed: 5,
      documentsUsed: ["doc-001", "doc-002"],
      model: "qwen-2.5-7b-instruct",
      timestamp: "2026-04-04T15:00:00Z",
    },
  },

  "detect-contradictions-none": {
    mode: "detect-contradictions",
    contradictions: [],
    summary: "No contradictions detected in the available evidence for the specified speaker and topic.",
    meta: {
      query: "Find contradictions in Trump's statements on tariffs",
      speakerQuery: "Trump",
      topic: "tariffs",
      timeframe: null,
      chunksAnalyzed: 3,
      documentsUsed: ["doc-001"],
      model: "qwen-2.5-7b-instruct",
      timestamp: "2026-04-04T15:00:00Z",
    },
  },
};
