// path: src/core/__tests__/score.test.ts
// スコアの境界・ルール検証：幾何・気象・光の寄与とdecisionの閾値（70/50）を確認する。
import { scoreObservation } from '../score';
import type { WeatherSample } from '../fetchWeather';
import type { SunState } from '../astro';


describe('scoreObservation', () => {
  // --- Test data setup ---
  const goodWx: WeatherSample = { time: 't', cloudcover: 0, visibility: 20000, windspeed10m: 1, precipitation: 0 };
  const badWx: WeatherSample = { time: 't', cloudcover: 100, visibility: 1000, windspeed10m: 20, precipitation: 1 };
  const goodSun: SunState = { sunAltDeg: -15, twilight: 'astronomical' };
  const badSun: SunState = { sunAltDeg: 5, twilight: 'day' };

  // --- New, more specific tests ---
  test('returns high score and OK for excellent conditions', () => {
    const result = scoreObservation(80, goodWx, goodSun);
    expect(result.decision).toBe('OK');
    expect(result.score).toBe(90); // geom:40 + weather:35 + light:15 = 90
    expect(result.breakdown.geometry).toBe(40);
    expect(result.breakdown.weather).toBe(35);
    expect(result.breakdown.light).toBe(15);
  });

  test('returns medium score and WARN for mediocre conditions', () => {
    const mediocreWx: WeatherSample = { time: 't', cloudcover: 50, visibility: 8000, windspeed10m: 8, precipitation: 0 };
    const mediocreSun: SunState = { sunAltDeg: -7, twilight: 'nautical' };
    const result = scoreObservation(35, mediocreWx, mediocreSun);
    expect(result.decision).toBe('WARN');
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(70);
  });

  test('returns low score and NG for poor conditions', () => {
    const result = scoreObservation(15, badWx, badSun);
    expect(result.decision).toBe('NG');
    expect(result.score).toBe(0);
    expect(result.breakdown.geometry).toBe(0);
    expect(result.breakdown.weather).toBe(0);
    expect(result.breakdown.light).toBe(0);
  });

  test('returns NG when score is just below WARN threshold', () => {
    // ジオメトリ: 20deg -> 0点, 天気: 17.5点, 光: 20点 => 合計: 37.5点 -> NG
    const wx: WeatherSample = { time: 't', cloudcover: 50, visibility: 5000, windspeed10m: 5, precipitation: 0 };
    const sun: SunState = { sunAltDeg: -10, twilight: 'astronomical' };
    const result = scoreObservation(20, wx, sun);
    expect(result.score).toBe(38); // Math.round(37.5)
    expect(result.decision).toBe('NG');
  });

  test('weather is null, weather score should be 0', () => {
    const result = scoreObservation(80, null, goodSun);
    expect(result.breakdown.weather).toBe(0);
    // 天気情報がある場合と比較してスコアが低いことを確認
    const resultWithWeather = scoreObservation(80, goodWx, goodSun);
    expect(result.score).toBeLessThan(resultWithWeather.score);
  });
});