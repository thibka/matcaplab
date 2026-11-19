import './styles/styles.scss';
import GUI from 'perfect-gui';
import { MatcapScene, ENV_MAPS } from './scene';
import type { SceneState, ViewportLayout } from './types';
import { randomInRange, randomColor, hslToHex } from './helpers';
import { applyState, readStateFromHash, snapshotState, stateToHash, type StateEnums } from './state';
import { StateHistory } from './history';

const viewport = document.querySelector<HTMLDivElement>('#viewport')!;
const preview = document.querySelector<HTMLDivElement>('#preview')!;
const panel = document.querySelector<HTMLDivElement>('#panel')!;
const layoutButtons = document.querySelectorAll<HTMLButtonElement>('.header__viewport-options .btn');

const state: SceneState = {
    model: { geometry: 'torus', autorotate: true },
    key: { color: '#ffffff', intensity: 2, azimuth: -40, elevation: 40 },
    fill: { color: '#88aaff', intensity: 0.6, azimuth: 130, elevation: -20 },
    ambient: { color: '#ffffff', intensity: 0.1 },
    material: { color: '#ffffff', roughness: 0.5, metalness: 0.5, envMap: '', envMapIntensity: 1 },
    exportSize: 512,
};

const EXPORT_SIZES = [256, 512, 1024, 2048, 4096];
const MODEL_GEOMETRIES = ['torus', 'suzanne', 'dragon'];

// Allowed values when restoring a state from outside (URL hash, preset file).
const STATE_ENUMS: StateEnums = {
    'model.geometry': MODEL_GEOMETRIES,
    'material.envMap': ENV_MAPS.map((option) => option.slug),
    exportSize: EXPORT_SIZES,
};

// Restores a shared state from the URL hash before the GUI reads its initial values.
applyState(state, readStateFromHash(location.hash), STATE_ENUMS);

const undoHistory = new StateHistory(JSON.stringify(state));

const scene = new MatcapScene(viewport, preview);

function setLayout(layout: ViewportLayout) {
    viewport.dataset.layout = layout;
    scene.setLayout(layout);
    layoutButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.layout === layout));
}

layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => setLayout(btn.dataset.layout as ViewportLayout));
});

setLayout('overlay');

function refresh() {
    scene.update(state);
    scheduleSettle();
}

// Once the state stops changing (e.g. at the end of a slider drag), records an undo step
// and syncs the URL hash, so a whole drag is a single undo step.
let settleTimeout = 0;
let pointerDown = false;
function scheduleSettle() {
    clearTimeout(settleTimeout);
    if (!pointerDown) {
        settleTimeout = window.setTimeout(settle, 300);
    }
}

// A slow drag can pause longer than the debounce: wait for the pointer release instead.
window.addEventListener('pointerdown', () => (pointerDown = true), true);
window.addEventListener('pointerup', () => {
    pointerDown = false;
    scheduleSettle();
}, true);
window.addEventListener('pointercancel', () => (pointerDown = false), true);

function settle() {
    clearTimeout(settleTimeout);
    undoHistory.commit(JSON.stringify(state));
    syncUrl();
}

// Keeps the URL hash in sync with the state, without adding browser history entries.
let lastWrittenHash = '';
function syncUrl() {
    lastWrittenHash = stateToHash(state);
    history.replaceState(null, '', lastWrittenHash);
}

function undo() {
    settle();
    const previous = undoHistory.undo();
    if (previous) {
        loadState(JSON.parse(previous));
    }
}

function redo() {
    settle();
    const next = undoHistory.redo();
    if (next) {
        loadState(JSON.parse(next));
    }
}

// Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z and Ctrl+Y redo. Text fields keep their native undo.
window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
    }
    const target = event.target as HTMLElement;
    const isTextField = target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && !['color', 'checkbox', 'range', 'button'].includes(target.type));
    if (isTextField || target.isContentEditable) {
        return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
            redo();
        } else {
            undo();
        }
    } else if (key === 'y' && event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        redo();
    }
});

// Applies an external state (shared link, preset) to the live state and the GUI.
function loadState(source: unknown) {
    applyState(state, source, STATE_ENUMS);
    selectEnvMap(state.material.envMap);
    refresh();
}

// A link pasted in the address bar of an already open tab only changes the hash.
window.addEventListener('hashchange', () => {
    if (location.hash !== lastWrittenHash) {
        loadState(readStateFromHash(location.hash));
    }
});

