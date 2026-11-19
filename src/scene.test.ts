import { describe, expect, it } from 'vitest';
import { lightPosition } from './scene';

describe('lightPosition', () => {
    it('places a light at azimuth 0 and elevation 0 in front of the sphere (+Z)', () => {
        const p = lightPosition(0, 0);
        expect(p.x).toBeCloseTo(0);
        expect(p.y).toBeCloseTo(0);
        expect(p.z).toBeCloseTo(5);
    });

    it('rotates toward +X at azimuth 90', () => {
        const p = lightPosition(90, 0);
        expect(p.x).toBeCloseTo(5);
        expect(p.z).toBeCloseTo(0);
    });

    it('places the light straight above at elevation 90', () => {
        const p = lightPosition(123, 90);
        expect(p.x).toBeCloseTo(0);
        expect(p.y).toBeCloseTo(5);
        expect(p.z).toBeCloseTo(0);
    });

    it('places the light below the sphere for negative elevations', () => {
        expect(lightPosition(0, -45).y).toBeLessThan(0);
    });

    it('always lies on a sphere of the given radius', () => {
        for (const [azimuth, elevation] of [
            [-180, 15],
            [45, -60],
            [170, 75],
        ]) {
            expect(lightPosition(azimuth, elevation).length()).toBeCloseTo(5);
            expect(lightPosition(azimuth, elevation, 2).length()).toBeCloseTo(2);
        }
    });
});
