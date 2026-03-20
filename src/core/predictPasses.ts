// src/core/predictPasses.ts
import {
  twoline2satrec, propagate, gstime,
  eciToEcf, ecfToLookAngles
} from "satellite.js";
import type { Station } from "../stations";

export type Pass = { aos: Date; los: Date; tca: Date; maxEl: number };

export function findPasses(
  tle1: string, tle2: string, station: Station,
  windowStart: Date, windowEnd: Date,
  aosThresholdDeg = 10
): Pass[] {
  const satrec = twoline2satrec(tle1, tle2);
  const dtSec = 5;
  const site = {
    longitude: station.lon * Math.PI / 180,
    latitude:  station.lat * Math.PI / 180,
    height:    (station.elevationM ?? 0) / 1000
  };
  let inView = false;
  let cur: { aos?: Date; tca?: Date; peak?: number } = {};
  const out: Pass[] = [];

  for (let t = +windowStart; t <= +windowEnd; t += dtSec * 1000) {
    const date = new Date(t);
    const pv = propagate(satrec, date);
    if (!pv || !pv.position) continue;
    const gmst = gstime(date);
    const ecf = eciToEcf(pv.position, gmst);
    const look = ecfToLookAngles(site, ecf);
    const elDeg = look.elevation * 180 / Math.PI;

    if (!inView && elDeg >= aosThresholdDeg) {
      inView = true;
      cur = { aos: date, tca: date, peak: elDeg };
    } else if (inView) {
      // TCA 更新
      if (elDeg > (cur.peak ?? -90)) {
        cur.peak = elDeg;
        cur.tca = date;
      }
      // LOS 検出
      if (elDeg < aosThresholdDeg) {
        inView = false;
        out.push({ aos: cur.aos!, los: date, tca: cur.tca!, maxEl: cur.peak! });
        cur = {};
      }
    }
  }

  return out;
}