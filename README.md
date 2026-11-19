# MatcapLab

#### Video Demo: https://www.youtube.com/watch?v=ezj7XrKp8Dg

#### Description: A WebGL-based matcap generator with live lighting controls and PNG export.

https://thibka.github.io/matcaplab/

#### Context

A MatCap (short for Material Capture) is a single, pre-rendered image of a shaded sphere that encodes color, lighting, and reflections to fake complex lighting on 3D models.

Why use this technique?
Mostly for speed: matcaps bypass heavy render calculations, which makes real-time rendering fast. That's particularly useful for WebGL and WebGPU renders.

I created this tool because I wanted to have a way to generate matcaps quickly, and I wasn't convinced by already existing tools.

#### Walk-through

When opening the app, you'll see a live-rendered sphere in the viewport with a rotating preview model showing how the matcap will look once applied to a geometry. The preview model can be a torus, Suzanne (Blender's monkey head), a dragon, or your own `.glb` file (load it from the GUI or drop it anywhere), and auto-rotation can be turned off. The header buttons switch between two layouts: the preview overlaid on the sphere, or side by side.

You can tweak the key, fill, rim and ambient lights, the material (standard, physical, phong, toon or lambert) and the environment map through the GUI panel on the right, or hit Randomize to get a fresh lighting preset. Changes can be undone with Ctrl/Cmd+Z. The current settings are kept in the URL, so you can share a link, or save and load them as a `.json` preset.

Once you're happy with the result, click Export to download a square PNG at a chosen resolution (from 256 up to 4096px).

## How it works

We use Three.js to render a WebGL 3D sphere facing the camera.
The sphere is lit by ambient light, a key light, a fill light, a rim light, and an optional HDR environment map. The HDRIs come from [Poly Haven](https://polyhaven.com/hdris): they are fetched from its API only when you select one.

The sphere is rendered from an orthographic camera into an off-screen render target, framed so the sphere touches every edge of the frame.  
It is rendered at twice the matcap resolution into a linear HDR (half-float) target, then a resolve pass tone maps each sample, averages them down (2×2 supersampling) and writes the result into an 8-bit sRGB texture.  
That texture is the matcap: its bytes are exactly the ones a PNG export would contain.

Every time you tweak a light or material setting, that render target is refreshed, and its texture is fed straight into a `MeshMatcapMaterial` on the rotating preview mesh (with a concrete normal map, so you can see how the matcap reacts to surface detail). So you see the matcap applied to non-spherical geometry in real time.
The mesh needs nothing but its own vertex normals: no lights, no BRDF (no roughness/metalness parameters).

Exporting reuses this exact pipeline at the resolution you chose (256 up to 4096px), rendered in 1024px tiles so large sizes stay within GPU limits, and saves the result as a PNG (optionally with a transparent background). The on-screen sphere uses the same tone mapping operator, so the exported image matches what you saw on screen.

## Project structure

- **`index.html`** — Contains the 3 main elements of the DOM: the main viewport, the preview, and the right-side editor
- **`src/app.ts`** — This is the entry point. It defines the initial state of the scene (i.e. the default settings), instantiates the GUI, and triggers a re-render of the scene after any change of the state.
- **`src/scene.ts`** — That's where most of the rendering happens: the 3d scene (sphere, materials and lights), creating a matcap texture from an off-screen render, applying it as a texture to the preview model, the layout of the two viewports, and exporting the PNG.
- **`src/loaders.ts`** — Everything that fetches assets: the preview models (glTF + Draco), the custom models dropped by the user, and the Poly Haven environment maps (turned into PMREM textures). Loaded assets are cached, and a failed load is evicted from the cache so that picking it again retries it.
- **`src/envMaps.ts`** — The list of environment maps offered in the editor, with their Poly Haven slugs and thumbnails.
- **`src/state.ts`** — Serializes the state to the URL hash and to preset files, and validates a state read back from them.
- **`src/history.ts`** — The undo/redo stack.
- **`src/status.ts`** — The loading and error messages shown while assets are fetched.
- **`src/types.ts`** — The shape of the state.
- **`src/helpers.ts`** — Small random helpers used by the Randomize button.
- **`src/styles/`** — SCSS partials for the layout of the DOM elements, imported by `styles.scss`.
- **`public/`** — Static assets: the preview models (`models/`, Draco-compressed glTF binaries), the normal map of the preview (`textures/`) and the favicon.

## Stack choices

I have 15 years of experience writing vanilla JS/TS, so using TypeScript was a no-brainer.

I also have more than 10 years of experience with Three.js so that was the obvious choice for the 3d part.

To render the editor on the right side, I used [perfect-gui](https://thibka.github.io/perfect-gui/dist/), a JavaScript GUI library I wrote and have been maintaining for a few years now. Perfect-gui makes it possible to create image-buttons, which is why it's so useful for this kind of project.

## Running it locally

```bash
npm install
npm run dev
```

Requires Node 22.12+ or 24+ (see `.nvmrc`).

| Script                            | What it does                                                          |
| --------------------------------- | --------------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server                                                       |
| `npm run build`                   | Typecheck + production build in `dist/`                               |
| `npm run typecheck`               | `tsc` only                                                            |
| `npm run lint`                    | ESLint (`eslint.config.js`: JS + typescript-eslint recommended rules) |
| `npm run format` / `format:check` | Prettier (`.prettierrc.json`: 4 spaces, single quotes, 140 columns)   |
| `npm test` / `test:watch`         | Vitest unit tests (`src/*.test.ts`)                                   |

## CI and deployment

`.github/workflows/ci.yml` runs lint, format check, typecheck, tests and build on every pull request and every push to `main`.
On `main`, it then publishes `dist/` to GitHub Pages at https://thibka.github.io/matcaplab/ (repository settings: **Pages → Source: GitHub Actions**).

## AI usage

I used Claude Code to help me set up this project.
I like to use it to:

- get rid of the grunt work (ex: "move these functions into a separate helper file")
- challenge my ideas (ex: "would it make sense to do this or that")
- fix my English when I need to write README documentation for CS50 :)
