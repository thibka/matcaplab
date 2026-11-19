import './styles/styles.scss';
import GUI from 'perfect-gui';
import { NeutralToneMapping } from 'three';
import { ENV_MAPS } from './envMaps';
import { MatcapScene, CUSTOM_MODEL, TONE_MAPPINGS } from './scene';
import { AssetStatus, describeLoadError } from './status';
import type { AssetKind, LightState, MaterialType, SceneState, ViewportLayout } from './types';
import { randomInRange, randomColor } from './helpers';
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
    // Placed behind the sphere (azimuth 180 is opposite the camera) to light its silhouette.
    rim: { color: '#ffffff', intensity: 1, azimuth: 160, elevation: 35 },
    ambient: { color: '#ffffff', intensity: 0.1 },
    material: {
        type: 'standard',
        color: '#ffffff',
        roughness: 0.5,
        metalness: 0.5,
        envMap: '',
        envMapIntensity: 1,
        physical: {
            clearcoat: 0,
            clearcoatRoughness: 0.1,
            sheen: 0,
            sheenColor: '#ffffff',
            sheenRoughness: 0.5,
            iridescence: 0,
            iridescenceIOR: 1.3,
            iridescenceThickness: 400,
            specularIntensity: 1,
            specularColor: '#ffffff',
            ior: 1.5,
        },
        phong: { shininess: 30, specular: '#111111' },
        toon: { steps: 3 },
    },
    toneMapping: { mode: NeutralToneMapping, exposure: 1 },
    exportSize: 512,
    exportTransparent: false,
};

const EXPORT_SIZES = [256, 512, 1024, 2048, 4096];
const MODEL_GEOMETRIES = ['torus', 'suzanne', 'dragon'];
const MATERIAL_TYPES: { label: string; value: MaterialType }[] = [
    { label: 'Standard', value: 'standard' },
    { label: 'Physical', value: 'physical' },
    { label: 'Phong', value: 'phong' },
    { label: 'Toon', value: 'toon' },
    { label: 'Lambert', value: 'lambert' },
];

// Allowed values when restoring a state from outside (URL hash, preset file).
const STATE_ENUMS: StateEnums = {
    'model.geometry': MODEL_GEOMETRIES,
    'material.type': MATERIAL_TYPES.map((option) => option.value),
    'material.envMap': ENV_MAPS.map((option) => option.slug),
    'toneMapping.mode': TONE_MAPPINGS.map((option) => option.value),
    exportSize: EXPORT_SIZES,
};

// Undo/redo may also restore the user's custom model, which a shared link or preset can't carry.
const HISTORY_ENUMS: StateEnums = { ...STATE_ENUMS, 'model.geometry': [...MODEL_GEOMETRIES, CUSTOM_MODEL] };

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
const releasePointer = () => {
    pointerDown = false;
    scheduleSettle();
};
window.addEventListener('pointerup', releasePointer, true);
window.addEventListener('pointercancel', releasePointer, true);

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
        loadState(JSON.parse(previous), HISTORY_ENUMS);
    }
}

function redo() {
    settle();
    const next = undoHistory.redo();
    if (next) {
        loadState(JSON.parse(next), HISTORY_ENUMS);
    }
}

// Cmd/Ctrl+Z undoes, Cmd/Ctrl+Shift+Z and Ctrl+Y redo. Text fields keep their native undo.
window.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
    }
    const target = event.target as HTMLElement;
    const isTextField =
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLInputElement && !['color', 'checkbox', 'range', 'button'].includes(target.type));
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
function loadState(source: unknown, enums = STATE_ENUMS) {
    applyState(state, source, enums);
    selectEnvMap(state.material.envMap);
    syncLists();
    refresh();
}

// On programmatic changes, perfect-gui's list() only moves the `selected` attribute, which the browser
// ignores once the user has picked an option: the dropdowns' displayed values are forced here.
const syncedLists: { select: HTMLSelectElement; read: () => string | number }[] = [];
function syncList(list: { element: HTMLElement }, read: () => string | number) {
    syncedLists.push({ select: list.element.querySelector('select')!, read });
}

