// path: src/lib/http.ts
// fetchをタイムアウト可能にラップし、HTTPエラーは例外にする。上位でretry()と組み合わせて使う。
import { TimeoutError, HttpError } from "./errors";

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 5000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...rest, signal: controller.signal });
    if (!res.ok) throw new HttpError(url, res.status, res.statusText);
    return res;
  } catch (e: any) {
    if (e?.name === "AbortError") {
      throw new TimeoutError(url, timeoutMs);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}