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
