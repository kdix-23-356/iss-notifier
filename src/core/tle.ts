/**
 * ISS の TLE を取得・保持するクラス
 *
 * グローバル状態を廃止し、インスタンスベースで管理
 * テストや複数衛星対応にも容易に拡張可能
 */
import { ISS_TLE as FALLBACK_TLE } from "../iss-tle";
import { fetchWithTimeout } from "../lib/http";
import { retry } from "../lib/retry";
import { RETRY_CONFIG_CONSERVATIVE } from "../lib/retryConfig";
import { log } from "../lib/log";

export type Tle = { line1: string; line2: string };

class TleManager {
  private currentTle: Tle;
  private lastUpdatedMs: number = 0;

  constructor(fallbackTle: Tle = FALLBACK_TLE) {
    this.currentTle = fallbackTle;
  }

  /**
   * 現在の TLE を取得
   */
  getCurrent(): Tle {
    return this.currentTle;
  }

  /**
   * 鮮度チェック + 必要に応じて更新
   * @param maxAgeMinutes TLE の許容最大年齢（分）
   */
  async ensureFresh(maxAgeMinutes = 30): Promise<void> {
    const now = Date.now();
    if (now - this.lastUpdatedMs < maxAgeMinutes * 60_000) return;

    try {
      const tle = await this.fetchFromWheretheiss();
      if (tle) {
        this.currentTle = tle;
        this.lastUpdatedMs = now;
        log.info("tle.updated", { ageMin: maxAgeMinutes });
      } else {
        log.warn("tle.update.skipped", { reason: "no data" });
      }
    } catch (err) {
      log.warn("tle.update.failed", {
        err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      });
    }
  }

  /**
   * wheretheiss API から TLE を取得
   */
  private async fetchFromWheretheiss(): Promise<Tle | null> {
    const url = "https://api.wheretheiss.at/v1/satellites/25544/tles";

    try {
      const res = await retry(
        () => fetchWithTimeout(url, { timeoutMs: 5000 }),
        {
          ...RETRY_CONFIG_CONSERVATIVE,
          onRetry: (err, attempt, delayMs) =>
            log.warn("tle.fetch.retry", {
              attempt,
              delayMs,
              err: err instanceof Error ? err.name : String(err),
            }),
        }
      );

      const ct = res.headers.get("content-type") ?? "";
      const text = await res.text();

      // プレーンテキスト形式
      const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const l1 = lines.find((l) => l.startsWith("1 "));
      const l2 = lines.find((l) => l.startsWith("2 "));
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
          // JSONとしてパース失敗
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
}

// グローバル singleton インスタンス（後方互換性のため）
const tleManager = new TleManager();

/**
 * 後方互換レイヤー（既存 API を保持）
 */
export function getCurrentTle(): Tle {
  return tleManager.getCurrent();
}

export async function ensureTleFresh(maxAgeMinutes = 30): Promise<void> {
  await tleManager.ensureFresh(maxAgeMinutes);
}

/**
 * 新規パターン: DI に対応したマネージャーの直接利用
 */
export { TleManager };