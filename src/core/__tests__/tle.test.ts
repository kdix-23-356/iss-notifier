// path: src/core/__tests__/tle.test.ts
// 目的: core/tle.ts の“ふるまい”を固定するキャラクタリゼーションテスト（動的モック版・タイムアウト対策込み）。
// ポイント:
//  - SUT読み込み前に jest.doMock(require.resolve(...), factory) で絶対パス指定のモックを注入（http/log/retry）
//  - retry はテスト時のみ「即時実行・無待機」に置換して、指数バックオフ由来のタイムアウトを根絶
//  - 期待するTLEを厳密一致で検証して、更新事実を直接保証
//  - FakeTimers で鮮度境界（maxAge）を決定的に踏む

import { jest } from '@jest/globals';
import path from 'path';

// --- ここで使う型（テスト専用の最小 Response 互換） ---
type RespLike = {
  text: () => Promise<string>;
  headers: { get: (k: string) => string | null };
};
const makeTextResponse = (text: string, contentType = 'text/plain'): RespLike => ({
  text: async () => text,
  headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? contentType : null) },
});

// --- モック参照を保持する外側の変数（doMockファクトリからセットする） ---
let fetchMock!: jest.MockedFunction<(url: string, init?: any) => Promise<RespLike>>;
let logMock!: {
  info: jest.Mock;
  warn: jest.Mock;
  error: jest.Mock;
  debug: jest.Mock;
};

