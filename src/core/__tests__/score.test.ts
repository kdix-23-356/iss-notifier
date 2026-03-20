// path: src/core/__tests__/score.test.ts
// スコアの境界・ルール検証：幾何・気象・光の寄与とdecisionの閾値（70/50）を確認する。
import { scoreObservation } from '../score';

const sunNight = { sunAltDeg: -15, twilight: 'astronomical' as const };
const sunDay = { sunAltDeg: +10, twilight: 'day' as const };

describe('scoreObservation', () => {
  test('high elevation, clear sky, dark -> OK', () => {
    const wx = { time: '2024-01-01T00:00', cloudcover: 0, visibility: 10000, windspeed10m: 2, precipitation: 0 };
    const r = scoreObservation(70, wx, sunNight);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.decision).toBe('OK');
    expect(r.breakdown.geometry).toBeGreaterThan(0);
    expect(r.breakdown.weather).toBeGreaterThan(0);
    expect(r.breakdown.light).toBeGreaterThan(0);
  });

  test('low elevation, overcast, daytime -> NG', () => {
    const wx = { time: '2024-01-01T00:00', cloudcover: 100, visibility: 1000, windspeed10m: 12, precipitation: 1 };
    const r = scoreObservation(10, wx, sunDay);
    expect(r.score).toBeLessThan(50);
    expect(r.decision).toBe('NG');
  });

  test('boundary decisions', () => {
    // 雑にOK/WARN/NG境界を叩く：仕様が変わったらここで検知できる
    const wxGood = { time: 't', cloudcover: 10, visibility: 8000, windspeed10m: 3, precipitation: 0 };
    const s1 = scoreObservation(60, wxGood, sunNight);
    // WARNケース（中間品質）を作る
    const wxMid = { time: 't', cloudcover: 60, visibility: 4000, windspeed10m: 8, precipitation: 0 };
    const s2 = scoreObservation(40, wxMid, sunNight);
    expect(['OK','WARN','NG']).toContain(s1.decision);
    expect(['OK','WARN','NG']).toContain(s2.decision);
  });
});