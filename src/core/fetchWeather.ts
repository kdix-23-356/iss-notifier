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
import { log } from "../lib/log";
import { ParseError } from "../lib/errors";

// 既存の型定義（抜粋）。ファイル内に既にある場合は重複しないよう調整してください。
export type WeatherSample = {
  time: string;             // ISO8601, UTC
  cloudcover?: number;      // %
  precipitation?: number;   // mm
  visibility?: number;      // m
  windspeed10m?: number;    // m/s
};

function nearestHourIsoUtc(d: Date): string {
  const round = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(), 0, 0, 0
  ));
  const delta = d.getUTCMinutes() * 60 + d.getUTCSeconds();
  if (delta >= 30 * 60) {
    round.setUTCHours(round.getUTCHours() + 1);
  }
  return round.toISOString().slice(0, 13);
}

// ネットワーク健全性の強化（タイムアウト/リトライ/詳細ログ）
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
      () => fetchWithTimeout(url, { timeoutMs: 5000 }), // 5sタイムアウト
      {
        retries: 3,                    // 合計3回（初回＋再試行2回）
        baseMs: 400,
        maxMs: 4000,
        factor: 2,
        jitter: true,
        onRetry: (err, attempt, delayMs) =>
          log.warn("weather.fetch.retry", {
            url, attempt, delayMs,
            err: err instanceof Error ? err.name : String(err),
          }),
      }
    );

    const text = await res.text();
    // 念のためJSON/テキスト双方に対応
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      // JSONでなければそのままテキスト解析（既存実装の互換維持）
      json = { hourly: { time: text.split(/\r?\n/).map(s => s.trim()).filter(Boolean) } };
    }

    const times: string[] = json?.hourly?.time ?? [];
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

    const h = json.hourly;
    const sample: WeatherSample = {
      time: pickedTime,
      cloudcover: h.cloudcover?.[idx],
      precipitation: h.precipitation?.[idx],
      visibility: h.visibility?.[idx],
      windspeed10m: (h.windspeed_10m ?? h.windspeed10m)?.[idx], // 入力ゆらぎに寛容に
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