function syncLists() {
    syncedLists.forEach(({ select, read }) => (select.value = String(read())));
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

// Shows a user .glb/.gltf in the preview.
// Reports progress and failures like the bundled assets (viewport badge + model control); on failure the
// current model stays, and Retry asks for another file since reading the same one again would fail the same way.
async function loadCustomModel(file: File) {
    assetStatus.loading('model', file.name);
    markGuiControl('model', CUSTOM_MODEL, 'loading');
    try {
        await scene.loadCustomModel(file);
    } catch (error) {
        console.error(`Could not load model "${file.name}"`, error);
        markGuiControl('model', CUSTOM_MODEL, 'error');
        assetStatus.error(
            'model',
            `Couldn't load ${file.name}: only self-contained .glb/.gltf files are supported.`,
            () => pickFile('.glb,.gltf').then((next) => next && loadCustomModel(next)),
            () => markGuiControl('model', CUSTOM_MODEL, null),
        );
        return;
    }
    assetStatus.clear('model');
    markGuiControl('model', CUSTOM_MODEL, null);
    state.model.geometry = CUSTOM_MODEL;
    syncLists();
    refresh();
}

// Dropping a file anywhere loads it: a .glb/.gltf model or a .json preset.
function handleDroppedFile(file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'glb' || extension === 'gltf') {
        loadCustomModel(file);
    } else if (extension === 'json') {
        loadPresetFile(file);
    } else {
        alert(`"${file.name}" is not supported. Drop a .glb/.gltf model or a .json preset.`);
    }
}

let dragDepth = 0;
const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
window.addEventListener('dragenter', (event) => {
    if (isFileDrag(event)) {
        dragDepth++;
        document.body.classList.add('is-dragging-file');
    }
});
window.addEventListener('dragleave', (event) => {
    if (isFileDrag(event) && --dragDepth <= 0) {
        dragDepth = 0;
        document.body.classList.remove('is-dragging-file');
    }
});
window.addEventListener('dragover', (event) => {
    if (isFileDrag(event)) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'copy';
    }
});
window.addEventListener('drop', (event) => {
    if (!isFileDrag(event)) {
        return;
    }
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove('is-dragging-file');
    const file = event.dataTransfer?.files[0];
    if (file) {
        handleDroppedFile(file);
    }
});

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

