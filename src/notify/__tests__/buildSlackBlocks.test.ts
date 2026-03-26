import { buildPassNotificationPayload, buildApiPassPayload, buildSchedulerPassPayload } from '../buildSlackBlocks';
import { ISS_TRACKER_URL } from '../constants';

describe('buildSlackBlocks', () => {
  const basePass = {
    aos: new Date('2024-01-01T00:00:00Z'),
    tca: new Date('2024-01-01T00:05:00Z'),
    los: new Date('2024-01-01T00:10:00Z'),
    maxEl: 45,
  };

  const baseWx = {
    time: '2024-01-01T00:00:00Z',
    cloudcover: 20,
    precipitation: 0,
    visibility: 10000,
    windspeed10m: 3,
  };

  const baseSun = { sunAltDeg: -10, twilight: 'astronomical' } as const;
  const baseIllum = { sunlit: true, eclipsed: false, distanceToSunAxisKm: 6300, nightSide: true } as const;
  const baseScore = { score: 85, decision: 'OK' as const, breakdown: { geometry: 37, weather: 38, light: 10 }};

  test('buildPassNotificationPayload includes action button when trackerUrl set', () => {
    const payload = buildPassNotificationPayload({
      stationName: 'Tokyo',
      aosIso: basePass.aos.toISOString(),
      tcaIso: basePass.tca.toISOString(),
      losIso: basePass.los.toISOString(),
      maxElDeg: basePass.maxEl,
      wx: baseWx,
      sun: baseSun,
      illum: baseIllum,
      score: baseScore,
      windowInfo: '探索: 3h, AOSしきい値: 15°',
      trackerUrl: ISS_TRACKER_URL,
    });

    expect(payload).toHaveProperty('attachments');
    const payloadAny = payload as any;
    expect(payloadAny.attachments).toBeDefined();
    const blocks = payloadAny.attachments[0].blocks as any[];
    expect(payloadAny.attachments[0]).toHaveProperty('color', '#2ecc71');
    expect(blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'header' }),
      expect.objectContaining({ type: 'actions' })
    ]));
    const action = blocks.find((b: any) => b.type === 'actions');
    expect((action as any).elements[0].url).toBe(ISS_TRACKER_URL);
  });

  test('buildPassNotificationPayload omits action when trackerUrl empty', () => {
    const payload = buildPassNotificationPayload({
      stationName: 'Tokyo',
      aosIso: basePass.aos.toISOString(),
      tcaIso: basePass.tca.toISOString(),
      losIso: basePass.los.toISOString(),
      maxElDeg: basePass.maxEl,
      wx: null,
      sun: baseSun,
      illum: null,
      score: baseScore,
      windowInfo: '探索: 2h, AOSしきい値: 10°',
      trackerUrl: '',
    });

    const payloadAny = payload as any;
    expect(payloadAny.attachments).toBeDefined();
    const blocks = payloadAny.attachments[0].blocks as any[];
    expect(blocks.some((b: any) => b.type === 'actions')).toBe(false);
  });

  test('buildApiPassPayload sets default windowInfo and ISS_TRACKER_URL', () => {
    const payload = buildApiPassPayload('Tokyo', basePass, baseWx, baseSun, baseIllum, baseScore, { windowHours: 4, aosDeg: 12 });

    const payloadAny = payload as any;
    expect(payloadAny.attachments).toBeDefined();
    const blocks = payloadAny.attachments[0].blocks as any[];
    expect(blocks.some((b: any) => b.type === 'context' && b.elements[0].text.includes('探索: 4h'))).toBe(true);
    const action = blocks.find((b: any) => b.type === 'actions');
    expect((action as any).elements[0].url).toBe(ISS_TRACKER_URL);
  });

  test('buildSchedulerPassPayload calculates minutesUntilAos', () => {
    const now = new Date('2024-01-01T00:00:00Z');
    const payload = buildSchedulerPassPayload('Tokyo', basePass, baseWx, baseSun, baseIllum, baseScore, now);
    const payloadAny = payload as any;
    expect(payloadAny.attachments).toBeDefined();
    const blocks = payloadAny.attachments[0].blocks as any[];
    const context = blocks.find((b: any) => b.type === 'context');
    expect(context).toBeDefined();
    expect((context as any).elements[0].text).toContain('自動通知: AOSまで約 0 分');
  });
});