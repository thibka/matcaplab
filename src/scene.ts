import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { EnvMapOption, PolyHavenFilesResponse, SceneState, ViewportLayout } from './types';

const NONE_THUMBNAIL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkBAMAAACCzIhnAAAALVBMVEUAAABQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFD0f7CQAAAADnRSTlMAEM/vcN8gkIA8n69gv9AeqN0AAAGeSURBVFjD7ZW7SgNBFIbPelmDiCxJL6ayEIIBCxuDYmUTrERUZBt78QFCQCxsrCysxMbSIIKt2Nja2IvmQkxivmcwE8Lu6c4+wHzVDuw/35kLZ8Tj8Xg8HsfNS6W1eiXZCS4YcxiPvh/jLIkaE/qx5HkSmx0SjoMS93ZiDsU5zcgu6wvY3I2Cm1ccRVsyBWyMZw4vwUlMatCd/BY2oGsnFoAtmVAYDyxO4S9ZVgkom5GGmjdPB7uyEPpKUqyBtf552E8lzagAdSMyC3UlkRysGZE7iJVEggo9I3LNQEtEvmgbkVfaWiJSZWBESvS0xFXaMSIVfpRkxBItIwLfqcSxCHYklaQRo7BUkq2wE3pa4pbftDdZSTJtcpWhlrg5fs0L04q0JMS8MNNQ15Ic7BmRHJSVRE4x+1gAXSWRBsR2g+EklcxAXywKoCQfsG9GZoCyHrxlan39OHkCjAaT9q6DOHlmlu1IHsfAtfFPYBhlkaygOMsiaUbvJKyLTZWia/gTupHYfLgzCR+A5JmxWNgWx+1zpXW0Kx6Px+PxjPgHBlQp+dv2kycAAAAASUVORK5CYII=";

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

function lightPosition(azimuthDeg: number, elevationDeg: number, radius = 5): THREE.Vector3 {
    const az = THREE.MathUtils.degToRad(azimuthDeg);
    const el = THREE.MathUtils.degToRad(elevationDeg);
    return new THREE.Vector3(radius * Math.cos(el) * Math.sin(az), radius * Math.sin(el), radius * Math.cos(el) * Math.cos(az));
}

export class MatcapScene {
    private renderer: THREE.WebGLRenderer;
    private scene: THREE.Scene;
    private camera: THREE.OrthographicCamera;
    private cameraViewSize: number;
    private sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    private modelRadius = 1;
    private previewRadius = 0.85;
    private torusGeometry: THREE.TorusGeometry;
    private gltfLoader: GLTFLoader | null = null;
    private modelGeometries = new Map<string, Promise<THREE.BufferGeometry>>();
    private hdrLoader: HDRLoader;
    private pmremGenerator: THREE.PMREMGenerator;
    private envMapTextures = new Map<string, Promise<THREE.Texture>>();
    private currentEnvMapSlug = '';
    private autoRotate = true;
    private currentGeometryKey = '';
    private keyLight: THREE.DirectionalLight;
    private fillLight: THREE.DirectionalLight;
    private ambient: THREE.AmbientLight;
    private container: HTMLElement;
    private matcapTarget: THREE.WebGLRenderTarget;
    private matcapCamera: THREE.OrthographicCamera;
    private previewElement: HTMLElement;
    private previewScene: THREE.Scene;
    private previewCamera: THREE.PerspectiveCamera;
    private previewMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshMatcapMaterial>;
    private matcapViewport = { x: 0, y: 0, width: 0, height: 0 };
    private previewViewport = { x: 0, y: 0, width: 0, height: 0 };
    private layout: ViewportLayout = 'split';

    constructor(container: HTMLElement, previewElement: HTMLElement) {
        this.container = container;
        this.previewElement = previewElement;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);
        this.hdrLoader = new HDRLoader();
        this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
        this.pmremGenerator.compileEquirectangularShader();

        this.scene = new THREE.Scene();
        this.cameraViewSize = 1.6;
        this.camera = new THREE.OrthographicCamera(-this.cameraViewSize, this.cameraViewSize, this.cameraViewSize, -this.cameraViewSize, 0.1, 100);
        this.camera.position.set(0, 0, 5);

