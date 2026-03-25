// src/core/predictPasses.ts
import {
  twoline2satrec, propagate, gstime,
  eciToEcf, ecfToLookAngles
} from "satellite.js";
import type { Station } from "../stations";

export type Pass = { aos: Date; los: Date; tca: Date; maxEl: number };

/**
 * パス予測エンジン
 *
 *  - TLE (Two-Line Element) から軌道を生成
 *  - 指定ウィンドウを dtSec 秒刻みでスキャンし、観測地における AOS/LOS を検出
 *  - AOS しきい値を越えた区間を1パスとみなす
 *  - TCA は最大仰角到達時刻（peak）
 *  - 出力は見つかったパス列（AOS/L0S/TCA/maxEl）
 */
export function findPasses(
  tle1: string, tle2: string, station: Station,
  windowStart: Date, windowEnd: Date,
  aosThresholdDeg = 10
): Pass[] {
  // TLE 文字列から衛星軌道を生成
  const satrec = twoline2satrec(tle1, tle2);

  // 5秒刻みで計算
  // ※精度/性能トレードオフ。短いウィンドウでは dtSec=1 に調整可能
  const dtSec = 5;

  // station 位置をラジアン・km で準備
  const site = {
    longitude: station.lon * Math.PI / 180,
    latitude:  station.lat * Math.PI / 180,
    height:    (station.elevationM ?? 0) / 1000
  };

  // パス検出状態
  let inView = false;
  let cur: { aos?: Date; tca?: Date; peak?: number } = {};
  const out: Pass[] = [];

  for (let t = +windowStart; t <= +windowEnd; t += dtSec * 1000) {
    const date = new Date(t);

    // 衛星位置を ECI で取得
    const pv = propagate(satrec, date);
    if (!pv || !pv.position) continue;

    // 地球固定座標に変換して仰角を取得
    const gmst = gstime(date);
    const ecf = eciToEcf(pv.position, gmst);
    const look = ecfToLookAngles(site, ecf);
    const elDeg = look.elevation * 180 / Math.PI;

    // AOS 検出 (視野内に入った瞬間)
    if (!inView && elDeg >= aosThresholdDeg) {
      inView = true;
      cur = { aos: date, tca: date, peak: elDeg };

    // 既に視野内であれば TCA と LOS 判定
    } else if (inView) {
      // 最大仰角の更新（TCA 候補）
      if (elDeg > (cur.peak ?? -90)) {
        cur.peak = elDeg;
        cur.tca = date;
      }

      // しきい値以下になったら LOS -> パス完了
      if (elDeg < aosThresholdDeg) {
        inView = false;
        out.push({ aos: cur.aos!, los: date, tca: cur.tca!, maxEl: cur.peak! });
        cur = {};
      }
    }
  }

  return out;
}