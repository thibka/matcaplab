import * as THREE from 'three';
// Loaders are only imported as types here: their code is fetched with import() on first use, keeping it out of the main bundle.
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { PolyHavenFilesResponse } from './types';

// Network requests to Poly Haven fail after this delay instead of leaving the GUI waiting forever.
const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string): Promise<Response> {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }
    return response;
}

let gltfLoader: Promise<GLTFLoader> | null = null;
const modelGeometries = new Map<string, Promise<THREE.BufferGeometry>>();

// Lazily imports and creates a GLTFLoader able to decode Draco-compressed meshes (decoder files are bundled by Vite).
function getGLTFLoader(): Promise<GLTFLoader> {
    if (!gltfLoader) {
        gltfLoader = Promise.all([
            import('three/examples/jsm/loaders/GLTFLoader.js'),
            import('three/examples/jsm/loaders/DRACOLoader.js'),
        ]).then(([{ GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }]) =>
            // glTF-specific Draco decoder: lighter than the default generic one (192 KB of wasm instead of 286 KB).
            new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG)),
        );
        gltfLoader.catch(() => (gltfLoader = null));
    }
    return gltfLoader;
}

// Loads the first mesh geometry of public/models/<name>.glb, cached per model name.
export function loadModelGeometry(name: string): Promise<THREE.BufferGeometry> {
    let loading = modelGeometries.get(name);
    if (!loading) {
        const file = `${name}.glb`;
        loading = new Promise<THREE.BufferGeometry>((resolve, reject) => {
            getGLTFLoader().then(
                (loader) =>
                    loader.load(
                        `${import.meta.env.BASE_URL}models/${file}`,
                        (gltf) => {
                            let geometry: THREE.BufferGeometry | null = null;
                            gltf.scene.traverse((child) => {
                                if (!geometry && (child as THREE.Mesh).isMesh) {
                                    geometry = (child as THREE.Mesh).geometry;
                                }
                            });
                            if (!geometry) {
                                reject(new Error(`No mesh found in ${file}`));
                                return;
                            }
                            const finalGeometry: THREE.BufferGeometry = geometry;
                            finalGeometry.center();
                            resolve(finalGeometry);
                        },
                        undefined,
                        reject,
                    ),
                reject,
            );
        });
        // Evict the failed entry so a future call retries instead of reusing the rejected promise.
        loading.catch(() => modelGeometries.delete(name));
        modelGeometries.set(name, loading);
    }
    return loading;
}

// Copies an attribute into a plain Float32 attribute (de-interleaved, de-quantized), so it can be transformed and merged.
function toFloat32Attribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): THREE.BufferAttribute {
    const { count, itemSize } = attribute;
    const array = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
        for (let c = 0; c < itemSize; c++) {
            array[i * itemSize + c] = attribute.getComponent(i, c);
        }
    }
    return new THREE.BufferAttribute(array, itemSize);
}

// Spherical UVs, used when a model has none (the preview normal map needs UVs).
function sphericalUVs(position: THREE.BufferAttribute): THREE.BufferAttribute {
    const uv = new Float32Array(position.count * 2);
    const point = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i).normalize();
        uv[i * 2] = 0.5 + Math.atan2(point.x, point.z) / (2 * Math.PI);
        uv[i * 2 + 1] = 0.5 + Math.asin(THREE.MathUtils.clamp(point.y, -1, 1)) / Math.PI;
    }
    return new THREE.BufferAttribute(uv, 2);
}

