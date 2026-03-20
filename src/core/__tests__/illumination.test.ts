// path: src/core/__tests__/illumination.test.ts
import { getIllumination } from '../illumination';

describe('getIllumination', () => {
  test('returns eclipsed on night side within Earth radius cylinder', () => {
    const illum = getIllumination('1 25544U ...', '2 25544 ...', new Date('2024-01-01T00:00:00Z'));
    expect(illum).not.toBeNull();
    if (!illum) return;

    // 幾何: r=(7000,0,0), ŝ=(-1,0,0) → dot=-7000<0（夜側）, d=0<R⊕ → 影の中
    expect(illum.eclipsed).toBe(true);
    expect(illum.sunlit).toBe(false);
  });
});