export type LightState = {
    color: string;
    intensity: number;
    azimuth: number;
    elevation: number;
};

export type MaterialType = 'standard' | 'physical' | 'phong' | 'toon' | 'lambert';

export type PhysicalState = {
    clearcoat: number;
    clearcoatRoughness: number;
    sheen: number;
    sheenColor: string;
    sheenRoughness: number;
    iridescence: number;
    iridescenceIOR: number;
    // Upper bound of the iridescence thickness range, in nanometers (the lower bound is 100).
    iridescenceThickness: number;
    specularIntensity: number;
    specularColor: string;
    ior: number;
};

export type MaterialState = {
    type: MaterialType;
    color: string;
    roughness: number;
    metalness: number;
    envMap: string;
    envMapIntensity: number;
    physical: PhysicalState;
    phong: { shininess: number; specular: string };
    toon: { steps: number };
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
    rim: LightState;
    ambient: AmbientState;
    material: MaterialState;
    exportSize: number;
};

export type ViewportLayout = 'split' | 'overlay';
