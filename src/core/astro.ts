// src/core/astro.ts
/**
 * SunCalc を用いて、観測地での太陽高度・薄明種別を計算する。
 * 薄明の分類:
 *   0°以上: "day"
 *   -6°以上: "civil"       （市民薄明）
 *   -12°以上: "nautical"   （航海薄明）
 *   -18°以上: "astronomical"（天文薄明）
 *   それより低い: "night"
 *
 * 参考: SunCalc README, getPosition / getTimes:
 * https://www.npmjs.com/package/suncalc
 * https://github.com/mourner/suncalc/blob/master/README.md
 */
import SunCalc from "suncalc";

export type SunState = {
  sunAltDeg: number;                 // 観測地での太陽高度（度）
  twilight: "day" | "civil" | "nautical" | "astronomical" | "night";
};

export function getSunState(whenUtc: Date, lat: number, lon: number): SunState {
  const pos = SunCalc.getPosition(whenUtc, lat, lon);
  const altDeg = pos.altitude * 180 / Math.PI;

  let twilight: SunState["twilight"];
  if (altDeg >= 0) twilight = "day";
  else if (altDeg >= -6) twilight = "civil";
  else if (altDeg >= -12) twilight = "nautical";
  else if (altDeg >= -18) twilight = "astronomical";
  else twilight = "night";

  return { sunAltDeg: altDeg, twilight };
}