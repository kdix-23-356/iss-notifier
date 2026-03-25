// path: src/notify/slack.ts
/**
 * Slack Webhook 送信ユーティリティ。
 * 従来のプレーンテキスト送信用の notifySlack に加え、
 * Block Kit ペイロードを直接渡せる postSlack を提供する。
 */
// path: src/notify/slack.ts
// 後方互換のための notifySlack を再公開する（内部的には堅牢化済み postSlack を呼ぶ）。
// 既存コードが import { notifySlack } from "../notify/slack" を想定しているための暫定措置。
// FIXME: すべての呼び出しを postSlack に移行できたら、このラッパーは削除してよい。
import { fetchWithTimeout } from "../lib/http";
import { retry } from "../lib/retry";
import { RETRY_CONFIG_STANDARD } from "../lib/retryConfig";
import { log } from "../lib/log";

export type SlackPayload = Record<string, unknown>;

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

export async function postSlack(payload: SlackPayload): Promise<number> {
  if (!SLACK_WEBHOOK_URL) {
    log.error("slack.config.missing");
    return 0;
  }

  try {
    const res = await retry(
      () =>
        fetchWithTimeout(SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
          timeoutMs: 5000,
        }),
      {
        ...RETRY_CONFIG_STANDARD,
        onRetry: (err, attempt, delayMs) =>
          log.warn("slack.post.retry", {
            attempt,
            delayMs,
            err: err instanceof Error ? err.name : String(err),
          }),
      }
    );
    return res.status;
  } catch (err) {
    log.error("slack.post.failed", {
      err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return 0;
  }
}
