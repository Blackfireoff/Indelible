/** Raw artifact produced by Dev 1 and stored in 0G Storage. */
export interface RawCapture {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  observedAt: string;
  contentType: "text/html";
  rawHash: string;
  dataBrut: string;
}

export function isRawCapture(value: unknown): value is RawCapture {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.schemaVersion === "1.0" &&
    typeof v.attestationId === "string" &&
    typeof v.requestId === "string" &&
    typeof v.sourceUrl === "string" &&
    typeof v.observedAt === "string" &&
    v.contentType === "text/html" &&
    typeof v.rawHash === "string" &&
    typeof v.dataBrut === "string"
  );
}