        const sphereGeometry = new THREE.SphereGeometry(this.modelRadius, 128, 128);
        const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.1, dithering: true });
        this.sphere = new THREE.Mesh(sphereGeometry, material);
        this.scene.add(this.sphere);

        this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
        this.scene.add(this.ambient);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 2);
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xffffff, 1);
        this.scene.add(this.fillLight);

        const radius = this.modelRadius;
        this.matcapTarget = new THREE.WebGLRenderTarget(512, 512);
        this.matcapCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
        this.matcapCamera.position.set(0, 0, 5);
        this.matcapCamera.lookAt(0, 0, 0);

        this.previewScene = new THREE.Scene();
        this.previewScene.background = new THREE.Color(0x161616);
        this.previewCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
        this.previewCamera.position.set(0, 0, 5);

        this.torusGeometry = new THREE.TorusGeometry(this.previewRadius, this.previewRadius * 0.4, 64, 128);
        const previewMaterial = new THREE.MeshMatcapMaterial({ matcap: this.matcapTarget.texture, dithering: true });
        this.previewMesh = new THREE.Mesh(this.torusGeometry, previewMaterial);
        this.previewScene.add(this.previewMesh);
        this.currentGeometryKey = 'torus';

        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.animate();
    }

    setLayout(layout: ViewportLayout) {
        this.layout = layout;
        this.updateViewports();
    }

    private resize() {
        const { clientWidth, clientHeight } = this.container;
        this.renderer.setSize(clientWidth, clientHeight);
        this.updateViewports();
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
    }

    private animate = () => {
        requestAnimationFrame(this.animate);

        if (this.autoRotate) {
            this.previewMesh.rotation.y += 0.006;
        }

        // Scissored matcap sphere pass
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(this.matcapViewport.x, this.matcapViewport.y, this.matcapViewport.width, this.matcapViewport.height);
        this.renderer.setViewport(this.matcapViewport.x, this.matcapViewport.y, this.matcapViewport.width, this.matcapViewport.height);
        this.renderer.render(this.scene, this.camera);

        // Scissored model preview pass
        this.renderer.setScissor(this.previewViewport.x, this.previewViewport.y, this.previewViewport.width, this.previewViewport.height);
        this.renderer.setViewport(this.previewViewport.x, this.previewViewport.y, this.previewViewport.width, this.previewViewport.height);
        this.previewCamera.aspect = this.previewViewport.width / this.previewViewport.height;
        this.previewCamera.updateProjectionMatrix();
        this.renderer.render(this.previewScene, this.previewCamera);
        this.renderer.setScissorTest(false);
    };

    // Lazily creates a GLTFLoader able to decode Draco-compressed meshes (decoder files are bundled by Vite).
    private getGLTFLoader(): GLTFLoader {
        if (!this.gltfLoader) {
            this.gltfLoader = new GLTFLoader().setDRACOLoader(new DRACOLoader());
        }
        return this.gltfLoader;
    }

    // Loads the first mesh geometry of public/models/<name>.glb, cached per model name.
    private loadModelGeometry(name: string): Promise<THREE.BufferGeometry> {
        let loading = this.modelGeometries.get(name);
        if (!loading) {
            const file = `${name}.glb`;
            loading = new Promise<THREE.BufferGeometry>((resolve, reject) => {
                this.getGLTFLoader().load(
                    `/models/${file}`,
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
                );
            });
            // Evict the failed entry so a future call retries instead of reusing the rejected promise.
            loading.catch(() => this.modelGeometries.delete(name));
            this.modelGeometries.set(name, loading);
        }
        return loading;
    }

    private async resolvePolyHavenHdrUrl(slug: string): Promise<string> {
        const response = await fetch(`https://api.polyhaven.com/files/${slug}`);
        if (!response.ok) {
            throw new Error(`Poly Haven files request failed for "${slug}" (${response.status})`);
        }
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
            loading = this.resolvePolyHavenHdrUrl(slug).then(
                (url) =>
                    new Promise<THREE.Texture>((resolve, reject) => {
                        this.hdrLoader.load(
                            url,
                            (texture) => {
                                const envMap = this.pmremGenerator.fromEquirectangular(texture).texture;
                                texture.dispose();
                                resolve(envMap);
                            },
                            undefined,
                            reject,
                        );
                    }),
            );
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

        if (!slug) {
            this.scene.environment = null;
            this.sphere.material.envMap = null;
            this.sphere.material.needsUpdate = true;
            return;
        }
        this.loadEnvMapTexture(slug).then((texture) => {
            if (this.currentEnvMapSlug === slug) {
                this.scene.environment = texture;
                this.sphere.material.envMap = texture;
                this.sphere.material.needsUpdate = true;
                this.renderMatcap();
            }
        });
    }

    private setGeometry(key: string) {
        if (key === this.currentGeometryKey) {
            return;
        }
        this.currentGeometryKey = key;
        if (key === 'torus') {
            this.previewMesh.geometry = this.torusGeometry;
            return;
        }
        this.loadModelGeometry(key).then((geometry) => {
            if (this.currentGeometryKey === key) {
                this.previewMesh.geometry = geometry;
            }
        });
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

        this.ambient.color.set(state.ambient.color);
        this.ambient.intensity = state.ambient.intensity;

        this.sphere.material.color.set(state.material.color);
        this.sphere.material.roughness = state.material.roughness;
        this.sphere.material.metalness = state.material.metalness;
        this.setEnvMap(state.material.envMap);
        this.sphere.material.envMapIntensity = state.material.envMapIntensity;

        this.scene.background = new THREE.Color(0x000000);

        this.renderMatcap();
    }

    // Renders the sphere into the live matcap render target, sampled by the preview torus.
    private renderMatcap() {
        const prevTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(this.matcapTarget);
        this.renderer.render(this.scene, this.matcapCamera);
        this.renderer.setRenderTarget(prevTarget);
    }

    // Renders the current sphere setup to a square PNG and triggers a download.
    exportPNG(size: number, filename: string) {
        const prevPixelRatio = this.renderer.getPixelRatio();
        const prevSize = new THREE.Vector2();
        this.renderer.getSize(prevSize);

        // Orthographic, framed exactly to the sphere's radius
        const radius = this.modelRadius;
        const exportCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
        exportCamera.position.set(0, 0, 5);
        exportCamera.lookAt(0, 0, 0);

        this.renderer.setPixelRatio(1);
        this.renderer.setSize(size, size, false);
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, size, size);
        this.renderer.render(this.scene, exportCamera);
        const dataUrl = this.renderer.domElement.toDataURL('image/png');

        this.renderer.setPixelRatio(prevPixelRatio);
        this.renderer.setSize(prevSize.x, prevSize.y, false);
        this.updateViewports();

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();
    }
}
