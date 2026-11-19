import * as THREE from 'three';
// Loaders are only imported as types here: their code is fetched with import() on first use, keeping it out of the main bundle.
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type {
    AssetLoadEvent,
    EnvMapOption,
    MaterialType,
    PolyHavenFilesResponse,
    SceneState,
    ToneMappingOption,
    ViewportLayout,
} from './types';

const NONE_THUMBNAIL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkBAMAAACCzIhnAAAALVBMVEUAAABQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFD0f7CQAAAADnRSTlMAEM/vcN8gkIA8n69gv9AeqN0AAAGeSURBVFjD7ZW7SgNBFIbPelmDiCxJL6ayEIIBCxuDYmUTrERUZBt78QFCQCxsrCysxMbSIIKt2Nja2IvmQkxivmcwE8Lu6c4+wHzVDuw/35kLZ8Tj8Xg8HsfNS6W1eiXZCS4YcxiPvh/jLIkaE/qx5HkSmx0SjoMS93ZiDsU5zcgu6wvY3I2Cm1ccRVsyBWyMZw4vwUlMatCd/BY2oGsnFoAtmVAYDyxO4S9ZVgkom5GGmjdPB7uyEPpKUqyBtf552E8lzagAdSMyC3UlkRysGZE7iJVEggo9I3LNQEtEvmgbkVfaWiJSZWBESvS0xFXaMSIVfpRkxBItIwLfqcSxCHYklaQRo7BUkq2wE3pa4pbftDdZSTJtcpWhlrg5fs0L04q0JMS8MNNQ15Ic7BmRHJSVRE4x+1gAXSWRBsR2g+EklcxAXywKoCQfsG9GZoCyHrxlan39OHkCjAaT9q6DOHlmlu1IHsfAtfFPYBhlkaygOMsiaUbvJKyLTZWia/gTupHYfLgzCR+A5JmxWNgWx+1zpXW0Kx6Px+PxjPgHBlQp+dv2kycAAAAASUVORK5CYII=';

// Available environment maps, sourced live from the Poly Haven API. 'none' disables the effect.
export const ENV_MAPS: EnvMapOption[] = [
    { label: 'None', slug: '', thumbnail: NONE_THUMBNAIL },
    {
        label: 'Theater',
        slug: 'theater_01',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/theater_01.png?height=100',
    },
    {
        label: 'Syfer Fontein',
        slug: 'syferfontein_1d_clear_puresky',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/syferfontein_1d_clear_puresky.png?height=100',
    },
    {
        label: 'The Sky Is On Fire',
        slug: 'the_sky_is_on_fire',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/the_sky_is_on_fire.png?height=100',
    },
    {
        label: 'Warm Bar',
        slug: 'warm_bar',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/warm_bar.png?height=100',
    },
    {
        label: 'Whipple Creek Regional Park',
        slug: 'whipple_creek_regional_park_04',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/whipple_creek_regional_park_04.png?height=100',
    },
    {
        label: 'Wooden Studio',
        slug: 'wooden_studio_10',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/wooden_studio_10.png?height=100',
    },
    {
        label: 'Wrestling Gym',
        slug: 'wrestling_gym',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/wrestling_gym.png?height=100',
    },
    {
        label: 'Golden Bay',
        slug: 'golden_bay',
        thumbnail: 'https://cdn.polyhaven.com/asset_img/primary/golden_bay.png?height=100',
    },
];

// Tone mapping operators offered in the GUI. 'None' must stay first (perfect-gui falls back to the first value).
export const TONE_MAPPINGS: ToneMappingOption[] = [
    { label: 'None', value: THREE.NoToneMapping },
    { label: 'Linear', value: THREE.LinearToneMapping },
    { label: 'Reinhard', value: THREE.ReinhardToneMapping },
    { label: 'Cineon', value: THREE.CineonToneMapping },
    { label: 'ACES Filmic', value: THREE.ACESFilmicToneMapping },
    { label: 'AgX', value: THREE.AgXToneMapping },
    { label: 'Neutral', value: THREE.NeutralToneMapping },
];

