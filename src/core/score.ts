// path: src/core/score.ts
/**
 * 観測可否スコアリングのユーティリティ。
 * 仰角・気象・光環境の3要素から 0–100 のスコアと判定を返す。
 * ルールは実運用でのフィードバックに応じて係数・閾値を調整可能。
 */

import type { WeatherSample } from "./fetchWeather"; // 既存の定義を参照
import type { SunState } from "./astro";             // 既存の定義を参照

export type ScoreResult = {
  score: number;                       // 0–100
  decision: "OK" | "WARN" | "NG";      // 判定
  breakdown: {                         // 詳細内訳（監査・チューニング用）
    geometry: number;                  // 0–40
    weather: number;                   // 0–40
    light: number;                     // 0–20
  };
};

/**
 * スコアリング本体。
 * @param maxElDeg パスの最大仰角（度）
 * @param wx 天気サンプル（Open‑Meteoの近傍1時間バケット）
 * @param sun 観測地での太陽高度・薄明
 */
/**
 * 観測スコアを計算する
 *
 * maxElDeg: 天頂角の指標 (大きいほど可視性良好)
 * wx: Open-Meteo から取得した気象情報 (nullは不明扱い)
 * sun: 観測時の太陽高度/薄明情報
 *
 * 返却は 0-100 のスコアと判定OK/WARN/NG、および各要素の内訳
 */
export function scoreObservation(
  maxElDeg: number,
  wx: WeatherSample | null,
  sun: SunState
): ScoreResult {
  // 幾何（最大仰角）: 20°→0点、60°→40点の線形補間
  // 0-40 の範囲でクランプ
  const geom = clamp(scaleLinear(maxElDeg, 20, 60, 0, 40), 0, 40);

  // 気象: 雲量・降水・視程・風速を合成。単純加減点のMVP実装。
  let weather = 0;
  if (wx) {
    // 雲量: 0%→+25点、100%→0点の線形補間
    if (typeof wx.cloudcover === "number") {
      weather += clamp(25 - 0.25 * wx.cloudcover, 0, 25);
    }
    // 視程: 0→0点、10km以上→+10点の線形補間（メートル単位）
    if (typeof wx.visibility === "number") {
      weather += clamp(scaleLinear(wx.visibility, 0, 10_000, 0, 10), 0, 10);
    }
    // 風速: 5m/s までは減点なし、15m/s で最大 -10 点
    if (typeof wx.windspeed10m === "number") {
      const over = Math.max(0, wx.windspeed10m - 5);
      weather += clamp(10 - over * 0.5, 0, 10) - 10;
      weather = Math.max(weather, 0);
    }
    // 降水: >0 mm なら強い減点
    if (typeof wx.precipitation === "number" && wx.precipitation > 0) {
      weather -= 10;
      weather = Math.max(weather, 0);
    }
  }
  weather = clamp(weather, 0, 40);

  // 光環境: 太陽高度による評価
  // - (~-10°) が最も暗く、観測がしやすい。-6°以上は日中でNG
  // - -20°以下は暗くて見通しがいいが、大気条件などで低減を固定 (12点)
  const s = sun.sunAltDeg;
  let light = 0;
  if (s <= -6 && s >= -20) {
    light = 20 - Math.abs(s + 10);
    light = clamp(light, 0, 20);
  } else if (s < -20) {
    light = 12;
  } else {
    light = 0;
  }

  const score = Math.round(clamp(geom + weather + light, 0, 100));
  const decision = score >= 70 ? "OK" : score >= 50 ? "WARN" : "NG";

  return { score, decision, breakdown: { geometry: Math.round(geom), weather: Math.round(weather), light: Math.round(light) } };
}

function scaleLinear(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = (x - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}