// src/index.ts
import Fastify from "fastify";
import { ENV } from "./env";
import { registerHealthRoutes } from "./routes/health";
import { registerPassRoutes } from "./routes/passes";
import { startScheduler } from "./jobs/scheduler";

async function main() {
  const app = Fastify({ logger: true });

  await registerHealthRoutes(app);
  await registerPassRoutes(app);

  // D: スケジューラ起動
  startScheduler();

  await app.listen({ host: "0.0.0.0", port: ENV.PORT });
  console.log(`Server started on :${ENV.PORT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });