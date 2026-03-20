// path: test/mocks/satellite.js
// 目的: production から見ても test から見ても、常にこの “同一実体” が読み込まれるようにする。
//       import 形（default / 名前付き / namespace）に関わらず動作させるため default も定義。
const mod = {
  twoline2satrec: (_l1, _l2) => ({}),
  propagate: (_rec, _when) => ({ position: { x: 7000, y: 0, z: 0 } }), // ECI[km]
  sunPos: (_when) => ({ x: -1, y: 0, z: 0 }),                            // 太陽方向（数値）
  gstime: (_when) => 0,
  eciToEcf: (pos) => pos,
  ecfToLookAngles: (_site, _ecf) => ({ elevation: 0 }),
};

// ★ default と 名前付きを両方提供することで import 形の差を吸収
module.exports = { ...mod, default: mod };