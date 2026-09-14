import "./style.css";
import GUI from "perfect-gui";
import { MatcapScene, type SceneState } from "./scene";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="viewport"></div>
  <div id="panel"></div>
`;

const viewport = document.querySelector<HTMLDivElement>("#viewport")!;
const panel = document.querySelector<HTMLDivElement>("#panel")!;

const state: SceneState = {
  key: { color: "#ffffff", intensity: 2, azimuth: -40, elevation: 40 },
  fill: { color: "#88aaff", intensity: 0.6, azimuth: 130, elevation: -20 },
  material: { color: "#ffffff", roughness: 0.4, metalness: 0.1 },
  background: "#000000",
};

const exportState = { size: "1024" };
const EXPORT_SIZES = ["256", "512", "1024", "2048", "4096"];

const scene = new MatcapScene(viewport);

function refresh() {
  scene.update(state);
}

function randomInRange(min: number, max: number, decimals = 2): number {
  const value = min + Math.random() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function randomColor(): string {
  const hue = Math.floor(randomInRange(0, 360));
  const saturation = Math.floor(randomInRange(40, 90));
  const lightness = Math.floor(randomInRange(45, 85));
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function hslToHex(hsl: string): string {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.fillStyle = hsl;
  return ctx.fillStyle;
}

function randomizePreset() {
  state.key.color = hslToHex(randomColor());
  state.key.intensity = randomInRange(0.8, 3, 2);
  state.key.azimuth = randomInRange(-180, 180, 0);
  state.key.elevation = randomInRange(15, 75, 0);

  state.fill.color = hslToHex(randomColor());
  state.fill.intensity = randomInRange(0.2, 1.5, 2);
  state.fill.azimuth = randomInRange(-180, 180, 0);
  state.fill.elevation = randomInRange(-60, 10, 0);

  state.material.color = hslToHex(randomColor());
  state.material.roughness = randomInRange(0.1, 0.8, 2);
  state.material.metalness = randomInRange(0, 0.6, 2);

  refresh();
}

const gui = new GUI({
  container: panel,
  position: "top left",
  draggable: false,
  width: 280,
});

gui.button({ label: "Randomize" }).onClick(randomizePreset);

const keyFolder = gui.folder({ label: "Key Light" });
keyFolder.color(state.key, "color", { label: "Color" }).onChange(refresh);
keyFolder.slider(state.key, "intensity", { label: "Intensity", min: 0, max: 5, step: 0.05 }).onChange(refresh);
keyFolder.angle(state.key, "azimuth", { label: "Azimuth", min: -180, max: 180, step: 1 }).onChange(refresh);
keyFolder.angle(state.key, "elevation", { label: "Elevation", min: -90, max: 90, step: 1 }).onChange(refresh);

const fillFolder = gui.folder({ label: "Fill Light" });
fillFolder.color(state.fill, "color", { label: "Color" }).onChange(refresh);
fillFolder.slider(state.fill, "intensity", { label: "Intensity", min: 0, max: 5, step: 0.05 }).onChange(refresh);
fillFolder.angle(state.fill, "azimuth", { label: "Azimuth", min: -180, max: 180, step: 1 }).onChange(refresh);
fillFolder.angle(state.fill, "elevation", { label: "Elevation", min: -90, max: 90, step: 1 }).onChange(refresh);

const materialFolder = gui.folder({ label: "Material" });
materialFolder.color(state.material, "color", { label: "Color" }).onChange(refresh);
materialFolder.slider(state.material, "roughness", { label: "Roughness", min: 0, max: 1, step: 0.01 }).onChange(refresh);
materialFolder.slider(state.material, "metalness", { label: "Metalness", min: 0, max: 1, step: 0.01 }).onChange(refresh);

const backgroundFolder = gui.folder({ label: "Background" });
backgroundFolder.color(state, "background", { label: "Color" }).onChange(refresh);

const exportFolder = gui.folder({ label: "Export" });
exportFolder.list(exportState, "size", EXPORT_SIZES, { label: "Size" });
exportFolder.button({ label: "Export PNG" }).onClick(() => {
  const size = parseInt(exportState.size, 10);
  scene.exportPNG(size, `matcap-${size}.png`);
});

refresh();
