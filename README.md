WebGPU Forward+ and Clustered Deferred Shading
======================

**University of Pennsylvania, CIS 565: GPU Programming and Architecture, Project 4**

* Christopher Yuen
  * [LinkedIn](https://www.linkedin.com/in/christopher-yuen-16b5a8221/)
* Tested on: Windows 11, 14th Gen Intel(R) Core(TM) i9-14900HX @ 2.22GHz 32GB, RTX 4090 Laptop GPU 16GB (Personal Laptop)

### Live Demo
[Live Demo Link](https://cj-yuen.github.io/Project4-WebGPU-Forward-Plus-and-Clustered-Deferred/) requires a WebGPU-capable browser (ie. Chrome)

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

Now instead of 5000 lights per pixel, we do roughly 5–20. Now the cost scales with local light density. However, we do have conservative clusters as each cluster holds every light that could potentially touch any pixel inside it. With coarse tiles (120 × 120 px), the boundaries are visible as faint tile bands. Finer grids cost more memory but reduces this artifact.

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
All timings are measured in milliseconds (ms) on a RTX 4090 Laptop GPU, i9-14900HX.

### 1. Renderer Comparison: Naive vs. Forward+ vs. Clustered Deferred

We measured the render time of all three rendering modes as the number of lights increases from 10 to 5000. 

| Number of Lights | Naive (ms) | Forward+ (ms) | Clustered Deferred (ms) |
| :--- | :--- | :--- | :--- |
| 10 | 0.775 | 0.329 | 0.348 |
| 50 | 3.691 | 0.550 | 0.357 |
| 100 | 7.627 | 0.818 | 0.385 |
| 500 | 37.614 | 3.107 | 1.235 |
| 1000 | 75.982 | 6.179 | 1.901 |
| 2500 | 192.694 | 12.490 | 3.351 |
| 5000 | 395.328 | 16.609 | 4.398 |

<img alt="renderer comparison graph" src="https://github.com/user-attachments/assets/c475661a-9681-4df9-a6e0-e0313a09e5a2" />

**Analysis & Tradeoffs:**
- <ins>Naive scaling:</ins> As expected, the naive renderer's cost scales linearly with the total number of lights, becoming unusable at 5000 lights. 
- <ins>Why Forward+ is faster:</ins> Forward+ scales sub-linearly because the cost per fragment is proportional to the *local* light density (lights per cluster) rather than the total scene lights.
- <ins>Forward+ vs. Clustered Deferred:</ins> At low light counts (i.e. 10), Clustered Deferred is actually slower than Forward+. This is because the G-buffer requires writing and reading three textures per pixel (~25 MB of bandwidth per frame at 1080p), which outweighs the savings from eliminated lighting overdraw. However, at high light counts (5000), the Clustered Deferred renderer outperforms Forward+ because it shades each visible pixel exactly once. Forward+ suffers from "lighting overdraw" (shading fragments that are later overwritten by the depth test), whereas Deferred does all lighting in a single fullscreen pass.


### 2. Cluster Grid Resolution Analysis

The Forward+ and Deferred renderers use a 16 × 9 × 24 cluster grid. Setting light count to 2500 and using the Deferred renderer, we analyzed the effect of changing the grid resolution on performance and visual quality.

| Grid Resolution | Total Clusters | Render Time (ms) | Buffer Memory | Tile Artifacts | Screenshot |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 16 × 9 × 24 | 3,456 | 3.351 | ~2.8 MB | Visible | <img width="1034" height="504" alt="image" src="https://github.com/user-attachments/assets/80242720-1e0d-45c4-9df2-d951cb56f815" /> |
| 24 × 14 × 24 | 8,064 | 3.719 | ~6.5 MB | Faint | <img width="1036" height="503" alt="image" src="https://github.com/user-attachments/assets/012c3353-9b64-4c05-a3ae-83bf8a964072" /> |
| 32 × 18 × 32 | 18,432 | 18.525 | ~14.7 MB | Invisible | <img width="1034" height="506" alt="image" src="https://github.com/user-attachments/assets/644a6122-bfbc-43e1-88fe-fbd81fcb8271" /> |

<img alt="cluster grid graph" src="https://github.com/user-attachments/assets/2108ddd8-b05b-4f96-878d-af41199b24b0" />

**Analysis:** Increasing the grid resolution reduces the size of the screen tiles, which fixes the visible "tile" artifacts caused by lights being bounded by their cluster. However, it increases the compute cost of the clustering pass and significantly increases memory usage (the index buffer size is `numClusters * maxLightsPerCluster * 4` bytes). A 16 × 9 × 24 grid is a good middle ground. 

### 3. Optimizations Attempted

**Optimization 1: Separable Gaussian Blur (Bloom)**
- **Overview:** Bloom requires a Gaussian blur. A standard 2D Gaussian evaluating a 9×9 kernel requires 81 texture samples per pixel. 
- **Acceleration:** I split the blur into two 1D passes (Horizontal then Vertical). A 9-tap 1D kernel requires only 9 samples per pass, totaling 18 samples per pixel. 
- **Performance Improvement:** Theoretical reduction from 81 texture samples to 18 samples (a 4.5× reduction). In practice, this translates to the blur taking a fraction of the total 0.933 ms Bloom overhead measured below.
- **Best/Worst Case:** Best case is high resolutions (1080p+), where texture sampling and memory bandwidth dominate the frame time. Worst case is low resolutions, where the fixed dispatch overhead of creating two compute passes outweighs the savings of fewer texture samples.
- **Tradeoff:** Separable blur requires two intermediate textures (`blurHTexture` and `blurVTexture`) and two compute dispatches, which uses slightly more memory than a single-pass 2D blur.

**Optimization 2: Skipping Compute Passes**
- **Overview:** If post-processing is not actively needed, it should not cost anything.
- **Acceleration:** When both Bloom and Toon are disabled via the GUI, the renderer skips the compute pass entirely and uses `blit.fs.wgsl` to copy the raw `sceneColorTexture` directly to the canvas.
- **Performance Improvement:** Ensures the base Forward+ performance (i.e. `3.126 ms` at 500 lights) is not penalized by empty compute passes.

### 4. Feature Analysis: Bloom

- **Concise Overview:** Bright-pass extraction followed by a separable Gaussian blur and additive composite. It is implemented entirely using four new compute pass shaders (`bloom_bright`, `bloom_blur`, `bloom_composite`, `blit`).
- **Performance Change:** Adds **0.933 ms** per frame at 1080p (Forward+ baseline goes from 3.126 ms to 4.059 ms). 
- **Parameter Effects:** Changing the `threshold` and `intensity` parameters via the GUI has zero effect on execution time. 
    - <img alt="image" src="https://github.com/user-attachments/assets/f13e2055-f281-46f3-aa2a-b23e7ca456e4" />
    - The graph is a completely flat, horizontal line at 4.059 ms. This is because the compute shader's work is pixel-bound, not value-bound. It must evaluate every pixel regardless of what the threshold is set to.
- **Tradeoffs:** The feature requires significant memory bandwidth (writing to three `rgba16float` textures and reading them back). It also requires modifying the main Forward+ pipeline to render to an intermediate texture instead of directly to the canvas.
- **Future Optimizations:** Downsampling the bright-pass and blur textures to half-resolution (or quarter) before blurring. This would reduce the texture bandwidth and compute cost of the bloom effect by 4× to 16× with minimal visual quality loss.
- **Debug View:**
<img alt="brightTexture screenshot" src="https://github.com/user-attachments/assets/9fcc17ad-df98-4b7c-8025-ea9ad89144f0" />

*Correlation to Performance:* The bright-pass screenshot shows exactly how much of the screen is being blurred. If the screen is mostly black (high threshold), the GPU still processes every pixel. This visualizes why changing the threshold parameter does not affect performance.
  


### 5. Feature Analysis: Toon Shading

- **Concise Overview:** A single compute pass (`toon.cs.wgsl`) that quantizes luminance into discrete color bands and detects edges using a relative depth gradient to draw black outlines.
- **Performance Change:** Adds **0.557 ms** per frame at 1080p (Forward+ baseline goes from 3.126 ms to 3.683 ms).
- **Parameter Effects (and Graph):** Similar to Bloom, the `bands`, `edgeThreshold`, and `outlineStrength` parameters do not affect execution time. 
    - <img alt="image" src="https://github.com/user-attachments/assets/896f62e3-4a19-41b6-b5d0-351ed3c6082f" />
    - Plotting any of these parameters against render time results in a flat horizontal line at 3.683 ms. The cost is a fixed fullscreen pass.
- **Tradeoffs:** Toon shading requires the depth texture to be exposed as a `TEXTURE_BINDING`. This prevents the depth texture from using certain hardware-specific compression formats (though `depth24plus` handles this fine here).
- **Acceleration:** The edge detection samples the depth buffer at 4 neighbors. While this adds memory latency, it is packed into a single highly-parallelized compute pass. When combined with Bloom, it reads from the Bloom composite output, saving the cost of another full-screen read from the original scene.
- **Future Optimizations:** Currently, it does an early-out `if` statement for edges. A future optimization would be using a compute shader to generate a lower-resolution edge map (half or quarter res) and upsampling it, which would cut the depth-sampling bandwidth by 4×.
- **Debug View:** 
<img width="1036" height="501" alt="image" src="https://github.com/user-attachments/assets/4ebea679-a157-4b43-8c6c-b7d9828f2f45" />

*Correlation to Performance:* The depth buffer shows the complexity of the scene geometry. Dense geometry (like the Sponza foliage) creates more depth discontinuities, triggering more outline calculations, but since it's a fixed per-pixel cost, the performance remains identical regardless of geometric complexity.

### 6. Post-Processing Performance Summary

<img width="600" height="410" alt="image" src="https://github.com/user-attachments/assets/fbf17340-a709-4962-b9d3-a8a6ad9e2db6" />

| Configuration | Forward+ Render Time (ms) | Overhead vs Baseline |
| :--- | :--- | :--- |
| Baseline (No Effects) | 3.126 | — |
| + Bloom | 4.059 | +0.933 |
| + Toon | 3.683 | +0.557 |
| + Bloom + Toon | 4.129 | +1.003 |

**Analysis:** Post-processing adds a fixed per-pixel cost that scales with screen resolution, not scene complexity. Bloom is roughly 1.7× more expensive than Toon because it requires four separate compute dispatches (bright-pass, H-blur, V-blur, composite) compared to Toon's single pass. Interestingly, running both effects together (+1.003 ms) costs less than the sum of their individual overheads (0.933 + 0.557 = 1.490 ms). This is likely due to cache locality: when both are enabled, the Toon pass reads directly from the Bloom output texture, which is already hot in the GPU's L2 cache, saving a full read from VRAM.


### Credits
- [Vite](https://vitejs.dev/)
- [loaders.gl](https://loaders.gl/)
- [dat.GUI](https://github.com/dataarts/dat.gui)
- [stats.js](https://github.com/mrdoob/stats.js)
- [wgpu-matrix](https://github.com/greggman/wgpu-matrix)
