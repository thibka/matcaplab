import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

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
    background: string;
};

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
    private suzanneGeometry: THREE.BufferGeometry | null = null;
    private suzanneLoading: Promise<THREE.BufferGeometry> | null = null;
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

    constructor(container: HTMLElement, previewElement: HTMLElement) {
        this.container = container;
        this.previewElement = previewElement;
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

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
        this.previewCamera.position.set(0, 0, 4);

        this.torusGeometry = new THREE.TorusGeometry(this.previewRadius, this.previewRadius * 0.4, 64, 128);
        const previewMaterial = new THREE.MeshMatcapMaterial({ matcap: this.matcapTarget.texture, dithering: true });
        this.previewMesh = new THREE.Mesh(this.torusGeometry, previewMaterial);
        this.previewScene.add(this.previewMesh);
        this.currentGeometryKey = 'torus';

        window.addEventListener('resize', () => this.resize());
        this.resize();
        this.animate();
    }

    private resize() {
        const { clientWidth, clientHeight } = this.container;
        this.renderer.setSize(clientWidth, clientHeight);

        const aspect = clientWidth / clientHeight;
        this.camera.left = -this.cameraViewSize * aspect;
        this.camera.right = this.cameraViewSize * aspect;
        this.camera.top = this.cameraViewSize;
        this.camera.bottom = -this.cameraViewSize;
        this.camera.updateProjectionMatrix();
    }

    private getPreviewViewport() {
        const containerRect = this.container.getBoundingClientRect();
        const previewRect = this.previewElement.getBoundingClientRect();

        const x = previewRect.left - containerRect.left;
        const top = previewRect.top - containerRect.top;
        const width = previewRect.width;
        const height = previewRect.height;

        return { x, y: this.container.clientHeight - top - height, width, height };
    }

    private animate = () => {
        requestAnimationFrame(this.animate);

        this.previewMesh.rotation.y += 0.006;

        // Full-canvas pass (main sphere scene)
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, this.container.clientWidth, this.container.clientHeight);
        this.renderer.render(this.scene, this.camera);

        // Scissored pass (preview torus)
        const viewport = this.getPreviewViewport();
        this.renderer.setScissorTest(true);
        this.renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
        this.renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
        this.previewCamera.aspect = viewport.width / viewport.height;
        this.previewCamera.updateProjectionMatrix();
        this.renderer.render(this.previewScene, this.previewCamera);
        this.renderer.setScissorTest(false);
    };

    private loadSuzanneGeometry(): Promise<THREE.BufferGeometry> {
        if (this.suzanneGeometry) {
            return Promise.resolve(this.suzanneGeometry);
        }
        if (!this.suzanneLoading) {
            this.suzanneLoading = new Promise((resolve, reject) => {
                new GLTFLoader().load(
                    '/suzanne.glb',
                    (gltf) => {
                        let geometry: THREE.BufferGeometry | null = null;
                        gltf.scene.traverse((child) => {
                            if (!geometry && (child as THREE.Mesh).isMesh) {
                                geometry = (child as THREE.Mesh).geometry;
                            }
                        });
                        if (!geometry) {
                            reject(new Error('No mesh found in suzanne.glb'));
                            return;
                        }
                        const finalGeometry: THREE.BufferGeometry = geometry;
                        finalGeometry.center();
                        this.suzanneGeometry = finalGeometry;
                        resolve(finalGeometry);
                    },
                    undefined,
                    reject,
                );
            });
        }
        return this.suzanneLoading;
    }

    private setGeometry(key: string) {
        if (key === this.currentGeometryKey) {
            return;
        }
        this.currentGeometryKey = key;
        if (key === 'suzanne') {
            this.loadSuzanneGeometry().then((geometry) => {
                if (this.currentGeometryKey === 'suzanne') {
                    this.previewMesh.geometry = geometry;
                }
            });
        } else {
            this.previewMesh.geometry = this.torusGeometry;
        }
    }

    update(state: SceneState) {
        this.setGeometry(state.model.geometry);

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

        this.scene.background = new THREE.Color(state.background);

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
        const exportRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        exportRenderer.setSize(size, size);
        exportRenderer.setPixelRatio(1);

        // Orthographic, framed exactly to the sphere's radius so it touches every edge.
        const radius = this.modelRadius;
        const exportCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
        exportCamera.position.set(0, 0, 5);
        exportCamera.lookAt(0, 0, 0);

        exportRenderer.render(this.scene, exportCamera);
        const dataUrl = exportRenderer.domElement.toDataURL('image/png');

        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = filename;
        link.click();

        exportRenderer.dispose();
    }
}
