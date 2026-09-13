import * as THREE from "three";

export interface LightState {
  color: string;
  intensity: number;
  azimuth: number; // degrees, around Y
  elevation: number; // degrees, up from horizon
}

export interface MaterialState {
  color: string;
  roughness: number;
  metalness: number;
}

export interface SceneState {
  key: LightState;
  fill: LightState;
  material: MaterialState;
  background: string;
}

function lightPosition(azimuthDeg: number, elevationDeg: number, radius = 5): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return new THREE.Vector3(
    radius * Math.cos(el) * Math.sin(az),
    radius * Math.sin(el),
    radius * Math.cos(el) * Math.cos(az),
  );
}

export class MatcapScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private sphere: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.camera.position.set(0, 0, 5);

    const geometry = new THREE.SphereGeometry(1, 128, 128);
    const material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4, metalness: 0.1 });
    this.sphere = new THREE.Mesh(geometry, material);
    this.scene.add(this.sphere);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(this.ambient);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 2);
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xffffff, 1);
    this.scene.add(this.fillLight);

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.animate();
  }

  private resize() {
    const { clientWidth, clientHeight } = this.container;
    this.renderer.setSize(clientWidth, clientHeight);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
  };

  update(state: SceneState) {
    this.keyLight.color.set(state.key.color);
    this.keyLight.intensity = state.key.intensity;
    this.keyLight.position.copy(lightPosition(state.key.azimuth, state.key.elevation));

    this.fillLight.color.set(state.fill.color);
    this.fillLight.intensity = state.fill.intensity;
    this.fillLight.position.copy(lightPosition(state.fill.azimuth, state.fill.elevation));

    this.sphere.material.color.set(state.material.color);
    this.sphere.material.roughness = state.material.roughness;
    this.sphere.material.metalness = state.material.metalness;

    this.scene.background = new THREE.Color(state.background);
  }

  /** Renders the current sphere setup to a square PNG and triggers a download. */
  exportPNG(size: number, filename: string) {
    const exportRenderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    exportRenderer.setSize(size, size);
    exportRenderer.setPixelRatio(1);

    // Orthographic, framed exactly to the sphere's radius so it touches every edge.
    const radius = this.sphere.geometry.parameters.radius;
    const exportCamera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.1, 100);
    exportCamera.position.set(0, 0, 5);
    exportCamera.lookAt(0, 0, 0);

    exportRenderer.render(this.scene, exportCamera);
    const dataUrl = exportRenderer.domElement.toDataURL("image/png");

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();

    exportRenderer.dispose();
  }
}
