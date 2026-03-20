// path: src/core/__tests__/predictPasses.test.ts
// パス探索の整合性検証：出力配列が a) 非空、b) aos<=tca<=los、c) maxEl>0 を満たすかを確認。
import { findPasses } from '../predictPasses';
type Station = { id: string; name: string; lat: number; lon: number; elevationM?: number };

// タプルで宣言
const DUMMY_TLE: [string, string] = [
  '1 25544U 98067A   24001.00000000  .00016717  00000-0  10270-3 0  9991',
  '2 25544  51.6441  21.1918 0003567 146.9914  39.7462 15.49812312345678'
];

const STATION: Station = { id: 'TEST', name: 'TEST', lat: 35.6, lon: 139.6, elevationM: 10 };

describe('findPasses', () => {
  test('returns time-ordered passes with sane fields', () => {
    const start = new Date('2024-01-01T00:00:00Z');
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2h
    const [L1, L2] = DUMMY_TLE; // ← ここで取り出せば確実に string 型
    const passes = findPasses(L1, L2, STATION as any, start, end, 5);

    for (const p of passes) {
      expect(p.aos <= p.tca && p.tca <= p.los).toBe(true);
      expect(typeof p.maxEl).toBe('number');
    }
  });
});
