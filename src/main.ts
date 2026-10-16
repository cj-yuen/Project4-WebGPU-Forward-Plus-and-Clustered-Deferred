import Stats from 'stats.js';
import { GUI } from 'dat.gui';

import { initWebGPU, Renderer } from './renderer';
import { NaiveRenderer } from './renderers/naive';
import { ForwardPlusRenderer } from './renderers/forward_plus';
import { ClusteredDeferredRenderer } from './renderers/clustered_deferred';

import { setupLoaders, Scene } from './stage/scene';
import { Lights } from './stage/lights';
import { Camera } from './stage/camera';
import { Stage } from './stage/stage';

await initWebGPU();
setupLoaders();

let scene = new Scene();
await scene.loadGltf('./scenes/sponza/Sponza.gltf');

const camera = new Camera();
const lights = new Lights(camera);

const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

const gui = new GUI();
gui.add(lights, 'numLights').min(1).max(Lights.maxNumLights).step(1).onChange(() => {
    lights.updateLightSetUniformNumLights();
});

const stage = new Stage(scene, lights, camera, stats);

var renderer: Renderer | undefined;

// bloom state
const bloomState = {
    enabled: false,
    threshold: 0.6,
    intensity: 1.2,
};

function applyBloomToActiveRenderer() {
    if (renderer instanceof ForwardPlusRenderer) {
        renderer.setBloomEnabled(bloomState.enabled);
        renderer.setBloomParams(bloomState.threshold, bloomState.intensity);
    }
}

function setRenderer(mode: string) {
    renderer?.stop();

    switch (mode) {
        case renderModes.naive:
            renderer = new NaiveRenderer(stage);
            break;
        case renderModes.forwardPlus:
            renderer = new ForwardPlusRenderer(stage);
            break;
        case renderModes.clusteredDeferred:
            renderer = new ClusteredDeferredRenderer(stage);
            break;
    }

    // re-apply bloom settings after renderer switch
    applyBloomToActiveRenderer();
    const bloomSupported = renderer instanceof ForwardPlusRenderer;
    bloomFolder.domElement.style.opacity = bloomSupported ? '1' : '0.4';
    bloomFolder.domElement.style.pointerEvents = bloomSupported ? 'auto' : 'none';
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

// bloom GUI folder
const bloomFolder = gui.addFolder('Bloom (Forward+ only)');

bloomFolder.add(bloomState, 'enabled').name('Enable').onChange(() => {
    applyBloomToActiveRenderer();
});

bloomFolder.add(bloomState, 'threshold', 0.0, 2.0, 0.05).name('Threshold').onChange(() => {
    applyBloomToActiveRenderer();
});

bloomFolder.add(bloomState, 'intensity', 0.0, 3.0, 0.05).name('Intensity').onChange(() => {
    applyBloomToActiveRenderer();
});

setRenderer(renderModeController.getValue());
