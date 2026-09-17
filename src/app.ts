import './styles/styles.scss';
import GUI from 'perfect-gui';
import { MatcapScene, ENV_MAPS, type SceneState, type ViewportLayout } from './scene';
import { randomInRange, randomColor, hslToHex } from './helpers';

const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const panel = document.querySelector<HTMLDivElement>('#panel')!;
const layoutButtons = document.querySelectorAll<HTMLButtonElement>('.header__viewport-options .btn');

const state: SceneState = {
    model: { geometry: 'torus', autorotate: true },
    key: { color: '#ffffff', intensity: 2, azimuth: -40, elevation: 40 },
    fill: { color: '#88aaff', intensity: 0.6, azimuth: 130, elevation: -20 },
    ambient: { color: '#ffffff', intensity: 0.1 },
    material: { color: '#ffffff', roughness: 0.5, metalness: 0.5, envMap: 'none', envMapIntensity: 1 },
    exportSize: 512,
};

const EXPORT_SIZES = [256, 512, 1024, 2048, 4096];

const scene = new MatcapScene(viewport, preview);

function setLayout(layout: ViewportLayout) {
    viewport.dataset.layout = layout;
    scene.setLayout(layout);
    layoutButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.layout === layout));
}

layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => setLayout(btn.dataset.layout as ViewportLayout));
});

setLayout('split');

function refresh() {
    scene.update(state);
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
    position: 'top left',
    draggable: false,
    width: 280,
    onUpdate: refresh,
});

gui.button({ label: 'Randomize' }).onClick(randomizePreset);

const exportFolder = gui.folder({ label: 'Export' });
exportFolder.list(state, 'exportSize', EXPORT_SIZES, { label: 'Size' });
exportFolder.button({ label: 'Export PNG' }).onClick(() => {
    const size = state.exportSize;
    scene.exportPNG(size, `matcap-${size}.png`);
});

const modelFolder = gui.folder({ label: 'Model' });
modelFolder.list(state.model, 'geometry', ['torus', 'suzanne', 'dragon'], { label: 'Model' });
modelFolder.toggle(state.model, 'autorotate', { label: 'Auto-rotate' });

const envMapFolder = gui.folder({ label: 'Environment Map' });
ENV_MAPS.forEach((option) => {
    envMapFolder
        .image(option.thumbnail, { 
            label: option.label, 
            selected: state.material.envMap === option.key,
            height: 50,
        })
        .onClick(() => {
            state.material.envMap = option.key;
        });
});

const keyFolder = gui.folder({ label: 'Key Light' });
keyFolder.color(state.key, 'color', { label: 'Color' });
keyFolder.slider(state.key, 'intensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 });
keyFolder.angle(state.key, 'azimuth', { label: 'Azimuth', min: -180, max: 180, step: 1 });
keyFolder.angle(state.key, 'elevation', { label: 'Elevation', min: -90, max: 90, step: 1 });

const fillFolder = gui.folder({ label: 'Fill Light' });
fillFolder.color(state.fill, 'color', { label: 'Color' });
fillFolder.slider(state.fill, 'intensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 });
fillFolder.angle(state.fill, 'azimuth', { label: 'Azimuth', min: -180, max: 180, step: 1 });
fillFolder.angle(state.fill, 'elevation', { label: 'Elevation', min: -90, max: 90, step: 1 });

const ambientFolder = gui.folder({ label: 'Ambient Light' });
ambientFolder.color(state.ambient, 'color', { label: 'Color' });
ambientFolder.slider(state.ambient, 'intensity', { label: 'Intensity', min: 0, max: 2, step: 0.01 });

const materialFolder = gui.folder({ label: 'Material' });
materialFolder.color(state.material, 'color', { label: 'Color' });
materialFolder.slider(state.material, 'roughness', { label: 'Roughness', min: 0, max: 1, step: 0.01 });
materialFolder.slider(state.material, 'metalness', { label: 'Metalness', min: 0, max: 1, step: 0.01 });
materialFolder.slider(state.material, 'envMapIntensity', { label: 'Env Intensity', min: 0, max: 3, step: 0.01 });



refresh();
