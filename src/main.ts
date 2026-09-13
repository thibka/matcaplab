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

const gui = new GUI({
  container: panel,
  position: "top left",
  draggable: false,
  width: 280,
});

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
