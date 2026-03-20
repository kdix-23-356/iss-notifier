// path: src/notify/__tests__/slack.test.ts
// Slack送信の成否分岐をHTTPモックで検証。環境変数の有無でも振る舞いが変わる点に注意。
const originalFetch = global.fetch;
const originalEnv = process.env;
const originalError = console.error;

function res(status: number) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'TEST',
    text: () => Promise.resolve('ok'),
    headers: new Map([['content-type','text/plain']]),
  } as any);
}

beforeEach(() => {
  // ログをミュート（構造化ログが大量に出ないように）
  console.error = jest.fn();

  // モジュールキャッシュをクリアして、毎テストで再読み込みできるようにする
  jest.resetModules();

  // fetchは毎回モックに差し替え
  global.fetch = jest.fn();
});

afterEach(() => {
  process.env = originalEnv;
  global.fetch = originalFetch!;
  console.error = originalError;
});

test('returns 200 on success', async () => {
  // 先に環境変数をセットしてから require する
  process.env = { ...originalEnv, SLACK_WEBHOOK_URL: 'https://hooks.slack.test/xxx' };
  const { postSlack } = require('../slack') as typeof import('../slack');

  (global.fetch as jest.Mock).mockResolvedValueOnce(res(200));
  const code = await postSlack({ text: 'hello' });
  expect(code).toBe(200);
});

test('returns 0 when SLACK_WEBHOOK_URL missing', async () => {
  // URL を空にしてから require
  process.env = { ...originalEnv, SLACK_WEBHOOK_URL: '' };
  const { postSlack } = require('../slack') as typeof import('../slack');

  const code = await postSlack({ text: 'hello' });
  expect(code).toBe(0);
});