WebGL Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Christopher Yuen
  * [LinkedIn](https://www.linkedin.com/in/christopher-yuen-16b5a8221/)
* Tested on: Windows 11, 14th Gen Intel(R) Core(TM) i9-14900HX @ 2.22GHz 32GB, RTX 4090 Laptop GPU 16GB (Personal Laptop)

### Live Demo
[Live Demo Link](https://cj-yuen.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/) requries a WebGPU-capable browser (ie. Chrome)

[![](https://github.com/user-attachments/assets/79ed5a4d-97b0-45d7-8627-b006d377726a)](https://cj-yuen.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/)

### GIF
![Demo Gif Thumbnail](/demo_gif.gif)

### Demo Video
[![Demo Video Thumbnail](https://img.youtube.com/vi/sMJkOujd1T0/maxresdefault.jpg)](https://youtu.be/sMJkOujd1T0)


## Overview
This project implements three renderers in WebGPU that renders the Sponza atrium scene with up to 5000 moving point lights. Each renderer represents different tradeoffs between per-fragment light cost, memory bandwidth, and implementation complexity.

### Renderers

| Renderer | Description |
|---|---|
| Naive | Baseline per-fragment light loop, no clustering. |
| Forward+ | Cluster binning via compute, clustered lighting in the forward pass. |
| Clustered Deferred | Cluster binning + G-buffer + fullscreen lighting pass. |

### Effects

| Effect | Description |
|---|---|
| Bloom | Bright-pass extraction, separable Gaussian blur, additive composite. Implemented as a compute pass chain. |
| Toon  | Luminance posterization plus relative-depth edge detection for outlines. Implemented as a single compute pass. |


## Implementation
Both Forward+ and Clustered Deferred exploit the observation that a point light only affects things near it. With up to 5000 lights, any given pixel is realistically illuminated by 5–20 and thus looping over all 5000 per pixel would be a waste. The fix is to partition the view frustum into a 3D grid of boxes — clusters — each holding a list of lights whose influence sphere intersects that box. Shading a pixel only loops over its cluster's lights.

The clustering compute shader (`clustering.cs.wgsl`) dispatches one thread per cluster. Each thread unprojects its tile's four screen corners into view space to build an AABB, then loops over every light testing whether its view-space sphere touches the box. Hits are written to `clusterLightIndicesBuffer` and a running count to `clusterLightCountsBuffer`. Both buffers live in `lights.ts` and are shared by Forward+ and Clustered Deferred via `doLightClustering(encoder)`.

### Naive 
The naive implementation has every pixel loop over all `numLights` in the fragment shader and accumulates Lambertian contribution. There is no clustering. It works but is wasteful as the cost scales linearly with total light count.

### Forward+ 
Forward+ is naive implementation plus clustering. The geometry pass is unchanged with the only changes being in `forward_plus.fs.wgsl`:

1. Compute the pixel's cluster index from `fragCoord` (screen tile + inverse-exponential z-slice).
2. Read `clusterLightCounts[clusterIdx]` and iterate only over `clusterLightIndices[...]`.
3. Accumulate the same Lambertian contribution per light.

Now instead of 5000 lights per pixel, we do roughly 5–20. Now the cost scales with local light density. However, we deal have conservative clusters as each cluster holds every light that could potentially touch any pixel inside it. With coarse tiles (120 × 120 px), the boundaries are visible as faint tile bands. Finer grids cost more memory but reduces this artifact.

### Clustered Deferred 
Deferred implementation inverts the order: capture first, light later.

G-buffer pass (`clustered_deferred.fs.wgsl`) renders the scene normally but the fragment shader writes three values instead of a color: world position (+ depth in `.w`) as `rgba16float`, normal as `rgba16float`, and albedo as `rgba8unorm`. No lighting yet.

Fullscreen pass (`clustered_deferred_fullscreen.vs/fs.wgsl`) runs once per pixel via `draw(3)`. It reads the G-buffer, does the same cluster lookup as Forward+, and writes the final color.

The clustered deferred implementation lights each visible surface exactly once as overlapping surfaces are depth-tested into the G-buffer, and only the closest fragment is ever shaded. The tradeoff is bandwidth with three textures being written and read per pixel every frame. At low light counts that bandwidth may cost more than the saved lighting work.

### Bloom (Post-Processing)

| Bloom Disabled | Bloom Enabled |
| --- | --- | 
| <img width="981" height="503" alt="bloom disabled image" src="https://github.com/user-attachments/assets/3667f8b5-cab3-4c5b-bdda-ebb5592500e2" /> | <img width="977" height="501" alt="bloom enabled image" src="https://github.com/user-attachments/assets/1a141923-389e-4068-9b2c-e33ac6165b32" /> |

Bloom implements a four-pass compute chain that isolates bright regions, blurs them, and adds them back to the lit scene. Compute-only, as the assignment requires.
- `bloom_bright.cs.wgsl` — bright-pass extraction. Per pixel, computes luminance and keeps the amount above a threshold, with soft falloff (`(lum - threshold) / lum`) instead of a hard cutoff. Outputs `rgba16float` so HDR values above 1.0 survive.
- `bloom_blur.cs.wgsl` — 9-tap separable Gaussian (σ ≈ 2.0). Used twice with different `direction` uniforms: `(1, 0)` then `(0, 1)`. Two 1D passes give a full 2D Gaussian at 18 samples per pixel instead of 81.
- `bloom_composite.cs.wgsl` — additive composite: `sceneColor + blurredBright * intensity`, output to `rgba8unorm`.
- `blit.fs.wgsl` — copies the post-process output (or `sceneColorTexture` when effects are disabled) to the canvas.

### Toon shading (Post-Processing)

<img alt="toon shading image" src="https://github.com/user-attachments/assets/e1a89212-d46f-44c6-b9cd-8718a37114bd" />

A single compute pass (`toon.cs.wgsl`) that reads the lit scene and the depth buffer.

- **Posterization.** Quantize luminance into N bands (`floor(lum * N) / N`), then rescale by the original luminance to preserve hue. N is exposed as a GUI slider (2 = hard two-tone, 4 = classic anime, 8 = subtle).
- **Outlines.** Sample depth at 4 neighbors and compute a **relative** gradient (`max(|c - n|) / c`). Relative rather than absolute so a single threshold works at any camera distance. Edge pixels mix toward black.
- **Composite.** Mix posterized color toward black where the edge test fired, weighted by an outline-strength slider.


## Performance Analysis

### Credits

- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
