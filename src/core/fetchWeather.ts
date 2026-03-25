// src/core/fetchWeather.ts
/**
 * Open‑Meteo から任意緯度経度・時刻（UTC）での時間値を取得し、
 * TCA 近傍の 1 時間バケットを抽出して返す。
 *
 * 参考: Open‑Meteo ドキュメント（hourly 変数、timezone、timeformat）
 * - https://open-meteo.com/en/docs
 */
// Open-Meteo呼び出しをタイムアウト＋指数バックオフで堅牢化。
import { fetchWithTimeout } from "../lib/http";
import { retry } from "../lib/retry";
import { RETRY_CONFIG_STANDARD } from "../lib/retryConfig";
import { log } from "../lib/log";
import { ParseError } from "../lib/errors";
import { validateOpenMeteoResponse } from "../lib/schemas";
import type { OpenMeteoResponse } from "../lib/schemas";

// 既存の型定義（抜粋）。ファイル内に既にある場合は重複しないよう調整してください。
export type WeatherSample = {
  time: string;                              // ISO8601, UTC
  cloudcover: number | undefined;            // %, undefined if unavailable
  precipitation: number | undefined;         // mm, undefined if unavailable
  visibility: number | undefined;            // m, undefined if unavailable
  windspeed10m: number | undefined;          // m/s, undefined if unavailable
};

/**
 * UTC時刻を最寄り1時間バケットに丸める
 * 例: 2024-01-01T00:26:00Z -> 2024-01-01T00
 *     2024-01-01T00:31:00Z -> 2024-01-01T01
 *
 * @param d 参照時刻 (UTC)
 * @returns "YYYY-MM-DDTHH" 形式
 */
function nearestHourIsoUtc(d: Date): string {
  const round = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(), 0, 0, 0
  ));
  const delta = d.getUTCMinutes() * 60 + d.getUTCSeconds();

  // 30分以上で次時刻に丸める (四捨五入)
  if (delta >= 30 * 60) {
    round.setUTCHours(round.getUTCHours() + 1);
  }
  return round.toISOString().slice(0, 13);
}

// ネットワーク健全性の強化（タイムアウト/リトライ/詳細ログ）
/**
 * 指定位置・時刻の気象情報を Open-Meteo から取得
 *
 * 1) API へ GET 送信 (timeformat=ISO8601, timezone=UTC)
 * 2) タイムアウト(RETRY) + 3段階リトライ
 * 3) 時刻一致 or 近傍時刻選択
 * 4) 情報を WeatherSample に整形
 * 5) 例外時はログを残し null を返す
 */
export async function getWeatherAt(
  lat: number,
  lon: number,
  whenUtc: Date
): Promise<WeatherSample | null> {
  const base = "https://api.open-meteo.com/v1/forecast";
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: "cloudcover,precipitation,visibility,windspeed_10m",
    timeformat: "iso8601",
    timezone: "UTC",
  });
  const url = `${base}?${params.toString()}`;

  try {
    const res = await retry(
      () => fetchWithTimeout(url, { timeoutMs: 5000 }),
      {
        ...RETRY_CONFIG_STANDARD,
        onRetry: (err, attempt, delayMs) =>
          log.warn("weather.fetch.retry", {
            url,
            attempt,
            delayMs,
            err: err instanceof Error ? err.name : String(err),
          }),
      }
    );

    const text = await res.text();

    // Open-Meteo は通常 JSON を返すが、予期しない文字列が返る可能性があるため
    // フォールバックとして改行区切り時刻リストを扱う旧実装互換パスを維持
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = { hourly: { time: text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) } };
    }

    // Zod スキーマでバリデーション（失敗時は null だが、後続の時刻チェックで適切に処理）
    const validated = validateOpenMeteoResponse(json);
    if (!validated) {
      throw new ParseError(url, "OpenMeteo response validation failed");
    }

    const times: string[] = validated.hourly.time ?? [];
    if (!Array.isArray(times) || times.length === 0) {
      throw new ParseError(url, "hourly.time is empty or not array");
    }

    const targetHour = nearestHourIsoUtc(whenUtc); // "YYYY-MM-DDTHH"
    let idx = times.findIndex((t: string) => t?.startsWith?.(targetHour));
    if (idx < 0) {
      // 近傍検索（既存互換）
      const targetMs = whenUtc.getTime();
      let best = -1;
      let bestDiff = Number.POSITIVE_INFINITY;
      for (let i = 0; i < times.length; i++) {
        const ms = Date.parse(times[i] + ":00Z");
        const diff = Math.abs(ms - targetMs);
        if (diff < bestDiff) { best = i; bestDiff = diff; }
      }
      idx = best;
    }
    if (idx < 0 || idx >= times.length) {
      throw new ParseError(url, "bucket index out of range");
    }

    // ここまでで idx は有効。TypeScript には明示的に存在を示す。
    const pickedTime = times[idx];
    if (typeof pickedTime !== "string") return null;

    const h = validated.hourly;
    const sample: WeatherSample = {
      time: pickedTime,
      cloudcover: h.cloudcover?.[idx],
      precipitation: h.precipitation?.[idx],
      visibility: h.visibility?.[idx],
      windspeed10m: h.wind_speed_10m?.[idx], // 検証済みのキー名を使用
    };

    // 単位・範囲の軽い妥当性チェック（厳格化は今後の課題）
    if (typeof sample.cloudcover === "number" && (sample.cloudcover < 0 || sample.cloudcover > 100)) {
      log.warn("weather.parse.anomaly", { url, field: "cloudcover", value: sample.cloudcover });
    }

    return sample;
  } catch (err) {
    // swallowしない：詳細を構造化ログに残し、呼び出し側のフォールバック判断のためにnullを返す。
    log.error("weather.fetch.failed", {
      url,
      lat, lon,
      whenUtc: whenUtc.toISOString(),
      err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
    });
    return null;
  }
}