// Randomization ranges are kept away from the extremes: a lightness near 0 or 1 would give
// black or washed-out materials, so presets stay usable.
function randomizePreset() {
    state.key.color = randomColor([0, 0.6], [0.6, 0.9]);
    state.key.intensity = randomInRange(0.8, 3, 2);
    state.key.azimuth = randomInRange(-180, 180, 0);
    state.key.elevation = randomInRange(15, 75, 0);

    state.fill.color = randomColor([0.3, 0.9], [0.4, 0.8]);
    state.fill.intensity = randomInRange(0.2, 1.5, 2);
    state.fill.azimuth = randomInRange(-180, 180, 0);
    state.fill.elevation = randomInRange(-60, 10, 0);

    state.rim.color = randomColor([0, 0.6], [0.6, 0.9]);
    state.rim.intensity = randomInRange(0.5, 3, 2);
    // Behind the sphere: azimuth within 60° of 180.
    state.rim.azimuth = ((randomInRange(120, 240, 0) + 180) % 360) - 180;
    state.rim.elevation = randomInRange(-30, 60, 0);

    state.ambient.color = randomColor([0, 0.6], [0.3, 0.8]);
    state.ambient.intensity = randomInRange(0, 1, 2);

    state.material.color = randomColor([0.2, 0.9], [0.3, 0.8]);
    state.material.roughness = randomInRange(0.1, 0.8, 2);
    state.material.metalness = randomInRange(0, 0.6, 2);

    // Type-specific settings; layers that would be too much on every roll (sheen, iridescence) stay rare.
    const physical = state.material.physical;
    physical.clearcoat = Math.random() < 0.5 ? randomInRange(0.2, 1, 2) : 0;
    physical.clearcoatRoughness = randomInRange(0, 0.5, 2);
    physical.sheen = Math.random() < 0.3 ? randomInRange(0.2, 1, 2) : 0;
    physical.sheenColor = randomColor([0.2, 0.9], [0.4, 0.9]);
    physical.sheenRoughness = randomInRange(0.2, 1, 2);
    physical.iridescence = Math.random() < 0.3 ? randomInRange(0.3, 1, 2) : 0;
    physical.iridescenceIOR = randomInRange(1.1, 2, 2);
    physical.iridescenceThickness = Math.round(randomInRange(200, 800, 0) / 10) * 10;
    physical.specularIntensity = randomInRange(0.5, 1, 2);
    physical.ior = randomInRange(1.2, 2, 2);
    state.material.phong.shininess = randomInRange(5, 150, 0);
    state.material.phong.specular = randomColor([0, 0.4], [0.6, 1]);
    state.material.toon.steps = randomInRange(2, 5, 0);

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
    label: 'Settings',
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
syncList(exportFolder.list(state, 'exportSize', EXPORT_SIZES, { label: 'Size' }), () => state.exportSize);
exportFolder.toggle(state, 'exportTransparent', { label: 'Transparent background' });
exportFolder.button({ label: 'Export PNG' }).onClick(() => {
    const size = state.exportSize;
    scene.exportPNG(size, `matcap-${size}.png`, state.exportTransparent).catch((error) => console.error('Export failed:', error));
});

const modelFolder = gui.folder({ label: 'Model' });
const modelOptions = [
    ...MODEL_GEOMETRIES.map((geometry) => ({ label: geometry, value: geometry })),
    { label: 'custom (.glb)', value: CUSTOM_MODEL },
];
let lastBuiltInModel = state.model.geometry;
const modelList = modelFolder.list(state.model, 'geometry', modelOptions, { label: 'Model' }).onChange((option) => {
    const value = typeof option === 'object' ? option.value : option;
    if (value !== CUSTOM_MODEL) {
        lastBuiltInModel = String(value);
    } else if (!scene.hasCustomModel) {
        // Nothing to show yet: stay on the current model and ask for a file instead.
        state.model.geometry = lastBuiltInModel;
        syncLists();
        pickFile('.glb,.gltf').then((file) => file && loadCustomModel(file));
    }
});
syncList(modelList, () => state.model.geometry);
modelFolder.button({ label: 'Load model (.glb)', tooltip: 'You can also drop a .glb file anywhere' }).onClick(async () => {
    const file = await pickFile('.glb,.gltf');
    if (file) {
        loadCustomModel(file);
    }
});
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

function addLightFolder(label: string, light: LightState) {
    const folder = gui.folder({ label });
    folder.color(light, 'color', { label: 'Color' });
    folder.slider(light, 'intensity', { label: 'Intensity', min: 0, max: 5, step: 0.05 });
    folder.angle(light, 'azimuth', { label: 'Azimuth', min: -180, max: 180, step: 1 });
    folder.angle(light, 'elevation', { label: 'Elevation', min: -90, max: 90, step: 1 });
}

addLightFolder('Key Light', state.key);
addLightFolder('Fill Light', state.fill);
addLightFolder('Rim Light', state.rim);

const ambientFolder = gui.folder({ label: 'Ambient Light' });
ambientFolder.color(state.ambient, 'color', { label: 'Color' });
ambientFolder.slider(state.ambient, 'intensity', { label: 'Intensity', min: 0, max: 2, step: 0.01 });

const materialFolder = gui.folder({ label: 'Material' });
const materialTypeList = materialFolder.list(state.material, 'type', MATERIAL_TYPES, { label: 'Type' });
syncList(materialTypeList, () => state.material.type);
materialFolder.color(state.material, 'color', { label: 'Color' });
const roughnessSlider = materialFolder.slider(state.material, 'roughness', { label: 'Roughness', min: 0, max: 1, step: 0.01 });
const metalnessSlider = materialFolder.slider(state.material, 'metalness', { label: 'Metalness', min: 0, max: 1, step: 0.01 });
const envIntensitySlider = materialFolder.slider(state.material, 'envMapIntensity', {
    label: 'Env Intensity',
    min: 0,
    max: 1.5,
    step: 0.01,
});

const physical = state.material.physical;
const physicalFolder = materialFolder.folder({ label: 'Physical' });
physicalFolder.slider(physical, 'clearcoat', { label: 'Clearcoat', min: 0, max: 1, step: 0.01 });
physicalFolder.slider(physical, 'clearcoatRoughness', { label: 'Clearcoat Roughness', min: 0, max: 1, step: 0.01 });
physicalFolder.slider(physical, 'sheen', { label: 'Sheen', min: 0, max: 1, step: 0.01 });
physicalFolder.color(physical, 'sheenColor', { label: 'Sheen Color' });
physicalFolder.slider(physical, 'sheenRoughness', { label: 'Sheen Roughness', min: 0, max: 1, step: 0.01 });
physicalFolder.slider(physical, 'iridescence', { label: 'Iridescence', min: 0, max: 1, step: 0.01 });
physicalFolder.slider(physical, 'iridescenceIOR', { label: 'Iridescence IOR', min: 1, max: 2.333, step: 0.01 });
physicalFolder.slider(physical, 'iridescenceThickness', { label: 'Iridescence Thickness (nm)', min: 100, max: 800, step: 10 });
physicalFolder.slider(physical, 'specularIntensity', { label: 'Specular Intensity', min: 0, max: 1, step: 0.01 });
physicalFolder.color(physical, 'specularColor', { label: 'Specular Color' });
physicalFolder.slider(physical, 'ior', { label: 'IOR', min: 1, max: 2.333, step: 0.01 });

const shininessSlider = materialFolder.slider(state.material.phong, 'shininess', { label: 'Shininess', min: 1, max: 200, step: 1 });
const phongSpecularColor = materialFolder.color(state.material.phong, 'specular', { label: 'Specular Color' });
const toonStepsSlider = materialFolder.slider(state.material.toon, 'steps', { label: 'Toon Steps', min: 2, max: 8, step: 1 });

// Shows only the controls that apply to the selected material type.
const folderElement = (folder: { wrapper: HTMLElement }) => folder.wrapper.closest<HTMLElement>('.p-gui__folder')!;
const materialControls: [HTMLElement, MaterialType[]][] = [
    [roughnessSlider.element, ['standard', 'physical']],
    [metalnessSlider.element, ['standard', 'physical']],
    // Toon materials ignore image-based lighting.
    [envIntensitySlider.element, ['standard', 'physical', 'phong', 'lambert']],
    [folderElement(envMapFolder), ['standard', 'physical', 'phong', 'lambert']],
    [folderElement(physicalFolder), ['physical']],
    [shininessSlider.element, ['phong']],
    [phongSpecularColor.element, ['phong']],
    [toonStepsSlider.element, ['toon']],
];
function updateMaterialControls() {
    materialControls.forEach(([element, types]) => {
        element.style.display = types.includes(state.material.type) ? '' : 'none';
    });
}
materialTypeList.onChange(updateMaterialControls);
updateMaterialControls();

const toneMappingFolder = gui.folder({ label: 'Tone Mapping' });
syncList(toneMappingFolder.list(state.toneMapping, 'mode', TONE_MAPPINGS, { label: 'Mode' }), () => state.toneMapping.mode);
toneMappingFolder.slider(state.toneMapping, 'exposure', { label: 'Exposure', min: 0.1, max: 4, step: 0.01 });

const assetStatus = new AssetStatus(document.querySelector<HTMLDivElement>('#asset-status')!);

function assetLabel(kind: AssetKind, key: string): string {
    if (kind === 'envMap') {
        return ENV_MAPS.find((option) => option.slug === key)?.label ?? key;
    }
    return key.charAt(0).toUpperCase() + key.slice(1);
}

function selectAsset(kind: AssetKind, key: string) {
    if (kind === 'envMap') {
        selectEnvMap(key);
    } else {
        state.model.geometry = key;
        syncLists();
    }
}

// Flags the GUI control of an asset as loading or failed (the model list is a single control).
function markGuiControl(kind: AssetKind, key: string, status: 'loading' | 'error' | null) {
    const controls = kind === 'envMap' ? envMapImages : [{ slug: key, element: modelList.element }];
    controls.forEach(({ slug, element }) => {
        element.classList.toggle('is-loading', status === 'loading' && slug === key);
        element.classList.toggle('is-error', status === 'error' && slug === key);
    });
}

// On failure the scene keeps the previous asset, so the GUI selection reverts to it and the error offers a retry.
scene.onAssetLoad = (event) => {
    const label = assetLabel(event.kind, event.key);
    if (event.status === 'loading') {
        assetStatus.loading(event.kind, label);
        markGuiControl(event.kind, event.key, 'loading');
    } else if (event.status === 'ready') {
        assetStatus.clear(event.kind);
        markGuiControl(event.kind, event.key, null);
    } else {
        console.error(`Failed to load ${label}:`, event.error);
        selectAsset(event.kind, event.fallback);
        markGuiControl(event.kind, event.key, 'error');
        assetStatus.error(
            event.kind,
            `Couldn't load ${label} (${describeLoadError(event.error)}).`,
            () => {
                selectAsset(event.kind, event.key);
                refresh();
            },
            () => markGuiControl(event.kind, event.key, null),
        );
    }
};

refresh();
