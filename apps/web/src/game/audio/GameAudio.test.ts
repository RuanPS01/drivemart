import { describe, expect, it } from 'vitest';
import { engineRpm } from './GameAudio';

describe('engineRpm', () => {
  it('fica em marcha lenta parado e sobe ao acelerar', () => {
    expect(engineRpm(0, 0)).toBeLessThan(1200);
    expect(engineRpm(0, 1)).toBeGreaterThan(engineRpm(0, 0));
  });

  it('cai ao trocar de marcha e nunca passa do giro máximo', () => {
    const beforeShift = engineRpm(10.9, 1);
    const afterShift = engineRpm(11.5, 1);
    expect(afterShift).toBeLessThan(beforeShift);
    for (let v = 0; v < 70; v += 0.5) expect(engineRpm(v, 1)).toBeLessThanOrEqual(6200);
  });
});
