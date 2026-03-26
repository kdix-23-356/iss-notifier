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
import { buildSchedulerPassPayload } from "../notify/buildSlackBlocks";
import { log } from "../lib/log";

let inProgress = false;
let jobHandle: ScheduledTask | null = null;

/**
 * バックグラウンドスケジューラを開始します。
 *
 * - 1分毎に `STATIONS` の各ステーションで直近6時間のパスを探索
 * - AOS が現在時刻〜10分以内の候補を対象とし、未通知なら Slack 送信
 * - 通知済みパスは `notified_pass` テーブルで重複防止
 * - 全件ログは `notification_log` に記録
 * - 失敗しても次スケジュールに影響を与えないよう完全捕捉
 */
export async function runSchedulerOnce(nowOverride?: Date): Promise<void> {
  if (inProgress) {
    log.warn("scheduler.skip.concurrent");
    return;
  }
  inProgress = true;

  const startAt = Date.now();
  const now = nowOverride ?? new Date();
  const in10m = new Date(now.getTime() + 10 * 60 * 1000);

  try {
    // TLE を 30 分以上古くしない
    await ensureTleFresh(30);
    const tle = getCurrentTle();

    // DB 接続を1回取得（better-sqlite3 の１接続１ライター設計に対応）
    const db = getDb();

    for (const station of STATIONS) {
      try {
        // 現在:now から 6h のパスを探索
        const end = new Date(now.getTime() + 6 * 60 * 60 * 1000);
        const passes = findPasses(tle.line1, tle.line2, station, now, end, 10);

        // AOS が 0〜10分以内の候補だけを通知対象に
        const targets = passes.filter((p) => p.aos >= now && p.aos <= in10m);
        if (targets.length === 0) continue;

        const p = targets[0]!;

        // 重複通知チェック
        const exists = db
          .prepare("SELECT 1 FROM notified_pass WHERE station_id = ? AND tca_utc = ? LIMIT 1")
          .get(station.id, p.tca.toISOString());
        if (exists) continue;

        const wx = await getWeatherAt(station.lat, station.lon, p.tca);
        const sun = getSunState(p.tca, station.lat, station.lon);
        const illum = getIllumination(tle.line1, tle.line2, p.tca);
        const score = scoreObservation(p.maxEl, wx, sun);

        const payload = buildSchedulerPassPayload(
          station.name,
          p,
          wx,
          sun,
          illum,
          score,
          now
        );

        const status = await postSlack(payload).catch((e) => {
          log.error("slack.post.exception", { err: e instanceof Error ? e.message : String(e) });
          return 0;
        });

        // 通知済みパスとしてマーク
        db.prepare("INSERT OR IGNORE INTO notified_pass (station_id, tca_utc, aos_utc) VALUES (?, ?, ?)")
          .run(station.id, p.tca.toISOString(), p.aos.toISOString());

        // 処理ログを記録
        db.prepare("INSERT INTO notification_log (channel, status, response_code, message) VALUES (?, ?, ?, ?)")
          .run("slack", status === 200 ? "sent" : "failed", status, `auto:${station.id}:${p.tca.toISOString()}`);

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
}

export function startScheduler(): ScheduledTask {
  if (jobHandle) return jobHandle;

  jobHandle = cron.schedule("* * * * *", () => runSchedulerOnce());

  return jobHandle;
}

export function stopScheduler(): void {
  if (jobHandle) {
    jobHandle.stop();
    jobHandle = null;
  }
}