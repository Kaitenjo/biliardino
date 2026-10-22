import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';

/**
 * Reads the JSON body of a request.
 *
 * @param c - The context of the request.
 * @returns The body, `{}` when there is none; its fields are checked by the caller.
 * @throws HTTPException 400 when the body is not JSON.
 */
export async function readBody(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (!text) {
    return {};
  }

  try {
    const body: unknown = JSON.parse(text);
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  } catch {
    throw new HTTPException(400);
  }
}
