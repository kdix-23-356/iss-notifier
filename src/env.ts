// src/env.ts
import { readFileSync } from "fs";
import * as path from "path";

import * as dotenv from "dotenv";
const envPath = path.resolve(process.cwd(), ".env");
try { readFileSync(envPath); dotenv.config({ path: envPath }); } catch { /* ignore */ }

export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "3000"),
  SQLITE_PATH: process.env.SQLITE_PATH ?? "/app/data/engine.sqlite",
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL ?? "",
};