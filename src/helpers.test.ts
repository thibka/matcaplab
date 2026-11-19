import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomColor, randomInRange } from './helpers';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('randomInRange', () => {
    it('returns min when Math.random returns 0', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
        expect(randomInRange(-180, 180)).toBe(-180);
    });

    it('interpolates linearly between min and max', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.25);
        expect(randomInRange(0, 4)).toBe(1);
    });

    it('rounds to the requested number of decimals', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.123456);
        expect(randomInRange(0, 1, 2)).toBe(0.12);
        expect(randomInRange(0, 1, 3)).toBe(0.123);
        expect(randomInRange(0, 100, 0)).toBe(12);
    });

    it('stays within [min, max] for random draws', () => {
        for (let i = 0; i < 1000; i++) {
            const value = randomInRange(0.2, 1.5, 2);
            expect(value).toBeGreaterThanOrEqual(0.2);
            expect(value).toBeLessThanOrEqual(1.5);
        }
    });
});

describe('randomColor', () => {
    it('returns a valid CSS hsl() string', () => {
        for (let i = 0; i < 100; i++) {
            const match = randomColor().match(/^hsl\((\d+), (\d+)%, (\d+)%\)$/);
            expect(match).not.toBeNull();
            const [hue, saturation, lightness] = match!.slice(1).map(Number);
            expect(hue).toBeLessThanOrEqual(360);
            expect(saturation).toBeLessThanOrEqual(100);
            expect(lightness).toBeLessThanOrEqual(100);
        }
    });

    it('builds the color from three random draws', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.5).mockReturnValueOnce(0.25).mockReturnValueOnce(0.75);
        expect(randomColor()).toBe('hsl(180, 25%, 75%)');
    });
});
