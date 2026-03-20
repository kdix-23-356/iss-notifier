// path: __mocks__/satellite.js
// satellite.js の完全手動モック（CommonJS）。default と名前付きを同一オブジェクトで提供。
const mod = {
  twoline2satrec: (_l1, _l2) => ({}),
  propagate: (_rec, _when) => ({ position: { x: 7000, y: 0, z: 0 } }),
  gstime: (_when) => 0,
  eciToEcf: (pos) => pos,
  ecfToLookAngles: (_site, _ecf) => ({ elevation: 0 }),
  sunPos: (_when) => ({ x: -1, y: 0, z: 0 }),
};

module.exports = { ...mod, default: mod };