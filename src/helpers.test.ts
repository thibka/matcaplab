import * as THREE from 'three';
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
    it('returns a hex color', () => {
        for (let i = 0; i < 100; i++) {
            expect(randomColor()).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('stays within the given lightness range', () => {
        for (let i = 0; i < 100; i++) {
            const color = new THREE.Color(randomColor([0, 1], [0.4, 0.6]));
            const { l } = color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
            expect(l).toBeGreaterThanOrEqual(0.39);
            expect(l).toBeLessThanOrEqual(0.61);
        }
    });

    it('gives black for zero lightness and white for full lightness', () => {
        expect(randomColor([0, 1], [0, 0])).toBe('#000000');
        expect(randomColor([0, 1], [1, 1])).toBe('#ffffff');
    });
});
