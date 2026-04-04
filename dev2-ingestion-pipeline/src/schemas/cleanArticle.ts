export interface SourceHints {
  tagName: string | null;
  cssSelector: string | null;
}

export interface ArticleParagraph {
  paragraphId: string;
  order: number;
  text: string;
  charStart: number;
  charEnd: number;
  sourceHints: SourceHints;
}

export interface ExtractionMethod {
  mainContentExtractor: "mozilla-readability" | "fallback-dom-walk";
  version: string;
}

export interface CleanArticle {
  schemaVersion: "1.0";
  attestationId: string;
  requestId: string;
  sourceUrl: string;
  publisher: string | null;
  language: string | null;
  title: string | null;
  subtitle: string | null;
  publishedAt: string | null;
  extractionMethod: ExtractionMethod;
  paragraphs: ArticleParagraph[];
  fullText: string;
}
