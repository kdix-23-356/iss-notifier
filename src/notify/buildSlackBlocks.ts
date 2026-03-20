// path: src/notify/buildSlackBlocks.ts
/**
 * ISS 通過通知の Block Kit ペイロードを生成するユーティリティ。
 * 判定（OK / WARN / NG）に応じて attachments.color を切り替え、視認性を向上する。
 *
 * 注意:
 * - attachments と blocks を併用する。色付けは attachments に依存するため。
 * - メッセージは英数字と日本語で読みやすい構成にする。
 */

import type { WeatherSample } from "../core";
import type { SunState } from "../core";
import type { Illumination } from "../core";
import type { ScoreResult } from "../core";

const COLOR_BY_DECISION: Record<ScoreResult["decision"], string> = {
  OK: "#2ecc71",
  WARN: "#f1c40f",
  NG: "#e74c3c"
};

export type BuildPayloadParams = {
  stationName: string;
  aosIso: string;
  tcaIso: string;
  losIso: string;
  maxElDeg: number;
  wx: WeatherSample | null;
  sun: SunState;
  illum: Illumination | null;
  score: ScoreResult;
  windowInfo?: string;
  /**
   * ISS トラッカーの URL。指定があれば actions ブロックにボタンを追加する。
   * 例: https://kdix-23-356.github.io/iss-tracker/
   */
  trackerUrl?: string;
};

export function buildPassNotificationPayload(params: BuildPayloadParams) {
  const { stationName, aosIso, tcaIso, losIso, maxElDeg, wx, sun, illum, score, windowInfo, trackerUrl } = params;
  const color = COLOR_BY_DECISION[score.decision];

  const fields: any[] = [
    { type: "mrkdwn", text: `*AOS*\n${aosIso}` },
    { type: "mrkdwn", text: `*LOS*\n${losIso}` },
    { type: "mrkdwn", text: `*TCA / 最大仰角*\n${tcaIso} / ${Math.round(maxElDeg)}°` },
    { type: "mrkdwn", text: `*太陽*\n高度 ${sun.sunAltDeg.toFixed(1)}°、薄明 ${sun.twilight}` }
  ];

  if (illum) {
    fields.push({ type: "mrkdwn", text: `*日照*\n${illum.sunlit ? "sunlit" : "eclipsed"}` });
  } else {
    fields.push({ type: "mrkdwn", text: `*日照*\nunknown` });
  }

  if (wx) {
    const w = [
      `雲量 ${wx.cloudcover ?? "-"}%`,
      `降水量 ${wx.precipitation ?? "-"} mm`,
      `視程 ${wx.visibility ?? "-"} m`,
      `風速10m ${wx.windspeed10m ?? "-"} m/s`
    ].join(" / ");
    fields.push({ type: "mrkdwn", text: `*天気 (UTC ${wx.time})*\n${w}` });
  }

  const blocks: any[] = [
    { type: "header", text: { type: "plain_text", text: `ISS 通過予報（${stationName}）` } },
    ...(windowInfo ? [{ type: "context", elements: [{ type: "mrkdwn", text: windowInfo }] }] : []),
    { type: "section", fields },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*観測スコア*: ${score.score} （判定: ${score.decision}）\n内訳: geometry=${score.breakdown.geometry}, weather=${score.breakdown.weather}, light=${score.breakdown.light}`
      }
    }
  ];

  // トラッカー URL が指定されていれば、アクションボタンを追加する
  if (typeof trackerUrl === "string" && trackerUrl.length > 0) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "ISS トラッカーを開く" },
          url: trackerUrl,
          style: "primary" // 強調ボタン。primary は青系の見た目になる
        }
      ]
    });
  }

  const payload = {
    attachments: [
      { color, blocks }
    ]
  };

  return payload;
}