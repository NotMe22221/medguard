import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

// Server-side refusal fallback (beta): if a request is declined, the API
// re-runs it on a fallback model chosen by refusal category.
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
export function getClient() {
  client ??= new Anthropic();
  return client;
}

export function errorResponse(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) {
    return Response.json(
      { error: "No valid Anthropic API key. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 401 }
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return Response.json({ error: "Rate limited. Please try again in a moment." }, { status: 429 });
  }
  if (err instanceof Anthropic.BadRequestError) {
    return Response.json({ error: `The AI service rejected the request: ${err.message}` }, { status: 400 });
  }
  if (err instanceof Anthropic.APIError) {
    return Response.json({ error: `AI service error (${err.status}).` }, { status: 502 });
  }
  if (err instanceof Error && /credentials|authentication|apiKey|API key/i.test(err.message)) {
    return Response.json(
      { error: "No Anthropic API key found. Add ANTHROPIC_API_KEY to .env.local and restart." },
      { status: 401 }
    );
  }
  console.error(err);
  return Response.json({ error: "Something went wrong." }, { status: 500 });
}
