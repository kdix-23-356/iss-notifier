// path: src/jobs/scheduler.ts
/**
 * スケジューラ: 1分毎に AOS 接近パスを抽出して Slack 通知。
 * Block Kit を用い、ISS トラッカーのボタンを追加する。
 */
// スケジューラの多重起動軽減（簡易ロック）と例外の完全ログ化
// 失敗を握りつぶさず、少なくともエラーログに痕跡を残す
import cron, { ScheduledTask } from "node-cron";
import { STATIONS } from "../stations";
import {
  ensureTleFresh,
  getCurrentTle,
  findPasses,
  getWeatherAt,
  getSunState,
  getIllumination,
  scoreObservation
} from "../core";
import { getDb } from "../db";
import { postSlack } from "../notify/slack";
import { buildPassNotificationPayload } from "../notify/buildSlackBlocks";
import { log } from "../lib/log";

let inProgress = false;
let jobHandle: ScheduledTask | null = null;

export function startScheduler(): ScheduledTask {
  // すでに動いていればそのまま返す（多重起動防止）
  if (jobHandle) return jobHandle;

  jobHandle = cron.schedule("* * * * *", async () => {
    if (inProgress) {
      log.warn("scheduler.skip.concurrent");
      return;
    }
    inProgress = true;

    const startAt = Date.now();
    const now = new Date();
    const in10m = new Date(now.getTime() + 10 * 60 * 1000);

    try {
      await ensureTleFresh(30);
      const tle = getCurrentTle();

      for (const station of STATIONS) {
        try {
          const end = new Date(now.getTime() + 6 * 60 * 60 * 1000);
          const passes = findPasses(tle.line1, tle.line2, station, now, end, 10);
          const targets = passes.filter(p => p.aos >= now && p.aos <= in10m);
          if (targets.length === 0) continue;

          const p = targets[0]!;
          const db = getDb();

          const exists = db.prepare(
            "SELECT 1 FROM notified_pass WHERE station_id = ? AND tca_utc = ? LIMIT 1"
          ).get(station.id, p.tca.toISOString());
          if (exists) continue;

          const wx = await getWeatherAt(station.lat, station.lon, p.tca);
          const sun = getSunState(p.tca, station.lat, station.lon);
          const illum = getIllumination(tle.line1, tle.line2, p.tca);
          const score = scoreObservation(p.maxEl, wx, sun);

          const payload = buildPassNotificationPayload({
            stationName: station.name,
            aosIso: p.aos.toISOString(),
            tcaIso: p.tca.toISOString(),
            losIso: p.los.toISOString(),
            maxElDeg: p.maxEl,
            wx, sun, illum, score,
            windowInfo: `自動通知: AOSまで約 ${Math.round((p.aos.getTime() - now.getTime()) / 60000)} 分`,
            trackerUrl: "https://kdix-23-356.github.io/iss-tracker/"
          });

          const status = await postSlack(payload).catch((e) => {
            log.error("slack.post.exception", { err: e instanceof Error ? e.message : String(e) });
            return 0;
          });

          db.prepare(
            "INSERT OR IGNORE INTO notified_pass (station_id, tca_utc, aos_utc) VALUES (?, ?, ?)"
          ).run(station.id, p.tca.toISOString(), p.aos.toISOString());

          db.prepare(
            "INSERT INTO notification_log (channel, status, response_code, message) VALUES (?, ?, ?, ?)"
          ).run("slack", status === 200 ? "sent" : "failed", status, `auto:${station.id}:${p.tca.toISOString()}`);

        } catch (err) {
          log.error("scheduler.station.failed", {
            stationId: station.id,
            err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
          });
        }
      }
    } catch (err) {
      log.error("scheduler.run.failed", {
        err: err instanceof Error ? { name: err.name, message: err.message } : String(err),
      });
    } finally {
      inProgress = false;
      log.info("scheduler.run.finished", { durationMs: Date.now() - startAt });
    }
  });

  return jobHandle;
}

export function stopScheduler(): void {
  if (jobHandle) {
    jobHandle.stop();
    jobHandle = null;
  }
}