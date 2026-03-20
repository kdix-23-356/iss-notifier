// path: src/routes/health.ts
// 目的: /health での疎通確認時に Slack Webhook へ簡易メッセージを送る（payload 未定義エラー対策としてここで定義）。
// 注意: 本番運用ではスパム防止のため、頻度制御やチャンネル分離、あるいは Slack 送信をオプトイン化すること。
import type { FastifyInstance } from "fastify";
import { postSlack } from "../notify/slack";

export async function registerHealthRoutes(app: FastifyInstance) {
  // 単純な疎通: アプリが生きているか
  app.get("/health", async (req, reply) => {
    return reply.send({ ok: true, t: new Date().toISOString() });
  });

  // Slack 通知のテスト（明示起動。誤送信防止に GET ではなく POST を推奨）
  app.post("/test-notify", async (req, reply) => {
    // ★ ここで payload を定義する：Slack Webhook 互換の最小 Block Kit/attachments ではなく、text のみでも可。
    const payload = {
      text: `Health check from iss-auto-engine @ ${new Date().toISOString()}`,
    };

    // postSlack は数値の HTTP ステータスを返す（200=成功、0=送信前エラー）。
    const status = await postSlack(payload);

    return reply.send({
      ok: status === 200,
      status,
      message: status === 200 ? "sent" : "failed",
    });
  });
}