export function randomInRange(min: number, max: number, decimals = 2): number {
    const value = min + Math.random() * (max - min);
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

export function randomColor(): string {
    const hue = Math.floor(randomInRange(0, 360));
    const saturation = Math.floor(randomInRange(0, 100));
    const lightness = Math.floor(randomInRange(0, 100));

    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function hslToHex(hsl: string): string {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = hsl;
    return ctx.fillStyle;
}
