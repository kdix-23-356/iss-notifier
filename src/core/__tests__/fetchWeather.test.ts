// path: src/core/__tests__/fetchWeather.test.ts
// 近傍バケットの選択と最低限の項目抽出を検証。fetchをモックして再現性を確保。
import { getWeatherAt } from '../fetchWeather';

const originalFetch = global.fetch;
const originalWarn = console.warn;
const originalError = console.error;

beforeEach(() => {
  global.fetch = jest.fn();
  // 異常系テストで意図的に発生させるエラーのログをミュート
  console.warn = jest.fn();
  console.error = jest.fn();
});

afterEach(() => {
  global.fetch = originalFetch!;
  // テストが終わったら元の関数に戻す
  console.warn = originalWarn;
  console.error = originalError;
});

function okJson(body: any) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Map([['content-type','application/json']]),
  } as any);
}

describe('getWeatherAt', () => {
  test('picks exact hour bucket when present', async () => {
    const when = new Date('2024-01-01T12:34:56Z'); // → 13時丸め
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({
        latitude: 35,
        longitude: 139,
        hourly: {
          time: ['2024-01-01T12:00:00Z','2024-01-01T13:00:00Z','2024-01-01T14:00:00Z'],
          cloudcover: [50, 30, 10],
          precipitation: [0, 0, 0],
          visibility: [5000, 9000, 10000],
          wind_speed_10m: [3, 2, 4],
        }
      })
    );
    const wx = await getWeatherAt(35, 139, when);
    expect(wx).not.toBeNull();
    expect(wx!.time).toBe('2024-01-01T13:00:00Z');
    expect(wx!.cloudcover).toBe(30);
    expect(wx!.windspeed10m).toBe(2);
  });

  test('falls back to nearest bucket when exact hour missing', async () => {
    const when = new Date('2024-01-01T12:05:00Z'); // 12:00に近い
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({
        latitude: 35,
        longitude: 139,
        hourly: {
          time: ['2024-01-01T11:00:00Z','2024-01-01T12:00:00Z','2024-01-01T14:00:00Z'],
          cloudcover: [80, 40, 10],
          precipitation: [0, 0, 0],
          visibility: [3000, 7000, 10000],
          wind_speed_10m: [5, 3, 1],
        }
      })
    );
    const wx = await getWeatherAt(35, 139, when);
    expect(wx).not.toBeNull();
    expect(wx!.time).toBe('2024-01-01T12:00:00Z');
    expect(wx!.cloudcover).toBe(40);
  });

  test('returns null with network failure', async () => {
    // retryによって複数回呼ばれるため、Onceを外して常にエラーを返すようにする
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network fail'));
    const wx = await getWeatherAt(35, 139, new Date('2024-01-01T12:00:00Z'));
    expect(wx).toBeNull();
  });

  test('returns null when JSON parsing fails and fallback is invalid for schema', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      text: () => Promise.resolve('2024-01-01T12:00:00Z\n2024-01-01T13:00:00Z'),
    } as any);

    const wx = await getWeatherAt(35, 139, new Date('2024-01-01T12:00:00Z'));
    expect(wx).toBeNull();
  });
});