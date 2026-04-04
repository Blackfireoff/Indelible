/**
 * Extract the content-type from HTTP response headers.
 * Falls back to "application/octet-stream" if not present.
 *
 * @param headers - HTTP response headers (case-insensitive key lookup)
 * @returns The content-type string (e.g. "text/html; charset=utf-8")
 */
export function extractContentType(
  headers: Record<string, string>
): string {
  // Headers may have varying casing
  const key = Object.keys(headers).find(
    (k) => k.toLowerCase() === "content-type"
  );
  if (key && headers[key]) {
    return headers[key];
  }
  return "application/octet-stream";
}

/**
 * Extract just the MIME type portion, stripping charset and parameters.
 * e.g. "text/html; charset=utf-8" → "text/html"
 */
export function extractMimeType(contentTypeHeader: string): string {
  const semicolonIndex = contentTypeHeader.indexOf(";");
  if (semicolonIndex !== -1) {
    return contentTypeHeader.substring(0, semicolonIndex).trim();
  }
  return contentTypeHeader.trim();
}
