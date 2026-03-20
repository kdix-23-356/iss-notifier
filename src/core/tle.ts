// src/core/tle.ts
/**
 * ISS の TLE を取得・保持するユーティリティ。
 * 取得先: https://api.wheretheiss.at/v1/satellites/25544/tles
 * 返却形式は実装依存のため、JSON とプレーンテキストの双方を許容し、
 * "1 " と "2 " で始まる行を抽出してパースする。
 *
 * 参考: where the iss at? API ドキュメント:
 * https://wheretheiss.at/w/developer
 */
// TLE取得の堅牢化：タイムアウト＋指数バックオフ、握りつぶしを廃止して警告ログを残す。
// 既存の公開関数（ensureTleFresh, getCurrentTle）の契約は維持する。
import { ISS_TLE as FALLBACK_TLE } from "../iss-tle";
import { fetchWithTimeout } from "../lib/http";
import { retry } from "../lib/retry";
import { log } from "../lib/log";

export type Tle = { line1: string; line2: string };

let currentTle: Tle = FALLBACK_TLE;
let lastUpdatedMs = 0;

export function getCurrentTle(): Tle {
  return currentTle;
}

export async function ensureTleFresh(maxAgeMinutes = 30): Promise<void> {
  const now = Date.now();
  if (now - lastUpdatedMs < maxAgeMinutes * 60_000) return;

  try {
    const tle = await fetchTleFromWheretheiss();
    if (tle) {
      currentTle = tle;
      lastUpdatedMs = now;
      log.info("tle.updated", { ageMin: maxAgeMinutes });
    } else {
      log.warn("tle.update.skipped", { reason: "no data" });
    }
  } catch (err) {
    // 旧実装は握りつぶしていた。ここでは警告ログを必ず残す。
    log.warn("tle.update.failed", {
      err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
  }
}

async function fetchTleFromWheretheiss(): Promise<Tle | null> {
  const url = "https://api.wheretheiss.at/v1/satellites/25544/tles";

  try {
    const res = await retry(
      () => fetchWithTimeout(url, { timeoutMs: 5000 }),
      {
        retries: 3,
        baseMs: 500,
        maxMs: 5000,
        factor: 2,
        jitter: true,
        onRetry: (err, attempt, delayMs) =>
          log.warn("tle.fetch.retry", {
            attempt, delayMs,
            err: err instanceof Error ? err.name : String(err),
          }),
      }
    );

    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();

    // プレーンテキスト形式
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const l1 = lines.find(l => l.startsWith("1 "));
    const l2 = lines.find(l => l.startsWith("2 "));
    if (l1 && l2) return { line1: l1, line2: l2 };

    // JSON形式
    if (ct.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
      try {
        const json = JSON.parse(text);
        const str = JSON.stringify(json);
        const m1 = str.match(/1\s+25544[^\n\\"]+/);
        const m2 = str.match(/2\s+25544[^\n\\"]+/);
        if (m1 && m2) return { line1: m1[0], line2: m2[0] };
      } catch {
        // JSONとしてパース失敗 → 下でログしてnull返す
      }
    }

    log.warn("tle.parse.failed", { url });
    return null;
  } catch (err) {
    log.error("tle.fetch.failed", {
      url,
      err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return null;
  }
}