// GLSL functions from three's tonemapping_pars_fragment chunk, keyed by operator.
const TONE_MAPPING_FUNCTIONS: Record<THREE.ToneMapping, string> = {
    [THREE.NoToneMapping]: '',
    [THREE.LinearToneMapping]: 'LinearToneMapping',
    [THREE.ReinhardToneMapping]: 'ReinhardToneMapping',
    [THREE.CineonToneMapping]: 'CineonToneMapping',
    [THREE.ACESFilmicToneMapping]: 'ACESFilmicToneMapping',
    [THREE.AgXToneMapping]: 'AgXToneMapping',
    [THREE.NeutralToneMapping]: 'NeutralToneMapping',
    [THREE.CustomToneMapping]: 'CustomToneMapping',
};

// The matcap is rendered at SUPERSAMPLING times its size per axis, then averaged down.
const SUPERSAMPLING = 2;
const MATCAP_PREVIEW_SIZE = 512;
// Exports are rendered in square tiles so large sizes never exceed the GPU's render target limits.
const EXPORT_TILE_SIZE = 1024;

// Linear HDR target that receives the supersampled sphere render (three outputs linear values into render targets).
function createHdrTarget(size: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(size, size, {
        type: THREE.HalfFloatType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });
}

// Display-referred 8-bit target: being sRGB, the GPU applies the sRGB transfer on write and decodes on sampling,
// so its bytes are exactly what ends up in the exported PNG.
function createMatcapTarget(size: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false });
}

// Downsamples the HDR render: each sample is tone mapped and clamped before averaging, like the on-screen
// render (tone mapping in the material shader, then MSAA resolve), so bright silhouettes stay anti-aliased.
// Background samples have alpha 0: they composite as black, or as transparency when `transparent` is set.
function createResolveMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        defines: { SUPERSAMPLING, TONE_MAP: '' },
        uniforms: {
            tDiffuse: { value: null },
            transparent: { value: false },
        },
        vertexShader: /* glsl */ `
            void main() {
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }`,
        fragmentShader: /* glsl */ `
            #include <tonemapping_pars_fragment>

            uniform sampler2D tDiffuse;
            uniform bool transparent;

            void main() {
                ivec2 origin = ivec2(gl_FragCoord.xy) * SUPERSAMPLING;
                vec3 color = vec3(0.0);
                float coverage = 0.0;
                for (int y = 0; y < SUPERSAMPLING; y++) {
                    for (int x = 0; x < SUPERSAMPLING; x++) {
                        vec4 texel = texelFetch(tDiffuse, origin + ivec2(x, y), 0);
                        color += saturate(TONE_MAP(texel.rgb)) * texel.a;
                        coverage += texel.a;
                    }
                }
                float sampleCount = float(SUPERSAMPLING * SUPERSAMPLING);
                // Straight (non-premultiplied) alpha when transparent, as PNG expects
                gl_FragColor = transparent
                    ? vec4(coverage > 0.0 ? color / coverage : vec3(0.0), coverage / sampleCount)
                    : vec4(color / sampleCount, 1.0);
            }`,
        depthTest: false,
        depthWrite: false,
    });
}

type SphereMaterial =
    THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial | THREE.MeshPhongMaterial | THREE.MeshToonMaterial | THREE.MeshLambertMaterial;

// No dithering: in the linear matcap render target it would add visible noise to dark areas,
// and the on-screen sphere must match the exported pixels.
function createSphereMaterial(type: MaterialType): SphereMaterial {
    switch (type) {
        case 'physical':
            return new THREE.MeshPhysicalMaterial();
        case 'phong':
            return new THREE.MeshPhongMaterial();
        case 'toon':
            return new THREE.MeshToonMaterial();
        case 'lambert':
            return new THREE.MeshLambertMaterial();
        default:
            return new THREE.MeshStandardMaterial();
    }
}

// Geometry key of the model loaded by the user with loadCustomModel.
export const CUSTOM_MODEL = 'custom';

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

// Network requests to Poly Haven fail after this delay instead of leaving the GUI waiting forever.
const REQUEST_TIMEOUT_MS = 20000;

