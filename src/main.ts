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

// post-processing state
const postState = {
    bloomEnabled: false,
    bloomThreshold: 0.6,
    bloomIntensity: 1.2,
    toonEnabled: false,
    toonBands: 4.0,
    toonEdgeThreshold: 0.02,
    toonOutline: 1.0,
};

function applyPostProcess() {
    if (renderer instanceof ForwardPlusRenderer) {
        renderer.setBloomEnabled(postState.bloomEnabled);
        renderer.setBloomParams(postState.bloomThreshold, postState.bloomIntensity);
        renderer.setToonEnabled(postState.toonEnabled);
        renderer.setToonParams(postState.toonBands, postState.toonEdgeThreshold, postState.toonOutline);
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

    // apply post-processing settings after renderer switch
    applyPostProcess();

    const supported = renderer instanceof ForwardPlusRenderer;
    postFolder.domElement.style.opacity = supported ? '1' : '0.4';
    postFolder.domElement.style.pointerEvents = supported ? 'auto' : 'none';
}

const renderModes = { naive: 'naive', forwardPlus: 'forward+', clusteredDeferred: 'clustered deferred' };
let renderModeController = gui.add({ mode: renderModes.naive }, 'mode', renderModes);
renderModeController.onChange(setRenderer);

// post-processing GUI folder
const postFolder = gui.addFolder('Post-Processing (Forward+ only)');

const bloomFolder = postFolder.addFolder('Bloom');
bloomFolder.add(postState, 'bloomEnabled').name('Enable').onChange(applyPostProcess);
bloomFolder.add(postState, 'bloomThreshold', 0.0, 2.0, 0.05).name('Threshold').onChange(applyPostProcess);
bloomFolder.add(postState, 'bloomIntensity', 0.0, 3.0, 0.05).name('Intensity').onChange(applyPostProcess);

const toonFolder = postFolder.addFolder('Toon');
toonFolder.add(postState, 'toonEnabled').name('Enable').onChange(applyPostProcess);
toonFolder.add(postState, 'toonBands', 2, 8, 1).name('Bands').onChange(applyPostProcess);
toonFolder.add(postState, 'toonEdgeThreshold', 0.001, 0.1, 0.001).name('Edge Threshold').onChange(applyPostProcess);
toonFolder.add(postState, 'toonOutline', 0.0, 1.0, 0.05).name('Outline').onChange(applyPostProcess);

setRenderer(renderModeController.getValue());
