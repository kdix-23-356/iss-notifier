/**
 * Zod スキーマ定義
 * 外部データ (Open-Meteo API, DBレコード, Slack Webhook) の入出力バリデーション
 */
import { z } from "zod";

/**
 * Open-Meteo Hourly Weather API レスポンス スキーマ
 * タイムスタンプと天気データ（雲量、可視距離、風速、降水）の妥当性をチェック
 */
export const WeatherSampleSchema = z.object({
  time: z.string().datetime(),
  cloudcover: z.number().int().gte(0).lte(100),
  visibility: z.number().gte(0).lte(10000),
  windspeed10m: z.number().gte(0),
  precipitation: z.number().gte(0),
});

export type WeatherSample = z.infer<typeof WeatherSampleSchema>;

/**
 * Open-Meteo API response wrapper
 */
export const OpenMeteoResponseSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  /** Open-Meteo APIからの時間単位の気象データ */
  hourly: z.object({
    /** 時間の配列 (ISO 8601形式) */
    time: z.array(z.string().datetime()),
    /** 雲量 (%) */
    cloudcover: z.array(z.number()),
    /** 視程 (メートル) */
    visibility: z.array(z.number()),
    /** 地上10mの風速 (m/s) */
    wind_speed_10m: z.array(z.number()),
    /** 降水量 (mm) */
    precipitation: z.array(z.number()),
  }),
});

export type OpenMeteoResponse = z.infer<typeof OpenMeteoResponseSchema>;

/**
 * ISS pass 予報オプション スキーマ
 * API エンドポイント /passes/:stationId からのリクエストパラメータ
 */
export const PassForecastOptionsSchema = z.object({
  /** 予報期間（時間） */
  windowHours: z.number().int().positive(),
  /** パスを検出する最小仰角（度） */
  aosDeg: z.number().gte(0).lte(90),
  /** 診断情報をレスポンスに含めるか */
  diagnostics: z.boolean().optional().default(false),
});

export type PassForecastOptions = z.infer<typeof PassForecastOptionsSchema>;

/**
 * DB notified_pass レコード
 */
export const NotifiedPassRecordSchema = z.object({
  /** 地上局ID */
  station_id: z.string(),
  /** パスの最大接近時刻 (UTC) */
  tca_utc: z.string().datetime(),
  /** 通知実行時刻 (UTC) */
  notified_at: z.string().datetime(),
});

export type NotifiedPassRecord = z.infer<typeof NotifiedPassRecordSchema>;

/**
 * Slack Block Kit payload スキーマ
 * windowInfo, tracker URL がチェックされて安全に送信される
 */
export const SlackBlockKitPayloadSchema = z.object({
  blocks: z.array(z.record(z.unknown())),
});

export type SlackBlockKitPayload = z.infer<typeof SlackBlockKitPayloadSchema>;

/**
 * バリデーション ヘルパー
 * 失敗時は構造化ログで詳細エラーを記録
 */

/**
 * WeatherSample オブジェクトを検証します。
 * @param data 検証するデータ
 * @returns 検証済みの WeatherSample オブジェクト、または検証失敗時に null
 */
export function validateWeatherSample(data: unknown): WeatherSample | null {
  try {
    return WeatherSampleSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error("❌ Weather sample validation failed:", {
        msg: "Invalid weather data from Open-Meteo",
        level: "warn",
        errors: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
          code: e.code,
        })),
      });
    }
    return null;
  }
}

/**
 * OpenMeteo API のレスポンスを検証します。
 * @param data 検証するデータ
 * @returns 検証済みの OpenMeteoResponse オブジェクト、または検証失敗時に null
 */
export function validateOpenMeteoResponse(
  data: unknown
): OpenMeteoResponse | null {
  try {
    return OpenMeteoResponseSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error("❌ OpenMeteo response validation failed:", {
        msg: "Invalid OpenMeteo API response",
        level: "error",
        errors: err.errors.map((e) => ({
          path: e.path.join("."),
          message: e.message,
        })),
      });
    }
    return null;
  }
}

/**
 * パス予報のオプションを検証します。
 * @param data 検証するデータ
 * @returns 検証済みの PassForecastOptions オブジェクト。検証失敗時は ZodError をスローします。
 */
export function validatePassForecastOptions(
  data: unknown
): PassForecastOptions {
  // throws ZodError if invalid; not optional
  return PassForecastOptionsSchema.parse(data);
}
