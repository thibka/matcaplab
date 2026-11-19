import * as THREE from 'three';
import { EnvMapLoader, loadCustomModelGeometry, loadModelGeometry } from './loaders';
import type { AssetLoadEvent, MaterialType, SceneState, ToneMappingOption, ViewportLayout } from './types';

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
    private customGeometry: THREE.BufferGeometry | null = null;
    private envMapLoader: EnvMapLoader;
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
        this.envMapLoader = new EnvMapLoader(this.renderer);

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

    get hasCustomModel(): boolean {
        return this.customGeometry !== null;
    }

    // Loads a user .glb/.gltf (see loadCustomModelGeometry). It is shown when the geometry key is CUSTOM_MODEL.
    async loadCustomModel(file: File): Promise<void> {
        const merged = await loadCustomModelGeometry(file);
        const previous = this.customGeometry;
        this.customGeometry = merged;
        if (this.currentGeometryKey === CUSTOM_MODEL) {
            this.previewMesh.geometry = merged;
        }
        previous?.dispose();
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
        this.envMapLoader.load(slug).then(
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
        loadModelGeometry(key).then(
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
