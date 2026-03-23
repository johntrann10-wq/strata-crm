/**
 * Custom entry.server: wraps Vercel's handleRequest in try/catch so SSR errors
 * return a 500 response and are logged instead of crashing the serverless function.
 */
import { handleRequest as vercelHandleRequest } from "@vercel/react-router/entry.server";
import type { EntryContext } from "react-router";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext?: any,
  options?: any
): Promise<Response> {
  try {
    return await vercelHandleRequest(
      request,
      responseStatusCode,
      responseHeaders,
      routerContext,
      loadContext,
      options
    );
  } catch (err) {
    console.error("[entry.server] SSR error:", err);
    return new Response(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>Something went wrong</h1><p>Please try again or refresh the page.</p></body></html>`,
      {
        status: 500,
        headers: new Headers({ "Content-Type": "text/html; charset=utf-8" }),
      }
    );
  }
}