// Parses a user .glb/.gltf (self-contained): all its meshes are merged in world space,
// centered and scaled to fit the preview.
export async function loadCustomModelGeometry(file: File): Promise<THREE.BufferGeometry> {
    const [loader, { mergeGeometries }] = await Promise.all([getGLTFLoader(), import('three/examples/jsm/utils/BufferGeometryUtils.js')]);
    const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
    gltf.scene.updateMatrixWorld(true);

    const parts: THREE.BufferGeometry[] = [];
    gltf.scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const position = mesh.isMesh ? mesh.geometry.getAttribute('position') : undefined;
        if (!position) {
            return;
        }
        const part = new THREE.BufferGeometry();
        part.setAttribute('position', toFloat32Attribute(position));
        const normal = mesh.geometry.getAttribute('normal');
        if (normal) {
            part.setAttribute('normal', toFloat32Attribute(normal));
        }
        const uv = mesh.geometry.getAttribute('uv');
        if (uv) {
            part.setAttribute('uv', toFloat32Attribute(uv));
        }
        if (mesh.geometry.index) {
            part.setIndex(mesh.geometry.index.clone());
        }
        part.applyMatrix4(mesh.matrixWorld);
        if (!normal) {
            part.computeVertexNormals();
        }
        parts.push(part);
    });
    if (parts.length === 0) {
        throw new Error(`No mesh found in ${file.name}`);
    }

    // mergeGeometries needs the same attributes everywhere, and either all or none indexed.
    const allIndexed = parts.every((part) => part.index);
    const geometries = parts.map((part) => {
        const geometry = allIndexed ? part : part.index ? part.toNonIndexed() : part;
        if (!geometry.getAttribute('uv')) {
            geometry.setAttribute('uv', sphericalUVs(geometry.getAttribute('position') as THREE.BufferAttribute));
        }
        return geometry;
    });
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries);
    if (!merged) {
        throw new Error(`Could not merge the meshes of ${file.name}`);
    }
    merged.center();
    merged.computeBoundingSphere();
    // Same bounding sphere radius as the bundled models (~1.45).
    const radius = merged.boundingSphere?.radius ?? 0;
    if (radius > 0) {
        const scale = 1.45 / radius;
        merged.scale(scale, scale, scale);
    }
    return merged;
}

async function resolvePolyHavenHdrUrl(slug: string): Promise<string> {
    const response = await fetchWithTimeout(`https://api.polyhaven.com/files/${slug}`);
    const data: PolyHavenFilesResponse = await response.json();
    const resolutions = Object.entries(data.hdri ?? {}).sort(([a], [b]) => parseInt(a) - parseInt(b));
    const url = resolutions[0]?.[1]?.hdr?.url;
    if (!url) {
        throw new Error(`No .hdr file found for Poly Haven asset "${slug}"`);
    }
    return url;
}

// Downloads Poly Haven HDRIs and prefilters them into PMREM textures for the given renderer, cached per slug.
export class EnvMapLoader {
    private pmremGenerator: THREE.PMREMGenerator;
    private hdrLoader: Promise<HDRLoader> | null = null;
    private textures = new Map<string, Promise<THREE.Texture>>();

    constructor(renderer: THREE.WebGLRenderer) {
        this.pmremGenerator = new THREE.PMREMGenerator(renderer);
        this.pmremGenerator.compileEquirectangularShader();
    }

    // Lazily imports and creates the HDR loader, only needed once an environment map is picked.
    private getHDRLoader(): Promise<HDRLoader> {
        if (!this.hdrLoader) {
            this.hdrLoader = import('three/examples/jsm/loaders/HDRLoader.js').then(({ HDRLoader }) => new HDRLoader());
            this.hdrLoader.catch(() => (this.hdrLoader = null));
        }
        return this.hdrLoader;
    }

    load(slug: string): Promise<THREE.Texture> {
        let loading = this.textures.get(slug);
        if (!loading) {
            // The .hdr is downloaded with fetch (so it can time out) and handed to HDRLoader as a blob URL.
            loading = resolvePolyHavenHdrUrl(slug)
                .then((url) => fetchWithTimeout(url))
                .then((response) => response.blob())
                .then(async (blob) => {
                    const loader = await this.getHDRLoader();
                    const blobUrl = URL.createObjectURL(blob);
                    try {
                        const texture = await loader.loadAsync(blobUrl);
                        const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                        texture.dispose();
                        return envMap;
                    } finally {
                        URL.revokeObjectURL(blobUrl);
                    }
                });
            // Evict the failed entry so a future call retries instead of reusing the rejected promise.
            loading.catch(() => this.textures.delete(slug));
            this.textures.set(slug, loading);
        }
        return loading;
    }
}
