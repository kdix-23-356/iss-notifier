// path: src/routes/passes.ts
import type { FastifyInstance } from "fastify";
import { STATION_BY_ID } from "../stations";
import {
  findPasses,
  getWeatherAt,
  getSunState,
  getCurrentTle,
  ensureTleFresh,
  scoreObservation,
  getIllumination
} from "../core";
import { postSlack } from "../notify/slack";
import { buildPassNotificationPayload } from "../notify/buildSlackBlocks";

type PassesQuery = {
  windowHours?: string;
  aosDeg?: string;
  diagnostics?: string;
};

export async function registerPassRoutes(app: FastifyInstance) {
  app.get("/passes/:stationId", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = STATION_BY_ID[stationId];
    if (!station) return reply.code(404).send({ ok: false, error: "Unknown stationId" });

    const q = req.query as PassesQuery;
    const windowHours = Number(q.windowHours ?? "2");
    const aosDeg = Number(q.aosDeg ?? "10");
    const diagnostics = q.diagnostics === "1";

    await ensureTleFresh(30);
    const tle = getCurrentTle();

    const start = new Date();
    const end = new Date(start.getTime() + Math.max(1, windowHours) * 60 * 60 * 1000);
    const passes = findPasses(tle.line1, tle.line2, station, start, end, aosDeg);

    if (passes.length > 0) {
      const p = passes[0]!;
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
        windowInfo: `探索: ${windowHours}h, AOSしきい値: ${aosDeg}°`,
        // ここで指定の ISS トラッカー URL を渡す
        trackerUrl: "https://kdix-23-356.github.io/iss-tracker/"
      });
      try { await postSlack(payload); } catch {}

      return reply.send({
        ok: true,
        station,
        count: passes.length,
        passes,
        weather: wx,
        sun,
        illumination: illum,
        score
      });
    }

    if (diagnostics) {
      const diagEnd = new Date(start.getTime() + 12 * 60 * 60 * 1000);
      const diagPasses = findPasses(tle.line1, tle.line2, station, start, diagEnd, Math.max(0, Math.min(aosDeg, 20)));
      const next = diagPasses[0];
      if (next) {
        const wx = await getWeatherAt(station.lat, station.lon, next.tca);
        const sun = getSunState(next.tca, station.lat, station.lon);
        const illum = getIllumination(tle.line1, tle.line2, next.tca);
        const score = scoreObservation(next.maxEl, wx, sun);

        return reply.send({
          ok: true,
          station,
          count: 0,
          passes: [],
          nextCandidate: {
            pass: next,
            weather: wx,
            sun,
            illumination: illum,
            score
          }
        });
      }
    }

    return reply.send({ ok: true, station, count: 0, passes: [] });
  });
}