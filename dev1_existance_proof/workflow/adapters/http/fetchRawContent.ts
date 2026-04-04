/**
 * Fetch raw content from a public URL.
 * Returns the exact response body and content-type header.
 *
 * IMPORTANT: No transformation is applied to the response body.
 * The raw bytes are returned as-is for deterministic hashing.
 */
export interface FetchResult {
  /** The exact raw response body */
  body: string;
  /** The content-type header from the response */
  contentType: string;
  /** HTTP status code */
  status: number;
}

/**
 * Fetch the raw content from a URL.
 * Throws if the request fails or returns a non-2xx status.
 */
export async function fetchRawContent(url: string): Promise<FetchResult> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      // Identify ourselves; some sites block requests without a User-Agent
      "User-Agent": "Indelible/1.0 (ExistenceProof)",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`
    );
  }

  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  return {
    body,
    contentType,
    status: response.status,
  };
}
