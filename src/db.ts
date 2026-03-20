// src/db.ts
import Database from "better-sqlite3";
import { ENV } from "./env";

export function getDb(): any {
  const db = new Database(ENV.SQLITE_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notification_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      status TEXT NOT NULL,
      response_code INTEGER,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    -- パス通知の重複防止用。ステーションと TCA をユニーク化
    CREATE TABLE IF NOT EXISTS notified_pass (
      station_id TEXT NOT NULL,
      tca_utc TEXT NOT NULL,
      aos_utc TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (station_id, tca_utc)
    );
  `);
  return db;
}