// path: src/core/score.ts
/**
 * 観測可否スコアリングのユーティリティ。
 * 仰角・気象・光環境の3要素から 0–100 のスコアと判定を返す。
 * ルールは実運用でのフィードバックに応じて係数・閾値を調整可能。
 */

import type { WeatherSample } from "./fetchWeather"; // 既存の定義を参照
import type { SunState } from "./astro";             // 既存の定義を参照

/**
 * スコアリング結果を表す型。
 */
export type ScoreResult = {
  score: number;                       // 0–100: 総合スコア
  decision: "OK" | "WARN" | "NG";      // 最終判定
  breakdown: {                         // 詳細内訳（監査・チューニング用）
    geometry: number;                  // 0–40: 幾何学的条件（仰角）
    weather: number;                   // 0–40: 気象条件
    light: number;                     // 0–20: 光害・背景光条件
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
 * @param maxElDeg パスの最大仰角（度）。高いほど見やすい。
 * @param wx Open-Meteo から取得した気象情報 (nullは不明扱い)。
 * @param sun 観測時の太陽高度/薄明情報。
 *
 * @returns 0-100 のスコアと判定OK/WARN/NG、および各要素の内訳。
 */
export function scoreObservation(
  maxElDeg: number,
  wx: WeatherSample | null,
  sun: SunState
): ScoreResult {
  // --- 幾何（最大仰角）: 40点満点 ---
  // 20°未満は建物や樹木に隠れやすいため0点。
  // 60°以上は十分に高く、観測条件として申し分ないため満点(40点)。
  // 20°から60°の間を線形に補間する。
  const geom = clamp(scaleLinear(maxElDeg, 20, 60, 0, 40), 0, 40);

  // --- 気象: 40点満点 ---
  // 天気情報が取得できなかった場合は0点とする。
  let weather = 0;
  if (wx) {
    // 雲量: 0%で25点、100%で0点。雲が多いほどスコアが下がる。
    if (typeof wx.cloudcover === "number") {
      weather += clamp(25 - 0.25 * wx.cloudcover, 0, 25);
    }
    // 視程: 10km以上で満点(10点)。視程が悪いとスコアが下がる。
    if (typeof wx.visibility === "number") {
      weather += clamp(scaleLinear(wx.visibility, 0, 10_000, 0, 10), 0, 10);
    }
    // 風速: 5m/s までは減点なし。15m/sで-5点、25m/sで-10点。
    // (望遠鏡の揺れなどを考慮)
    if (typeof wx.windspeed10m === "number") {
      const over = Math.max(0, wx.windspeed10m - 5);
      // 5m/sを超えた分について、2m/sあたり1点減点し、合計スコアから引く
      const windPenalty = (clamp(10 - over * 0.5, 0, 10) - 10); // 5m/sのとき0点、15m/sのとき-5点...
      weather += windPenalty;
      weather = Math.max(weather, 0);
    }
    // 降水: 少しでも降水があれば大きく減点(-10点)。
    if (typeof wx.precipitation === "number" && wx.precipitation > 0) {
      weather -= 10;
      weather = Math.max(weather, 0);
    }
  }
  weather = clamp(weather, 0, 40);

  // --- 光環境: 20点満点 ---
  // 太陽高度(sun altitude degree)に基づいて評価。
  const s = sun.sunAltDeg;
  let light = 0;
  // -6°(市民薄明)から-20°の間が観測に適した時間帯。
  // -10°あたりをピークに、明るすぎず暗すぎない状態を最高評価(20点)とする。
  if (s <= -6 && s >= -20) {
    // -10°から離れるほどスコアが下がる
    light = 20 - Math.abs(s + 10);
    light = clamp(light, 0, 20);
  // -20°以下は完全に夜だが、低空の光害などを考慮し少し減点した12点を固定で与える。
  } else if (s < -20) {
    light = 12;
  // -6°以上は空が明るすぎるため0点。
  } else {
    light = 0;
  }

  const score = Math.round(clamp(geom + weather + light, 0, 100));
  // 総合スコアに基づき最終判定
  const decision = score >= 70 ? "OK" : score >= 50 ? "WARN" : "NG";

  return { score, decision, breakdown: { geometry: Math.round(geom), weather: Math.round(weather), light: Math.round(light) } };
}

/**
 * 線形補間を行うユーティリティ関数。
 * @param x 入力値
 * @param inMin 入力値の最小
 * @param inMax 入力値の最大
 * @param outMin 出力値の最小
 * @param outMax 出力値の最大
 * @returns 補間された値
 */
function scaleLinear(x: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = (x - inMin) / (inMax - inMin);
  return outMin + t * (outMax - outMin);
}

/**
 * 値を最小値と最大値の間にクランプ（制限）するユーティリティ関数。
 * @param v 制限する値
 * @param min 最小値
 * @param max 最大値
 * @returns クランプされた値
 */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}