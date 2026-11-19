import type { SceneState } from './types';

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const HASH_KEY = 's';

// Allowed values for enum-like properties, keyed by their dotted path in SceneState (e.g. 'model.geometry').
export type StateEnums = Record<string, readonly (string | number)[]>;

// Deep copy of the state as plain JSON data (perfect-gui turns state properties into accessors).
export function snapshotState(state: SceneState): SceneState {
    return JSON.parse(JSON.stringify(state));
}

// Copies the values of `source` into `target` in place, so perfect-gui bindings keep working.
// Only keys already present in `target` are copied, and only when the value has the same type
// (hex colors must stay hex colors, enum values must be allowed): anything else keeps its current value.
export function applyState(target: SceneState, source: unknown, enums: StateEnums = {}) {
    assignInPlace(target as unknown as Record<string, unknown>, source, enums, '');
}

function assignInPlace(target: Record<string, unknown>, source: unknown, enums: StateEnums, path: string) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return;
    }
    const values = source as Record<string, unknown>;
    for (const key of Object.keys(target)) {
        if (!(key in values)) {
            continue;
        }
        const keyPath = path ? `${path}.${key}` : key;
        const current = target[key];
        const next = values[key];

        if (current && typeof current === 'object') {
            assignInPlace(current as Record<string, unknown>, next, enums, keyPath);
        } else if (isValidValue(current, next, enums[keyPath]) && current !== next) {
            target[key] = next;
        }
    }
}

function isValidValue(current: unknown, next: unknown, allowed?: readonly (string | number)[]): boolean {
    if (allowed) {
        return allowed.includes(next as string | number);
    }
    if (typeof current !== typeof next) {
        return false;
    }
    if (typeof next === 'number') {
        return Number.isFinite(next);
    }
    if (typeof current === 'string' && HEX_COLOR.test(current)) {
        return HEX_COLOR.test(next as string);
    }
    return true;
}

// Encodes the state as base64url JSON, suitable for a URL hash.
export function encodeState(state: SceneState): string {
    const bytes = new TextEncoder().encode(JSON.stringify(state));
    let binary = '';
    bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decodes a value produced by encodeState. Returns null if it is malformed.
export function decodeState(encoded: string): unknown {
    try {
        const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

// Reads the encoded state from a location hash like '#s=<encoded>'.
export function readStateFromHash(hash: string): unknown {
    const value = new URLSearchParams(hash.replace(/^#/, '')).get(HASH_KEY);
    return value ? decodeState(value) : null;
}

export function stateToHash(state: SceneState): string {
    return `#${HASH_KEY}=${encodeState(state)}`;
}
