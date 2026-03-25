/**
 * リトライ戦略のプリセット
 *
 * 外部API呼び出しで統一されたリトライ設定を使用。
 * 環境や呼び出し側の特性に応じて調整可能。
 */

import type { RetryOptions } from "./retry";

/**
 * 標準リトライ: 3回試行、初期待機 400ms、最大 4s
 * 用途：一般的な HTTP API (Open-Meteo など)
 */
export const RETRY_CONFIG_STANDARD: RetryOptions = {
  retries: 3,
  baseMs: 400,
  maxMs: 4000,
  factor: 2,
  jitter: true,
};

/**
 * 保守的なリトライ: 3回試行、初期待機 500ms、最大 5s
 * 用途：外部サービスが不安定な可能性がある場合 (TLE API など)
 */
export const RETRY_CONFIG_CONSERVATIVE: RetryOptions = {
  retries: 3,
  baseMs: 500,
  maxMs: 5000,
  factor: 2,
  jitter: true,
};

/**
 * 即座なリトライ: 2回試行、初期待機 200ms、最大 1s
 * 用途：高速応答種 (健康チェック等) で素早く fail-fast したい場合
 */
export const RETRY_CONFIG_FAST: RetryOptions = {
  retries: 2,
  baseMs: 200,
  maxMs: 1000,
  factor: 2,
  jitter: true,
};
