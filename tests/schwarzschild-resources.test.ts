import { describe, expect, it } from 'vitest';

import { decodeFloatLookup } from '../src/simulations/orbital-lab/renderer/schwarzschild-beam-resources';

describe('Schwarzschild beam lookup resources', () => {
  it('decodes a dimensioned two-channel float table', () => {
    const source = new Float32Array([2, 1, 0.25, 0.5, 0.75, 1]);
    const lookup = decodeFloatLookup(source.buffer, 2, 1);

    expect(lookup.width).toBe(2);
    expect(lookup.height).toBe(1);
    expect([...lookup.values]).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it('rejects mismatched or truncated tables', () => {
    const source = new Float32Array([2, 1, 0.25, 0.5]);
    expect(() => decodeFloatLookup(source.buffer, 2, 1)).toThrow(RangeError);
    expect(() => decodeFloatLookup(source.buffer, 4, 1)).toThrow(RangeError);
  });
});
