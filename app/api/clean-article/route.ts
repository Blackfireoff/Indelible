/**
 * API route for fetching the clean article content.
 *
 * GET /api/clean-article?attestationId=xxx
 *
 * Returns the clean article from 0G Storage.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCleanArticleFetcher } from "../../../dev3-AI-RAG/storage/clean-article-fetcher";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const attestationId = searchParams.get("attestationId");

    if (!attestationId || typeof attestationId !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'attestationId' query parameter" },
        { status: 400 }
      );
    }

    const fetcher = getCleanArticleFetcher();
    const article = await fetcher.fetchCleanArticle(attestationId);

    if (!article) {
      return NextResponse.json(
        { error: "Clean article not found or failed to fetch from 0G Storage" },
        { status: 404 }
      );
    }

    return NextResponse.json({ article });
  } catch (error) {
    console.error("Clean article fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
