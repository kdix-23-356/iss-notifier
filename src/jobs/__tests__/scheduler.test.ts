// path: src/jobs/__tests__/scheduler.test.ts
jest.mock('../../core', () => ({
  ensureTleFresh: jest.fn().mockResolvedValue(undefined),
  getCurrentTle: jest.fn(() => ({ line1: '1 ...', line2: '2 ...' })),
  findPasses: jest.fn(() => [{
    aos: new Date('2024-01-01T00:05:00Z'),
    tca: new Date('2024-01-01T00:07:00Z'),
    los: new Date('2024-01-01T00:10:00Z'),
    maxEl: 30,
  }]),
  getWeatherAt: jest.fn().mockResolvedValue({ time: 't', cloudcover: 20, visibility: 9000, windspeed10m: 3, precipitation: 0 }),
  getSunState: jest.fn(() => ({ sunAltDeg: -10, twilight: 'astronomical' })),
  getIllumination: jest.fn(() => ({ sunlit: true, eclipsed: false, distanceToSunAxisKm: 8000, nightSide: false })),
  scoreObservation: jest.fn(() => ({ score: 80, decision: 'OK', breakdown: { geometry: 30, weather: 35, light: 15 } })),
}));
jest.mock('../../notify/slack', () => ({ postSlack: jest.fn().mockResolvedValue(200) }));
jest.mock('../../notify/buildSlackBlocks', () => ({ buildPassNotificationPayload: jest.fn(() => ({ text: 'payload' })) }));
jest.mock('../../db', () => ({
  getDb: jest.fn(() => ({
    prepare: jest.fn(() => ({
      get: jest.fn(() => undefined),   // 未通知
      run: jest.fn(() => undefined),   // 挿入OK
    })),
  })),
}));

import { startScheduler, stopScheduler } from '../scheduler';

test('startScheduler can be called without throwing', () => {
  const job = startScheduler();
  expect(job).toBeTruthy();
});

afterAll(() => {
  // テスト終了時に必ず停止して、残存タイマーを消す
  stopScheduler();
});
``