// path: src/lib/log.ts
// 超軽量の構造化ロガー。Fastifyロガーが使えないコンテキスト用の代替（consoleベース）。
// 実運用でpino等に置換しやすいよう、最低限のインターフェースに寄せる。
type Fields = Record<string, unknown>;

function fmt(level: string, msg: string, fields?: Fields) {
  const base = { level, msg, t: new Date().toISOString() };
  return fields ? { ...base, ...fields } : base;
}

export const log = {
  info: (msg: string, f?: Fields) => console.log(JSON.stringify(fmt("info", msg, f))),
  warn: (msg: string, f?: Fields) => console.warn(JSON.stringify(fmt("warn", msg, f))),
  error: (msg: string, f?: Fields) => console.error(JSON.stringify(fmt("error", msg, f))),
  debug: (msg: string, f?: Fields) => console.debug(JSON.stringify(fmt("debug", msg, f))),
};