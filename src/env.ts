// src/env.ts
/**
 * 環境変数の読み込み・バリデーション
 *
 * .env ファイルが無い場合はスキップし、プロセス環境変数を読む。
 * 必須変数未設定時は起動時に明示的にエラーを出す。
 */
import { readFileSync } from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

const envPath = path.resolve(process.cwd(), ".env");
try {
  readFileSync(envPath);
  dotenv.config({ path: envPath });
} catch {
  // .env 未存在時スキップ（本番環境など、環境変数から直接読む場合）
}

/**
 * 環境変数アサーション: 必須変数が設定されていないと即座にエラー
 */
function assertRequired(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}. ` +
      `Please set it in .env file or as a process environment variable.`
    );
  }
  return value;
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "3000"),
  SQLITE_PATH: process.env.SQLITE_PATH ?? "/app/data/engine.sqlite",
  // SLACK_WEBHOOK_URL は本番環境では必須
  // 開発環境では空でもOK（機能は動くが Slack 通知は機能しない）
  SLACK_WEBHOOK_URL:
    process.env.NODE_ENV === "production"
      ? assertRequired("SLACK_WEBHOOK_URL")
      : process.env.SLACK_WEBHOOK_URL ?? "",
};