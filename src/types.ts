export type LightState = {
    color: string;
    intensity: number;
    azimuth: number;
    elevation: number;
};

export type MaterialState = {
    color: string;
    roughness: number;
    metalness: number;
    envMap: string;
    envMapIntensity: number;
};

export type EnvMapOption = {
    label: string;
    slug: string;
    thumbnail: string;
};

// Shape of the relevant subset of https://api.polyhaven.com/files/<slug>
export type PolyHavenFilesResponse = {
    hdri?: Record<string, { hdr?: { url: string } }>;
};

export type AmbientState = {
    color: string;
    intensity: number;
};

export type SceneState = {
    model: { geometry: string; autorotate: boolean };
    key: LightState;
    fill: LightState;
    ambient: AmbientState;
    material: MaterialState;
    exportSize: number;
};

export type ViewportLayout = 'split' | 'overlay';

export type AssetKind = 'envMap' | 'model';

// Progress of the env map / preview model requested by the GUI. On 'error', `fallback` is the key
// still displayed by the scene, so the GUI can revert its selection to it.
export type AssetLoadEvent =
    | { kind: AssetKind; key: string; status: 'loading' }
    | { kind: AssetKind; key: string; status: 'ready' }
    | { kind: AssetKind; key: string; status: 'error'; error: unknown; fallback: string };
