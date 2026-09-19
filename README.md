# Matcap Creator

#### Video Demo: https://www.youtube.com/watch?v=ezj7XrKp8Dg

#### Description: This is a matcap generator. https://thibka.github.io/matcaplab/

#### Context

A MatCap (short for Material Capture) is a single, pre-rendered image of a shaded sphere that encodes color, lighting, and reflections to fake complex lighting on 3D models.

Why use this technique?
Mostly for speed: matcaps bypass heavy render calculations, which makes real-time rendering fast. That's particularly useful for WebGL and WebGPU renders.

I created this tool because I wanted to have a way to generate matcaps quickly, and I wasn't convinced by already existing tools.

#### Walk-through

When opening the app, you'll see a live-rendered sphere in the viewport with a rotating torus preview showing how the matcap will look once applied to a geometry.

You can tweak the settings through the GUI panel on the right, or hit Randomize to get a fresh lighting preset.

Once you're happy with the result, click Export to download a square PNG at a chosen resolution (from 256 up to 4096px). 

## How it works
We use Three.js to render a WebGL 3D sphere facing the camera. 
The sphere is lit by ambient light, a key light, a fill light, and an HDR.

The sphere is rendered from an orthographic camera into an off-screen render target, framed so the sphere touches every edge of the frame.  
That render target's texture is the matcap.

Every time you tweak a light or material setting, that render target is refreshed, and its texture is fed straight into a `MeshMatcapMaterial` on the rotating preview mesh. So you see the matcap applied to non-spherical geometry in real time.
The mesh needs nothing but its own vertex normals: no lights, no BRDF (no roughness/metalness parameters).

Exporting reuses this exact approach: a dedicated renderer sets up the same orthographic camera at the resolution you chose (256 up to 4096px), renders the sphere once, and saves the result as a PNG. Because it's the same projection used for the live preview, the exported image matches exactly what you saw on screen.

## Project structure

- **`index.html`** — Contains the 3 main elements of the DOM: the main viewport, the preview, and the right-side editor
- **`src/app.ts`** — This is the entry point. It defines the initial state of the scene (i.e. the default settings), instantiates the GUI, and triggers a re-render of the scene after any change of the state.
- **`src/scene.ts`** — That's where most of the heavy lifting is happening: rendering of the 3d scene (sphere and lights), creating a matcap texture from an off-screen render, and applying it as a texture to the preview torus.
- **`src/style.css`** — Not much happening here, just the basic layout of the DOM elements

## Stack choices
I have 15 years of experience writing vanilla JS/TS, so using TypeScript was a no-brainer.

I also have more than 10 years of experience with Three.js so that was the obvious choice for the 3d part.

To render the editor on the right side, I used [perfect-gui](https://thibka.github.io/perfect-gui/dist/), a JavaScript GUI library I wrote and have been maintaining for a few years now. Perfect-gui makes it possible to create image-buttons, which is why it's so useful for this kind of project. 

## Running it locally

```bash
npm install
npm run dev
```

## AI usage

I used Claude Code to help me set up this project. 
I like to use it to:
- get rid of the grunt work (ex: "move these functions into a separate helper file")
- challenge my ideas (ex: "would it make sense to do this or that")
- fix my English when I need to write README documentation for CS50 :)