// --- SUT をモック注入済みで読み込むヘルパ ---
//   1) モジュールキャッシュをリセット
//   2) 絶対パスで http/log/retry を doMock（factory内で mock 関数を外の変数に束縛）
//   3) その後に SUT（../tle）を動的 import
async function loadSutWithMocks() {
  jest.resetModules();

  const httpPath  = require.resolve(path.join(__dirname, '..', '..', 'lib', 'http'));
  const logPath   = require.resolve(path.join(__dirname, '..', '..', 'lib', 'log'));
  const retryPath = require.resolve(path.join(__dirname, '..', '..', 'lib', 'retry'));
  const issTlePath= require.resolve(path.join(__dirname, '..', '..', 'iss-tle'));

  // iss-tle は実体をそのまま使う（FALLBACKの比較に使用）
  const { ISS_TLE: FALLBACK_TLE } = require(issTlePath);

  // fetch をモック
  jest.doMock(httpPath, () => {
    fetchMock = jest.fn(); // ← ここにモック関数を束縛
    return { fetchWithTimeout: fetchMock };
  });

  // log をモック
  jest.doMock(logPath, () => {
    logMock = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    return { log: logMock };
  });

  // ★ retry を「無待機・即時」モックに置換（指数バックオフ由来のタイムアウトを根絶）
  jest.doMock(retryPath, () => ({
    retry: async <T>(fn: () => Promise<T>) => fn(),
  }));

  // SUT（src/core/tle.ts）を、モック注入済みの状態で読み込む
  const mod = await import('../tle');
  return {
    FALLBACK_TLE,
    ensureTleFresh: mod.ensureTleFresh as (maxAgeMinutes?: number) => Promise<void>,
    getCurrentTle: mod.getCurrentTle as () => { line1: string; line2: string },
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('core/tle.ts behavior lock (absolute-path doMock + no-wait retry)', () => {
  test('テキストTLE（1/2行）を取得して currentTle を更新する', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const L1 =
      '1 25544U 98067A   24001.00000000  .00016717  00000-0  10270-3 0  9991';
    const L2 =
      '2 25544  51.6441  21.1918 0003567 146.9914  39.7462 15.49812312345678';

    fetchMock.mockResolvedValueOnce(
      makeTextResponse(['some header', L1, L2].join('\n'), 'text/plain')
    );

    expect(getCurrentTle()).toEqual(FALLBACK_TLE); // 初期

    await ensureTleFresh(30);

    expect(getCurrentTle()).toEqual({ line1: L1, line2: L2 }); // ← 厳密一致で“更新”を保証
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logMock.error).not.toHaveBeenCalled();
  });

  test('Content-Type: application/json でも本文がプレーンTLEなら更新できる', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const L1 =
      '1 25544U 98067A   24002.00000000  .00011111  00000-0  00000-0 0  9992';
    const L2 =
      '2 25544  51.6442  22.1918 0003567 147.9914  40.7462 15.49822322345678';

    fetchMock.mockResolvedValueOnce(
      makeTextResponse([L1, L2].join('\n'), 'application/json')
    );

    const before = getCurrentTle();
    expect(before).toEqual(FALLBACK_TLE);

    await ensureTleFresh(30);

    const after = getCurrentTle();
    expect(after).toEqual({ line1: L1, line2: L2 }); // ← 具体TLEへの更新
    expect(after).not.toEqual(before);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('鮮度内（maxAge未満）は再取得しない', async () => {
    const { ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const L1 =
      '1 25544U 98067A   24003.00000000  .00016717  00000-0  10270-3 0  9993';
    const L2 =
      '2 25544  51.6443  23.1918 0003567 148.9914  41.7462 15.49832332345678';

    fetchMock.mockResolvedValue(makeTextResponse([L1, L2].join('\n')));

    await ensureTleFresh(30);
    const updated = getCurrentTle();
    expect(updated).toEqual({ line1: L1, line2: L2 });

    fetchMock.mockClear();
    jest.setSystemTime(new Date('2024-01-01T00:05:00Z'));
    await ensureTleFresh(30);

    expect(fetchMock).not.toHaveBeenCalled(); // 再取得なし
    expect(getCurrentTle()).toEqual(updated);
  });

  test('鮮度超過（maxAge超え）で再取得して更新する', async () => {
    const { ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const L1a =
      '1 25544U 98067A   24004.00000000  .00011111  00000-0  00000-0 0  9994';
    const L2a =
      '2 25544  51.6444  24.1918 0003567 149.9914  42.7462 15.49842342345678';
    const L1b =
      '1 25544U 98067A   24004.50000000  .00011111  00000-0  00000-0 0  9995';
    const L2b =
      '2 25544  51.6444  24.2918 0003567 150.9914  43.7462 15.49852352345678';

    fetchMock
      .mockResolvedValueOnce(makeTextResponse([L1a, L2a].join('\n')))
      .mockResolvedValueOnce(makeTextResponse([L1b, L2b].join('\n')));

    await ensureTleFresh(30);
    expect(getCurrentTle()).toEqual({ line1: L1a, line2: L2a }); // 初回

    jest.setSystemTime(new Date('2024-01-01T00:31:00Z')); // 30分超過
    await ensureTleFresh(30);

    expect(getCurrentTle()).toEqual({ line1: L1b, line2: L2b }); // 二度目の更新
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test('不正テキスト（TLE行なし）では更新されない', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    fetchMock.mockResolvedValueOnce(makeTextResponse('no tle lines here', 'text/plain'));

    const before = getCurrentTle();
    expect(before).toEqual(FALLBACK_TLE);

    await ensureTleFresh(30);

    expect(getCurrentTle()).toEqual(before);
    // expect(logMock.warn).toHaveBeenCalled(); // 必要なら緩く確認
  });

  test('JSONパース失敗時も更新されない', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    fetchMock.mockResolvedValueOnce(makeTextResponse('{"bad json"', 'application/json'));

    const before = getCurrentTle();
    expect(before).toEqual(FALLBACK_TLE);

    await ensureTleFresh(30);

    expect(getCurrentTle()).toEqual(before);
  });

  test('HTTP失敗（例外）時も更新されない', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    fetchMock.mockRejectedValueOnce(new Error('HTTP 503'));

    const before = getCurrentTle();
    expect(before).toEqual(FALLBACK_TLE);

    await ensureTleFresh(30); // retryは即時モックのため待ちなし

    expect(getCurrentTle()).toEqual(before);
    // expect(logMock.error).toHaveBeenCalled(); // 必要なら緩く確認
  });

  test('タイムアウト（TimeoutError）時も更新されない', async () => {
    const { FALLBACK_TLE, ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const timeoutErr = new Error('Timeout'); (timeoutErr as any).name = 'TimeoutError';
    fetchMock.mockRejectedValueOnce(timeoutErr);

    const before = getCurrentTle();
    expect(before).toEqual(FALLBACK_TLE);

    await ensureTleFresh(30); // retryは即時モックのため待ちなし

    expect(getCurrentTle()).toEqual(before);
  });

  test('並列呼び出しでも最終的な currentTle は一貫（少なくとも壊れない）', async () => {
    const { ensureTleFresh, getCurrentTle } = await loadSutWithMocks();

    const L1 =
      '1 25544U 98067A   24005.00000000  .00011111  00000-0  00000-0 0  9996';
    const L2 =
      '2 25544  51.6445  25.1918 0003567 151.9914  44.7462 15.49862362345678';

    fetchMock.mockResolvedValue(makeTextResponse([L1, L2].join('\n')));

    jest.setSystemTime(new Date('2024-01-01T01:00:00Z'));

    await Promise.all([ensureTleFresh(0), ensureTleFresh(0)]);

    expect(getCurrentTle()).toEqual({ line1: L1, line2: L2 });
  });
});