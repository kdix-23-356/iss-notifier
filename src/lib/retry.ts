// path: src/lib/retry.ts
// 汎用リトライ：指数バックオフ＋フルジッタ。同期/非同期関数をラップし、再試行回数やログフックを指定可能にする。
export type RetryOptions = {
  retries: number;        // 試行回数（失敗後の再試行の回数ではなく合計回数）
  baseMs?: number;        // 初回待機（指数の基点）
  maxMs?: number;         // 待機の上限
  factor?: number;        // 指数倍率
  jitter?: boolean;       // フルジッタを入れるか
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const {
    retries,
    baseMs = 300,
    maxMs = 5000,
    factor = 2,
    jitter = true,
    onRetry,
  } = opts;

  let attempt = 0;
  while (true) {
    try {
      attempt++;
      return await fn();
    } catch (err) {
      if (attempt >= retries) throw err;
      const backoff = Math.min(baseMs * Math.pow(factor, attempt - 1), maxMs);
      const delay = jitter ? Math.random() * backoff : backoff;
      onRetry?.(err, attempt, Math.round(delay));
      await sleep(delay);
    }
  }
}
``