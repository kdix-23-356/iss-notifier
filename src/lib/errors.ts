// path: src/lib/errors.ts
// 共通エラー型：発生源ごとに識別可能なエラーを定義し、ログとハンドリングを一貫化する。
// 既存関数のシグネチャ破壊を避けるため、まずは「内部で使う」用途で導入する。
export class TimeoutError extends Error {
  constructor(public url: string, public timeoutMs: number) {
    super(`Timeout after ${timeoutMs}ms: ${url}`);
    this.name = "TimeoutError";
  }
}

export class HttpError extends Error {
  constructor(public url: string, public status: number, public statusText: string) {
    super(`HTTP ${status} ${statusText}: ${url}`);
    this.name = "HttpError";
  }
}

export class ParseError extends Error {
  constructor(public url: string, public reason: string) {
    super(`Parse error: ${reason} (${url})`);
    this.name = "ParseError";
  }
}

export class ExternalServiceError extends Error {
  constructor(public service: string, message: string) {
    super(`[${service}] ${message}`);
    this.name = "ExternalServiceError";
  }
}