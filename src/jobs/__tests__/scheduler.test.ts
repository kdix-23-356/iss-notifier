// path: src/jobs/__tests__/scheduler.test.ts
jest.mock('../../core', () => ({
  ensureTleFresh: jest.fn(),
  getCurrentTle: jest.fn(),
  findPasses: jest.fn(),
  getWeatherAt: jest.fn(),
  getSunState: jest.fn(),
  getIllumination: jest.fn(),
  scoreObservation: jest.fn(),
}));

jest.mock('../../lib/log', () => ({
  log: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../notify/slack', () => ({ postSlack: jest.fn() }));
jest.mock('../../notify/buildSlackBlocks', () => ({ buildSchedulerPassPayload: jest.fn() }));

const prepareGet = jest.fn();
const prepareRun = jest.fn();
const prepare = jest.fn((query: string) => ({ get: prepareGet, run: prepareRun }));

jest.mock('../../db', () => ({
  getDb: jest.fn(() => ({ prepare })),
}));

import { startScheduler, stopScheduler, runSchedulerOnce } from '../scheduler';
import { postSlack } from '../../notify/slack';
import { buildSchedulerPassPayload } from '../../notify/buildSlackBlocks';
import { getDb } from '../../db';
import { log } from '../../lib/log';
import {
  ensureTleFresh,
  getCurrentTle,
  findPasses,
  getWeatherAt,
  getSunState,
  getIllumination,
  scoreObservation,
} from '../../core';

beforeEach(() => {
  (ensureTleFresh as jest.Mock).mockResolvedValue(undefined);
  (getCurrentTle as jest.Mock).mockReturnValue({ line1: '1 ...', line2: '2 ...' });
  (findPasses as jest.Mock).mockImplementation((line1: string, line2: string, station: any, now: Date) => [{
    aos: new Date(now.getTime() + 5 * 60 * 1000),
    tca: new Date(now.getTime() + 7 * 60 * 1000),
    los: new Date(now.getTime() + 10 * 60 * 1000),
    maxEl: 30,
  }]);
  (getWeatherAt as jest.Mock).mockResolvedValue({ time: 't', cloudcover: 20, visibility: 9000, windspeed10m: 3, precipitation: 0 });
  (getSunState as jest.Mock).mockReturnValue({ sunAltDeg: -10, twilight: 'astronomical' });
  (getIllumination as jest.Mock).mockReturnValue({ sunlit: true, eclipsed: false, distanceToSunAxisKm: 8000, nightSide: false });
  (scoreObservation as jest.Mock).mockReturnValue({ score: 80, decision: 'OK', breakdown: { geometry: 30, weather: 35, light: 15 } });

  (postSlack as jest.Mock).mockResolvedValue(200);
  (buildSchedulerPassPayload as jest.Mock).mockReturnValue({ text: 'payload' });

  prepareGet.mockReturnValue(undefined);
  prepareRun.mockClear();
  prepare.mockImplementation((query: string) => ({ get: prepareGet, run: prepareRun }));
  (getDb as jest.Mock).mockImplementation(() => ({ prepare }));
});

afterEach(() => {
  stopScheduler();
});

test('startScheduler can be called without throwing', () => {
  const job = startScheduler();
  expect(job).toBeTruthy();
});

test('scheduler sends notification and inserts records when a new pass is found', async () => {
  prepareGet.mockReturnValue(undefined);

  await runSchedulerOnce(new Date());

  expect(getDb).toHaveBeenCalledTimes(1);
  expect(prepare).toHaveBeenCalledWith(expect.stringContaining('SELECT 1 FROM notified_pass'));
  expect(prepareGet).toHaveBeenCalledWith(expect.any(String), expect.any(String));
  expect(getWeatherAt).toHaveBeenCalled();
  expect(buildSchedulerPassPayload).toHaveBeenCalled();
  expect(postSlack).toHaveBeenCalledWith({ text: 'payload' });
  expect(prepareRun).toHaveBeenCalledTimes(2); // notified_pass + notification_log
  expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO notified_pass'));
  expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notification_log'));
});

test('scheduler skips already notified pass', async () => {
  prepareGet.mockReturnValue({ '1': 1 });

  await runSchedulerOnce(new Date());

  expect(postSlack).not.toHaveBeenCalled();
  expect(prepareRun).not.toHaveBeenCalled();
  // 早期リターンするため、天気の取得も行われない
  expect(getWeatherAt).not.toHaveBeenCalled();
});

test('scheduler handles slack post failure and logs it', async () => {
  prepareGet.mockReturnValue(undefined);
  (postSlack as jest.Mock).mockRejectedValue(new Error('Slack API is down'));

  await runSchedulerOnce(new Date());

  // Slack投稿は試みられる
  expect(postSlack).toHaveBeenCalled();
  // エラーがログに出力される
  expect(log.error).toHaveBeenCalledWith('slack.post.exception', { err: 'Slack API is down' });

  // DBには通知済みパスとして記録される
  expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT OR IGNORE INTO notified_pass'));
  // DBには失敗ログが記録される
  expect(prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notification_log'));
  expect(prepareRun).toHaveBeenCalledTimes(2);
});

test('scheduler handles global error during TLE fetch and logs it', async () => {
  (ensureTleFresh as jest.Mock).mockRejectedValue(new Error('Network error'));

  await runSchedulerOnce(new Date());

  // TLE取得で失敗するので、後続処理は呼ばれない
  expect(findPasses).not.toHaveBeenCalled();
  expect(postSlack).not.toHaveBeenCalled();

  // グローバルなエラーがログに出力される
  expect(log.error).toHaveBeenCalledWith('scheduler.run.failed', { err: { name: 'Error', message: 'Network error' } });
});

test('scheduler skips if another job is in progress', async () => {
  // `ensureTleFresh` が完了するまで待機するようにモックを調整
  let resolveEnsureTleFresh: (value: unknown) => void;
  const tlePromise = new Promise((resolve) => {
    resolveEnsureTleFresh = resolve;
  });
  (ensureTleFresh as jest.Mock).mockReturnValue(tlePromise);

  // 1回目の実行を開始（awaitしない）
  const firstRunPromise = runSchedulerOnce(new Date());

  // 2回目の実行を試みる
  await runSchedulerOnce(new Date());

  // 2回目はスキップされ、警告ログが出力されるはず
  expect(log.warn).toHaveBeenCalledWith('scheduler.skip.concurrent');

  // 1回目の実行を完了させる
  resolveEnsureTleFresh!(undefined);
  await firstRunPromise;
});

``