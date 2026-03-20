// src/stations.ts
export type Station = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  elevationM?: number;
};

export const STATIONS: Station[] = [
  {
    id: "JAXA_TSUKUBA",
    name: "JAXA Tsukuba",
    lat: 36.083,      // 参考値（必要なら後で正確化）
    lon: 140.083,     // 参考値
    elevationM: 30
  }
];

// 使い勝手用の辞書
export const STATION_BY_ID = Object.fromEntries(
  STATIONS.map((s) => [s.id, s])
);