async function fetchWithTimeout(url: string): Promise<Response> {
    const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}): ${url}`);
    }
    return response;
}

export function lightPosition(azimuthDeg: number, elevationDeg: number, radius = 5): THREE.Vector3 {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(radius * Math.cos(el) * Math.sin(az), radius * Math.sin(el), radius * Math.cos(el) * Math.cos(az));
}

export class MatcapScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private cameraViewSize: number;
    private sphere: THREE.Mesh<THREE.SphereGeometry, SphereMaterial>;
    private sphereMaterials = new Map<MaterialType, SphereMaterial>();
    private toonGradients = new Map<number, THREE.DataTexture>();
    private modelRadius = 1;
    private previewRadius = 0.85;
    private torusGeometry: THREE.TorusGeometry;
    private gltfLoader: Promise<GLTFLoader> | null = null;
    private modelGeometries = new Map<string, Promise<THREE.BufferGeometry>>();
    private customGeometry: THREE.BufferGeometry | null = null;
    private hdrLoader: Promise<HDRLoader> | null = null;
    private pmremGenerator: THREE.PMREMGenerator;
    private envMapTextures = new Map<string, Promise<THREE.Texture>>();
    // current* is the key requested by the GUI, applied* the one actually displayed (they differ while loading).
    private currentEnvMapSlug = '';
    private appliedEnvMapSlug = '';
    private autoRotate = true;
    private currentGeometryKey = '';
    private appliedGeometryKey = '';
    private keyLight: THREE.DirectionalLight;
    private fillLight: THREE.DirectionalLight;
    private rimLight: THREE.DirectionalLight;
    private ambient: THREE.AmbientLight;
    private container: HTMLElement;
    private matcapTarget: THREE.WebGLRenderTarget;
    private matcapHdrTarget: THREE.WebGLRenderTarget;
    private matcapCamera: THREE.OrthographicCamera;
    private resolveMaterial: THREE.ShaderMaterial;
    private resolveQuad: THREE.Mesh;
    private toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
    private previewElement: HTMLElement;
    private previewScene: THREE.Scene;
    private previewCamera: THREE.PerspectiveCamera;
    private previewMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshMatcapMaterial>;
    private matcapViewport = { x: 0, y: 0, width: 0, height: 0 };
    private previewViewport = { x: 0, y: 0, width: 0, height: 0 };
    private layout: ViewportLayout = 'split';
    onAssetLoad: ((event: AssetLoadEvent) => void) | null = null;
    // Render-on-demand flags: each on-screen pass is redrawn only when its content changed.
    private sphereDirty = true;
    private previewDirty = true;
    private renderedPreviewGeometry: THREE.BufferGeometry | null = null;

    constructor(container: HTMLElement, previewElement: HTMLElement) {
        this.container = container;
        this.previewElement = previewElement;
        // preserveDrawingBuffer keeps the last sphere pass on screen while only the preview is redrawn.
        this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x000000);
        this.cameraViewSize = 1.6;
        this.camera = new THREE.OrthographicCamera(
            -this.cameraViewSize,
            this.cameraViewSize,
            this.cameraViewSize,
            -this.cameraViewSize,
            0.1,
            100,
        );
        this.camera.position.set(0, 0, 5);

        const sphereGeometry = new THREE.SphereGeometry(this.modelRadius, 128, 128);
        this.sphere = new THREE.Mesh(sphereGeometry, this.getSphereMaterial('standard'));
        this.scene.add(this.sphere);

        this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(this.ambient);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 2);
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xffffff, 1);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0xffffff, 1);
        this.scene.add(this.rimLight);

        const radius = this.modelRadius;
        this.matcapTarget = createMatcapTarget(MATCAP_PREVIEW_SIZE);
        this.matcapHdrTarget = createHdrTarget(MATCAP_PREVIEW_SIZE * SUPERSAMPLING);
        this.matcapCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
        this.matcapCamera.position.set(0, 0, 5);
        this.matcapCamera.lookAt(0, 0, 0);

        // Full-screen triangle running the resolve pass
        const resolveGeometry = new THREE.BufferGeometry();
        resolveGeometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
        this.resolveMaterial = createResolveMaterial();
        this.resolveQuad = new THREE.Mesh(resolveGeometry, this.resolveMaterial);
        this.resolveQuad.frustumCulled = false;

        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x161616);
        this.previewCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        this.previewCamera.position.set(0, 0, 5);

        this.torusGeometry = new THREE.TorusGeometry(this.previewRadius, this.previewRadius * 0.4, 64, 128);
        const previewNormalMap = new THREE.TextureLoader().load(
            `${import.meta.env.BASE_URL}textures/Concrete047A_1K-JPG_NormalGL.jpg`,
            () => {
                this.previewDirty = true;
            },
        );
        previewNormalMap.wrapS = THREE.RepeatWrapping;
        previewNormalMap.wrapT = THREE.RepeatWrapping;
        const previewMaterial = new THREE.MeshMatcapMaterial({
            matcap: this.matcapTarget.texture,
            normalMap: previewNormalMap,
            dithering: true,
            // The matcap already holds tone-mapped colors
            toneMapped: false,
        });
        this.previewMesh = new THREE.Mesh(this.torusGeometry, previewMaterial);
        this.previewScene.add(this.previewMesh);
        this.currentGeometryKey = 'torus';
        this.appliedGeometryKey = 'torus';

        new ResizeObserver(() => this.resize()).observe(container);
        this.watchPixelRatio();
        this.resize();
        this.animate();
    }

    // Re-applies the pixel ratio when the window moves to a screen with another density (or the page is zoomed).
    private watchPixelRatio() {
        matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
            'change',
            () => {
                this.resize();
                this.watchPixelRatio();
            },
            { once: true },
        );
    }

    setLayout(layout: ViewportLayout) {
        this.layout = layout;
        this.updateViewports();
    }

    private resize() {
        const { clientWidth, clientHeight } = this.container;
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(clientWidth, clientHeight);
        this.updateViewports();
        // setSize clears the canvas: redraw right away instead of showing a blank frame until the next tick.
        this.renderFrame();
    }

    private updateViewports() {
        const containerRect = this.container.getBoundingClientRect();
        const previewRect = this.previewElement.getBoundingClientRect();

        const previewX = previewRect.left - containerRect.left;
        const previewTop = previewRect.top - containerRect.top;
        const previewWidth = previewRect.width;
        const previewHeight = previewRect.height;

        this.previewViewport = {
            x: previewX,
            y: this.container.clientHeight - previewTop - previewHeight,
            width: previewWidth,
            height: previewHeight,
        };

        if (this.layout === 'overlay') {
            this.matcapViewport = { x: 0, y: 0, width: this.container.clientWidth, height: this.container.clientHeight };
        } else {
            const stackedVertically = previewWidth >= this.container.clientWidth - 1;
            this.matcapViewport = stackedVertically
                ? { x: 0, y: this.container.clientHeight - previewTop, width: this.container.clientWidth, height: previewTop }
                : { x: 0, y: 0, width: this.container.clientWidth - previewWidth, height: this.container.clientHeight };
        }

        const matcapAspect = this.matcapViewport.width / this.matcapViewport.height;
        this.camera.left = -this.cameraViewSize * matcapAspect;
        this.camera.right = this.cameraViewSize * matcapAspect;
        this.camera.top = this.cameraViewSize;
        this.camera.bottom = -this.cameraViewSize;
        this.camera.updateProjectionMatrix();
        this.sphereDirty = true;
    }

    private animate = () => {
        requestAnimationFrame(this.animate);

        if (this.autoRotate) {
            this.previewMesh.rotation.y += 0.006;
            this.previewDirty = true;
        }

        this.renderFrame();
    };

    // Draws only the passes whose content changed since the last frame; the canvas keeps the others.
    private renderFrame() {
        if (this.previewMesh.geometry !== this.renderedPreviewGeometry) {
            this.previewDirty = true;
        }
        if (!this.sphereDirty && !this.previewDirty) {
            return;
        }

        this.renderer.setScissorTest(true);

        if (this.sphereDirty) {
            // Scissored matcap sphere pass
            this.renderer.setScissor(this.matcapViewport.x, this.matcapViewport.y, this.matcapViewport.width, this.matcapViewport.height);
            this.renderer.setViewport(this.matcapViewport.x, this.matcapViewport.y, this.matcapViewport.width, this.matcapViewport.height);
            this.renderer.render(this.scene, this.camera);
            this.sphereDirty = false;
            // In overlay layout the sphere pass paints under the preview, which must then be drawn again.
            this.previewDirty = true;
        }

        if (this.previewDirty) {
            // Scissored model preview pass
            this.renderer.setScissor(
                this.previewViewport.x,
                this.previewViewport.y,
                this.previewViewport.width,
                this.previewViewport.height,
            );
            this.renderer.setViewport(
                this.previewViewport.x,
                this.previewViewport.y,
                this.previewViewport.width,
                this.previewViewport.height,
            );
            this.previewCamera.aspect = this.previewViewport.width / this.previewViewport.height;
            this.previewCamera.updateProjectionMatrix();
            this.renderer.render(this.previewScene, this.previewCamera);
            this.previewDirty = false;
            this.renderedPreviewGeometry = this.previewMesh.geometry;
        }

        this.renderer.setScissorTest(false);
    }

    // Lazily imports and creates a GLTFLoader able to decode Draco-compressed meshes (decoder files are bundled by Vite).
    private getGLTFLoader(): Promise<GLTFLoader> {
        if (!this.gltfLoader) {
            this.gltfLoader = Promise.all([
                import('three/examples/jsm/loaders/GLTFLoader.js'),
                import('three/examples/jsm/loaders/DRACOLoader.js'),
            ]).then(([{ GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }]) =>
                // glTF-specific Draco decoder: lighter than the default generic one (192 KB of wasm instead of 286 KB).
                new GLTFLoader().setDRACOLoader(new DRACOLoader().setDecoderPath(DRACO_GLTF_CONFIG)),
            );
            this.gltfLoader.catch(() => (this.gltfLoader = null));
        }
        return this.gltfLoader;
    }

    // Lazily imports and creates the HDR loader, only needed once an environment map is picked.
    private getHDRLoader(): Promise<HDRLoader> {
        if (!this.hdrLoader) {
            this.hdrLoader = import('three/examples/jsm/loaders/HDRLoader.js').then(({ HDRLoader }) => new HDRLoader());
            this.hdrLoader.catch(() => (this.hdrLoader = null));
        }
        return this.hdrLoader;
    }

    // Loads the first mesh geometry of public/models/<name>.glb, cached per model name.
    private loadModelGeometry(name: string): Promise<THREE.BufferGeometry> {
        let loading = this.modelGeometries.get(name);
        if (!loading) {
            const file = `${name}.glb`;
            loading = new Promise<THREE.BufferGeometry>((resolve, reject) => {
                this.getGLTFLoader().then(
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
            loading.catch(() => this.modelGeometries.delete(name));
            this.modelGeometries.set(name, loading);
        }
        return loading;
    }

    get hasCustomModel(): boolean {
        return this.customGeometry !== null;
    }

    // Loads a user .glb/.gltf (self-contained): all its meshes are merged in world space,
    // centered and scaled to fit the preview. It is shown when the geometry key is CUSTOM_MODEL.
    async loadCustomModel(file: File): Promise<void> {
        const [loader, { mergeGeometries }] = await Promise.all([
            this.getGLTFLoader(),
            import('three/examples/jsm/utils/BufferGeometryUtils.js'),
        ]);
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

        const previous = this.customGeometry;
        this.customGeometry = merged;
        if (this.currentGeometryKey === CUSTOM_MODEL) {
            this.previewMesh.geometry = merged;
        }
        previous?.dispose();
    }

    private async resolvePolyHavenHdrUrl(slug: string): Promise<string> {
        const response = await fetchWithTimeout(`https://api.polyhaven.com/files/${slug}`);
        const data: PolyHavenFilesResponse = await response.json();
        const resolutions = Object.entries(data.hdri ?? {}).sort(([a], [b]) => parseInt(a) - parseInt(b));
        const url = resolutions[0]?.[1]?.hdr?.url;
        if (!url) {
            throw new Error(`No .hdr file found for Poly Haven asset "${slug}"`);
        }
        return url;
    }

    private loadEnvMapTexture(slug: string): Promise<THREE.Texture> {
        let loading = this.envMapTextures.get(slug);
        if (!loading) {
            // The .hdr is downloaded with fetch (so it can time out) and handed to HDRLoader as a blob URL.
            loading = this.resolvePolyHavenHdrUrl(slug)
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
            loading.catch(() => this.envMapTextures.delete(slug));
            this.envMapTextures.set(slug, loading);
        }
        return loading;
    }

    private setEnvMap(slug: string) {
        if (slug === this.currentEnvMapSlug) {
            return;
        }
        this.currentEnvMapSlug = slug;

        // Applied through scene.environment (intensity: scene.environmentIntensity) so that every
        // material type supporting image-based lighting picks it up.
        if (!slug) {
            this.scene.environment = null;
            this.appliedEnvMapSlug = '';
            this.onAssetLoad?.({ kind: 'envMap', key: slug, status: 'ready' });
            return;
        }
        this.onAssetLoad?.({ kind: 'envMap', key: slug, status: 'loading' });
        this.loadEnvMapTexture(slug).then(
            (texture) => {
                if (this.currentEnvMapSlug !== slug) {
                    return;
                }
                this.scene.environment = texture;
                this.appliedEnvMapSlug = slug;
                this.renderMatcap();
                this.onAssetLoad?.({ kind: 'envMap', key: slug, status: 'ready' });
            },
            (error) => {
                if (this.currentEnvMapSlug !== slug) {
                    return;
                }
                // Back to what is still displayed, so selecting the failed env map again retries it.
                this.currentEnvMapSlug = this.appliedEnvMapSlug;
                this.onAssetLoad?.({ kind: 'envMap', key: slug, status: 'error', error, fallback: this.appliedEnvMapSlug });
            },
        );
    }

    // One material instance per type, created on first use and kept to avoid recompiling shaders.
    private getSphereMaterial(type: MaterialType): SphereMaterial {
        let material = this.sphereMaterials.get(type);
        if (!material) {
            material = createSphereMaterial(type);
            this.sphereMaterials.set(type, material);
        }
        return material;
    }

    // Toon shading gradient with `steps` flat bands.
    private getToonGradient(steps: number): THREE.DataTexture {
        let gradient = this.toonGradients.get(steps);
        if (!gradient) {
            const data = new Uint8Array(steps);
            for (let i = 0; i < steps; i++) {
                data[i] = Math.round((i / (steps - 1)) * 255);
            }
            gradient = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
            gradient.minFilter = THREE.NearestFilter;
            gradient.magFilter = THREE.NearestFilter;
            gradient.needsUpdate = true;
            this.toonGradients.set(steps, gradient);
        }
        return gradient;
    }

    private updateSphereMaterial({ material: state }: SceneState) {
        const material = this.getSphereMaterial(state.type);
        this.sphere.material = material;
        material.color.set(state.color);

        // MeshPhysicalMaterial extends MeshStandardMaterial.
        if (material instanceof THREE.MeshStandardMaterial) {
            material.roughness = state.roughness;
            material.metalness = state.metalness;
        }
        if (material instanceof THREE.MeshPhysicalMaterial) {
            const physical = state.physical;
            material.clearcoat = physical.clearcoat;
            material.clearcoatRoughness = physical.clearcoatRoughness;
            material.sheen = physical.sheen;
            material.sheenColor.set(physical.sheenColor);
            material.sheenRoughness = physical.sheenRoughness;
            material.iridescence = physical.iridescence;
            material.iridescenceIOR = physical.iridescenceIOR;
            material.iridescenceThicknessRange = [100, physical.iridescenceThickness];
            material.specularIntensity = physical.specularIntensity;
            material.specularColor.set(physical.specularColor);
            material.ior = physical.ior;
        }
        if (material instanceof THREE.MeshPhongMaterial) {
            material.shininess = state.phong.shininess;
            material.specular.set(state.phong.specular);
        }
        if (material instanceof THREE.MeshToonMaterial) {
            material.gradientMap = this.getToonGradient(state.toon.steps);
        }
    }

    private setGeometry(key: string) {
        if (key === this.currentGeometryKey) {
            return;
        }
        this.currentGeometryKey = key;
        if (key === 'torus') {
            this.previewMesh.geometry = this.torusGeometry;
            this.appliedGeometryKey = key;
            this.onAssetLoad?.({ kind: 'model', key, status: 'ready' });
            return;
        }
        if (key === CUSTOM_MODEL) {
            // The user model is loaded beforehand by loadCustomModel; without one, keep the displayed model.
            if (this.customGeometry) {
                this.previewMesh.geometry = this.customGeometry;
                this.appliedGeometryKey = key;
                this.onAssetLoad?.({ kind: 'model', key, status: 'ready' });
            } else {
                this.currentGeometryKey = this.appliedGeometryKey;
            }
            return;
        }
        this.onAssetLoad?.({ kind: 'model', key, status: 'loading' });
        this.loadModelGeometry(key).then(
            (geometry) => {
                if (this.currentGeometryKey !== key) {
                    return;
                }
                this.previewMesh.geometry = geometry;
                this.appliedGeometryKey = key;
                this.onAssetLoad?.({ kind: 'model', key, status: 'ready' });
            },
            (error) => {
                if (this.currentGeometryKey !== key) {
                    return;
                }
                this.currentGeometryKey = this.appliedGeometryKey;
                this.onAssetLoad?.({ kind: 'model', key, status: 'error', error, fallback: this.appliedGeometryKey });
            },
        );
    }

    update(state: SceneState) {
        this.setGeometry(state.model.geometry);
        this.autoRotate = state.model.autorotate;

        this.keyLight.color.set(state.key.color);
        this.keyLight.intensity = state.key.intensity;
        this.keyLight.position.copy(lightPosition(state.key.azimuth, state.key.elevation));

        this.fillLight.color.set(state.fill.color);
        this.fillLight.intensity = state.fill.intensity;
        this.fillLight.position.copy(lightPosition(state.fill.azimuth, state.fill.elevation));

        this.rimLight.color.set(state.rim.color);
        this.rimLight.intensity = state.rim.intensity;
        this.rimLight.position.copy(lightPosition(state.rim.azimuth, state.rim.elevation));

        this.ambient.color.set(state.ambient.color);
        this.ambient.intensity = state.ambient.intensity;

        this.updateSphereMaterial(state);
        this.setEnvMap(state.material.envMap);
        this.scene.environmentIntensity = state.material.envMapIntensity;

        this.setToneMapping(state.toneMapping.mode, state.toneMapping.exposure);

        this.renderMatcap();
    }

    // The on-screen sphere gets tone mapping from the renderer; the matcap gets the same operator in its resolve pass.
    private setToneMapping(mode: THREE.ToneMapping, exposure: number) {
        this.renderer.toneMapping = mode;
        this.renderer.toneMappingExposure = exposure;
        if (mode !== this.toneMapping) {
            this.toneMapping = mode;
            this.resolveMaterial.defines.TONE_MAP = TONE_MAPPING_FUNCTIONS[mode];
            this.resolveMaterial.needsUpdate = true;
        }
    }

    // Renders the sphere seen by `camera` into `hdrTarget`, then resolves it into `target`.
    private renderMatcapTo(
        target: THREE.WebGLRenderTarget,
        hdrTarget: THREE.WebGLRenderTarget,
        camera: THREE.Camera,
        transparent: boolean,
    ) {
        const prevTarget = this.renderer.getRenderTarget();
        const prevClearAlpha = this.renderer.getClearAlpha();

        // Clear with alpha 0 so the resolve pass can tell the background from the sphere
        this.renderer.setClearAlpha(0);
        this.renderer.setRenderTarget(hdrTarget);
        this.renderer.render(this.scene, camera);
        this.renderer.setClearAlpha(prevClearAlpha);

        this.resolveMaterial.uniforms.tDiffuse.value = hdrTarget.texture;
        this.resolveMaterial.uniforms.transparent.value = transparent;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.resolveQuad, camera);

        this.renderer.setRenderTarget(prevTarget);
        // The on-screen sphere shows the same scene, so it is now stale too.
        this.sphereDirty = true;
    }

    // Renders the sphere into the live matcap render target, sampled by the preview torus.
    private renderMatcap() {
        this.renderMatcapTo(this.matcapTarget, this.matcapHdrTarget, this.matcapCamera, false);
    }

    // Renders the current sphere setup to a square PNG through the same pipeline as the preview matcap, tile by tile,
    // and triggers a download.
    async exportPNG(size: number, filename: string, transparent: boolean) {
        const tileSize = Math.min(size, EXPORT_TILE_SIZE);
        const target = createMatcapTarget(tileSize);
        const hdrTarget = createHdrTarget(tileSize * SUPERSAMPLING);

        // Orthographic, framed exactly to the sphere's radius
        const radius = this.modelRadius;
        const exportCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
        exportCamera.position.set(0, 0, 5);
        exportCamera.lookAt(0, 0, 0);

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d')!;
        const pixels = new Uint8Array(tileSize * tileSize * 4);
        const tile = new ImageData(tileSize, tileSize);
        const rowLength = tileSize * 4;

        for (let y = 0; y < size; y += tileSize) {
            for (let x = 0; x < size; x += tileSize) {
                exportCamera.setViewOffset(size, size, x, y, tileSize, tileSize);
                this.renderMatcapTo(target, hdrTarget, exportCamera, transparent);
                this.renderer.readRenderTargetPixels(target, 0, 0, tileSize, tileSize, pixels);
                // WebGL rows go bottom-up, canvas rows top-down
                for (let row = 0; row < tileSize; row++) {
                    const sourceStart = (tileSize - 1 - row) * rowLength;
                    tile.data.set(pixels.subarray(sourceStart, sourceStart + rowLength), row * rowLength);
                }
                context.putImageData(tile, x, y, 0, 0, Math.min(tileSize, size - x), Math.min(tileSize, size - y));
            }
        }

        target.dispose();
        hdrTarget.dispose();

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) {
            throw new Error('PNG encoding failed');
        }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
