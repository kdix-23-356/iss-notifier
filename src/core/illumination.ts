// path: src/core/illumination.ts
/**
 * ISS 日照判定（円柱影近似）。
 * satellite.js の sunPos と propagate を用いて、ECI 幾何から地球影内かを判定する。
 *
 * 前提:
 *  - 近似として地球影を円柱で扱う（本影・半影の詳細は考慮しない）。
 *  - 判定は観測者の位置に依らない、純粋な天体幾何。
 *
 * 参考:
 *  - satellite.js v6 概要（sunPos を提供）
 *  - 典型的な地球影内判定の幾何（円柱影近似）
 */
import * as sat from "satellite.js";

export type Illumination = {
  sunlit: boolean;    // 太陽光に照らされているか
  eclipsed: boolean;  // 地球影内か（sunlit の否定）
  distanceToSunAxisKm: number; // 直線 L=ŝa に対する垂線距離（km）
  nightSide: boolean; // ŝ との内積符号で暗側かどうか
};

const EARTH_RADIUS_KM = 6378.137; // WGS-84 長半径近似（km）。影判定の閾値として使用。

/**
 * 与えられた TLE と時刻での衛星日照状態を判定する。
 * @param tle1 TLE line 1
 * @param tle2 TLE line 2
 * @param when 時刻（UTC）
 */
export function getIllumination(tle1: string, tle2: string, when: Date): Illumination | null {
  // TLE から SGP4 の衛星レコードを生成
  const satrec = sat.twoline2satrec(tle1, tle2);

  // 衛星の ECI 位置を取得。エラー時は null が返る可能性があるため防御的に扱う。
  const pv = sat.propagate(satrec, when);
  if (!pv || !pv.position) return null;

  // 太陽ベクトル（ECI, km）を取得。satellite.js v6 の sunPos を any 扱いで呼び出す。
  // 型定義が無い可能性があるため any 経由で安全に呼ぶ。
  const sunAny: any = (sat as any).sunPos?.(when);
  if (!sunAny || typeof sunAny.x !== "number") {
    // sunPos が利用できない場合は判定不能とする。
    return null;
  }

  const r = pv.position;             // 衛星の ECI 位置ベクトル（km）
  const s = { x: sunAny.x, y: sunAny.y, z: sunAny.z }; // 太陽ベクトル（地心→太陽, km）

  // 太陽方向の単位ベクトル ŝ を計算
  const sNorm = Math.hypot(s.x, s.y, s.z);
  if (sNorm === 0) return null;
  const sh = { x: s.x / sNorm, y: s.y / sNorm, z: s.z / sNorm };

  // 内積 r⋅ŝ（符号で昼夜側を判定）
  const dot = r.x * sh.x + r.y * sh.y + r.z * sh.z;
  const nightSide = dot < 0;

  // 直線 L=ŝa に対する垂線距離 d = || r - (r⋅ŝ) ŝ ||
  const proj = { x: dot * sh.x, y: dot * sh.y, z: dot * sh.z };
  const dx = r.x - proj.x;
  const dy = r.y - proj.y;
  const dz = r.z - proj.z;
  const d = Math.hypot(dx, dy, dz);

  // 円柱影近似: 夜側かつ d < R⊕ で地球影内とみなす。
  const eclipsed = nightSide && d < EARTH_RADIUS_KM;
  const sunlit = !eclipsed;

  return {
    sunlit,
    eclipsed,
    distanceToSunAxisKm: d,
    nightSide
  };
}
``