// Copies text with the Clipboard API, falling back to execCommand where clipboard access is denied.
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.append(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        return copied;
    }
}

const PRESET_FORMAT = 'matcaplab-preset';

function downloadFile(content: BlobPart, type: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function savePreset() {
    const preset = { format: PRESET_FORMAT, version: 1, state: snapshotState(state) };
    downloadFile(JSON.stringify(preset, null, 2), 'application/json', 'matcap-preset.json');
}

// Loads a preset file written by savePreset (a bare state object is accepted too).
async function loadPresetFile(file: File) {
    try {
        const data = JSON.parse(await file.text());
        loadState(data?.format === PRESET_FORMAT ? data.state : data);
    } catch (error) {
        console.error(`Could not load preset "${file.name}"`, error);
        alert(`"${file.name}" is not a valid MatcapLab preset.`);
    }
}

// Opens the native file picker and resolves with the chosen file, if any.
function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
        input.addEventListener('cancel', () => resolve(null));
        input.click();
    });
}

async function copyShareLink(button: HTMLElement) {
    settle();
    const url = location.href;
    if (!(await copyToClipboard(url))) {
        window.prompt('Copy this link:', url);
        return;
    }
    const label = button.textContent;
    button.textContent = 'Link copied!';
    setTimeout(() => (button.textContent = label), 1500);
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

    state.ambient.color = hslToHex(randomColor());
    state.ambient.intensity = randomInRange(0, 1, 2);

    state.material.color = hslToHex(randomColor());
    state.material.roughness = randomInRange(0.1, 0.8, 2);
    state.material.metalness = randomInRange(0, 0.6, 2);

    const randomEnvMap = ENV_MAPS[Math.floor(Math.random() * ENV_MAPS.length)];
    selectEnvMap(randomEnvMap.slug);
    state.material.envMapIntensity = randomInRange(0, 1.5, 1);

    refresh();
}

const gui = new GUI({
    container: panel,
    position: 'top left',
    draggable: false,
    width: 280,
    collapsible: false,
    onUpdate: refresh,
    label: 'Settings'
});

gui.button({ label: 'Randomize', tooltip: 'Undo with Ctrl/Cmd+Z' }).onClick(randomizePreset);

const presetFolder = gui.folder({ label: 'Preset' });
const copyLinkButton = presetFolder.button({ label: 'Copy link' });
copyLinkButton.onClick(() => copyShareLink(copyLinkButton.element));
presetFolder.button({ label: 'Save preset (.json)' }).onClick(savePreset);
presetFolder.button({ label: 'Load preset (.json)' }).onClick(async () => {
    const file = await pickFile('.json,application/json');
    if (file) {
        loadPresetFile(file);
    }
});

const exportFolder = gui.folder({ label: 'Export' });
exportFolder.list(state, 'exportSize', EXPORT_SIZES, { label: 'Size' });
exportFolder.button({ label: 'Export PNG' }).onClick(() => {
    const size = state.exportSize;
    scene.exportPNG(size, `matcap-${size}.png`);
});

const modelFolder = gui.folder({ label: 'Model' });
modelFolder.list(state.model, 'geometry', MODEL_GEOMETRIES, { label: 'Model' });
modelFolder.toggle(state.model, 'autorotate', { label: 'Auto-rotate' });

const envMapFolder = gui.folder({ label: 'Environment Map' });
const envMapImages = ENV_MAPS.map((option) => {
    const image = envMapFolder.image(option.thumbnail, {
        label: option.label,
        selected: state.material.envMap === option.slug,
        height: 50,
    });
    image.onClick(() => {
        state.material.envMap = option.slug;
    });
    return { slug: option.slug, element: image.element };
});

// Selects an env map both in state and in the image buttons' visual selection (needed when triggered
// programmatically, e.g. by randomizePreset, since clicking an image already updates its own state).
function selectEnvMap(slug: string) {
    state.material.envMap = slug;
    envMapImages.forEach(({ slug: optionSlug, element }) => {
        const selected = optionSlug === slug;
        element.classList.toggle('p-gui__image--selected', selected);
        element.setAttribute('aria-pressed', String(selected));
    });
}

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
materialFolder.slider(state.material, 'envMapIntensity', { label: 'Env Intensity', min: 0, max: 1.5, step: 0.01 });



refresh();
