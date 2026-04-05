import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { cleanParagraphText, isContentParagraph } from "../utils/html.js";

export interface ReadabilityResult {
  title: string | null;
  byline: string | null;
  siteName: string | null;
  lang: string | null;
  content: string;          // inner HTML of article body
  textContent: string;      // plain-text version
  excerpt: string | null;
  publishedTime: string | null;
  paragraphs: ExtractedParagraph[];
  extractionMethod: "mozilla-readability" | "fallback-dom-walk";
}

export interface ExtractedParagraph {
  text: string;
  tagName: string | null;
  cssSelector: string | null;
}

/**
 * Extract main article content from raw HTML.
 *
 * Strategy:
 *  1. Try Mozilla Readability (primary).
 *  2. If Readability returns no usable paragraphs, fall back to a deterministic
 *     DOM walk that collects <p> elements from the deepest article-like container.
 *
 * @param html - Raw HTML string
 * @param sourceUrl - Original page URL (passed to JSDOM for relative URL resolution)
 */
export async function extractMainArticle(
  html: string,
  sourceUrl: string
): Promise<ReadabilityResult> {
  const dom = new JSDOM(html, { url: sourceUrl });

  // Clone the document before passing to Readability – it mutates the DOM.
  const documentClone = dom.window.document.cloneNode(true) as Document;
  const reader = new Readability(documentClone, {
    charThreshold: 100,
    keepClasses: false,
  });

  const article = reader.parse();

  if (article && article.textContent && article.textContent.trim().length > 200) {
    const paragraphs = extractParagraphsFromReadability(article.content, dom.window.document);

    if (paragraphs.length >= 2) {
      return {
        title: article.title || null,
        byline: article.byline || null,
        siteName: article.siteName || null,
        lang: article.lang || null,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt || null,
        publishedTime: (article as unknown as Record<string, unknown>).publishedTime as string | null ?? null,
        paragraphs,
        extractionMethod: "mozilla-readability",
      };
    }
  }

  // Fallback: deterministic DOM walk on the original document
  console.warn(
    "[extractMainArticle] Readability returned insufficient content – using fallback DOM walk."
  );
  return fallbackDomWalk(dom.window.document, sourceUrl);
}

/**
 * Parse the Readability content HTML to extract ordered paragraphs.
 * Uses a secondary JSDOM parse of the Readability output (which is already cleaned HTML).
 */
function extractParagraphsFromReadability(
  contentHtml: string,
  _originalDoc: Document
): ExtractedParagraph[] {
  const contentDom = new JSDOM(`<html><body>${contentHtml}</body></html>`);
  const body = contentDom.window.document.body;

  const paragraphs: ExtractedParagraph[] = [];
  const blockElements = body.querySelectorAll("p, blockquote, li, h1, h2, h3, h4, h5, h6");

  blockElements.forEach((el, idx) => {
    const text = cleanParagraphText(el.textContent ?? "");
    if (!isContentParagraph(text)) return;

    const tagName = el.tagName.toLowerCase();
    const nthChild = idx + 1;
    const cssSelector = `${tagName}:nth-child(${nthChild})`;

    paragraphs.push({ text, tagName, cssSelector });
  });

  return paragraphs;
}

/**
 * Fallback: walk the original DOM to find article-like containers and extract <p> elements.
 * This handles pages where Readability fails (e.g., heavy Reuters-style markup).
 */
function fallbackDomWalk(
  document: Document,
  _sourceUrl: string
): ReadabilityResult {
  // Try common semantic containers in priority order
  const selectors = [
    "article",
    '[role="article"]',
    "main",
    ".article-body",
    ".story-body",
    ".article__body",
    ".post-content",
    ".entry-content",
    "#article-body",
    "#story-body",
    ".StandardArticleBody_body",
    ".ArticleBody_body",
    '[data-testid="article-body"]',
    '[data-module="ArticleBody"]',
  ];

  let container: Element | null = null;
  for (const sel of selectors) {
    container = document.querySelector(sel);
    if (container) break;
  }

  // Last resort: body itself
  if (!container) container = document.body;

  const rawParagraphs = container.querySelectorAll("p");
  const paragraphs: ExtractedParagraph[] = [];

  rawParagraphs.forEach((p, idx) => {
    const text = cleanParagraphText(p.textContent ?? "");
    if (!isContentParagraph(text)) return;

    paragraphs.push({
      text,
      tagName: "p",
      cssSelector: `p:nth-of-type(${idx + 1})`,
    });
  });

  // Extract meta information
  const titleEl = document.querySelector("h1, title");
  const title = titleEl ? cleanParagraphText(titleEl.textContent ?? "") : null;

  const langAttr = document.documentElement.getAttribute("lang");
  const siteNameMeta = document.querySelector('meta[property="og:site_name"]');
  const siteName = siteNameMeta?.getAttribute("content") ?? null;

  const bylineMeta = document.querySelector('meta[name="author"]');
  const byline = bylineMeta?.getAttribute("content") ?? null;

  const publishedTimeMeta = document.querySelector(
    'meta[property="article:published_time"], meta[name="date"]'
  );
  const publishedTime = publishedTimeMeta?.getAttribute("content") ?? null;

  const fullText = paragraphs.map((p) => p.text).join("\n\n");

  return {
    title,
    byline,
    siteName,
    lang: langAttr,
    content: fullText,
    textContent: fullText,
    excerpt: paragraphs[0]?.text ?? null,
    publishedTime,
    paragraphs,
    extractionMethod: "fallback-dom-walk",
  };
}
