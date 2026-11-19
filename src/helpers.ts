import * as THREE from 'three';

export function randomInRange(min: number, max: number, decimals = 2): number {
    const value = min + Math.random() * (max - min);
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

// Returns a random hex color ('#rrggbb'). Saturation and lightness ranges are fractions (0 to 1),
// interpreted like CSS hsl() values.
export function randomColor(saturation: [number, number] = [0, 1], lightness: [number, number] = [0, 1]): string {
    const color = new THREE.Color().setHSL(Math.random(), randomInRange(...saturation), randomInRange(...lightness), THREE.SRGBColorSpace);
    return `#${color.getHexString()}`;
}
