/**
 * Deterministic speaker normalization.
 *
 * Rules:
 *  1. Trim leading/trailing whitespace
 *  2. Collapse internal whitespace
 *  3. Lowercase
 *  4. Remove punctuation (except hyphens within words)
 *  5. Replace spaces with underscores
 *
 * An optional alias map allows common variants to resolve to a canonical form
 * before normalization (e.g., "President Trump" -> "Donald Trump").
 */

export type AliasMap = Record<string, string>;

/** Built-in alias map for common political figures. Extend as needed. */
const DEFAULT_ALIASES: AliasMap = {
  "president trump": "donald trump",
  "trump": "donald trump",
  "president biden": "joe biden",
  "biden": "joe biden",
  "president obama": "barack obama",
  "obama": "barack obama",
  "secretary blinken": "antony blinken",
  "blinken": "antony blinken",
  "secretary austin": "lloyd austin",
  "austin": "lloyd austin",
};

/**
 * Normalize a raw speaker name to a stable slug-like ID.
 *
 * @param rawName - Raw speaker name as it appears in the text.
 * @param aliasMap - Optional alias map to apply before normalization.
 * @returns A deterministic normalized identifier string.
 */
export function normalizeSpeaker(
  rawName: string,
  aliasMap: AliasMap = DEFAULT_ALIASES
): string {
  if (!rawName || rawName.trim() === "") return "unknown";

  // Step 1: collapse whitespace and trim
  let name = rawName.replace(/\s+/g, " ").trim();

  // Step 2: apply alias map (case-insensitive lookup on the raw form)
  const lowerForAlias = name.toLowerCase();
  if (aliasMap[lowerForAlias]) {
    name = aliasMap[lowerForAlias];
  }

  // Step 3: lowercase
  name = name.toLowerCase();

  // Step 4: remove punctuation except hyphens between word chars
  // Keep letters, digits, spaces, and hyphens surrounded by word chars
  name = name.replace(/[^\w\s-]/g, "");

  // Step 5: collapse any newly created extra spaces
  name = name.replace(/\s+/g, " ").trim();

  // Step 6: replace spaces with underscores
  name = name.replace(/\s/g, "_");

  return name || "unknown";
}

/**
 * Normalize a list of speakers and return deduplicated normalized IDs.
 */
export function normalizeSpeakers(
  rawNames: string[],
  aliasMap: AliasMap = DEFAULT_ALIASES
): string[] {
  return [...new Set(rawNames.map((n) => normalizeSpeaker(n, aliasMap)))];
}
