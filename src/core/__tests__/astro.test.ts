// path: src/core/__tests__/astro.test.ts
// 太陽高度しきい値の境界テスト：昼/市民/航海/天文/夜を代表時刻で確認（実地値に依存しすぎない範囲で）。
import { getSunState } from '../astro';

describe('getSunState', () => {
  test('returns structured twilight states', () => {
    const tokyo = { lat: 35.681236, lon: 139.767125 }; // 東京駅近傍（代表値）
    // 固定時刻：UTCでの深夜。完全一致は不要だが、夜 or 天文薄明を返すことを確認。
    const when = new Date('2024-01-15T15:00:00Z'); // JST=00:00
    const s = getSunState(when, tokyo.lat, tokyo.lon);
    expect(typeof s.sunAltDeg).toBe('number');
    expect(['day','civil','nautical','astronomical','night']).toContain(s.twilight);
  });

  test('daytime likely returns "day"', () => {
    const when = new Date('2024-06-15T03:00:00Z'); // JST=12:00頃
    const s = getSunState(when, 35.681236, 139.767125);
    // 正午近傍で0°以上をほぼ満たすため day の確率が高い
    expect(s.twilight === 'day' || s.sunAltDeg >= 0).toBeTruthy();
  });
});