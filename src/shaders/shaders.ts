// CHECKITOUT: this file loads all the shaders and preprocesses them with some common code

import { Camera } from '../stage/camera';

import commonRaw from './common.wgsl?raw';

import naiveVertRaw from './naive.vs.wgsl?raw';
import naiveFragRaw from './naive.fs.wgsl?raw';

import forwardPlusFragRaw from './forward_plus.fs.wgsl?raw';

import clusteredDeferredFragRaw from './clustered_deferred.fs.wgsl?raw';
import clusteredDeferredFullscreenVertRaw from './clustered_deferred_fullscreen.vs.wgsl?raw';
import clusteredDeferredFullscreenFragRaw from './clustered_deferred_fullscreen.fs.wgsl?raw';

import moveLightsComputeRaw from './move_lights.cs.wgsl?raw';
import clusteringComputeRaw from './clustering.cs.wgsl?raw';

import bloomBrightRaw from './bloom_bright.cs.wgsl?raw';
import bloomBlurRaw from './bloom_blur.cs.wgsl?raw';
import bloomCompositeRaw from './bloom_composite.cs.wgsl?raw';
import blitFragRaw from './blit.fs.wgsl?raw';

import toonRaw from './toon.cs.wgsl?raw';

// CONSTANTS (for use in shaders)
// =================================

// CHECKITOUT: feel free to add more constants here and to refer to them in your shader code

// Note that these are declared in a somewhat roundabout way because otherwise minification will drop variables
// that are unused in host side code.
export const constants = {
    bindGroup_scene: 0,
    bindGroup_model: 1,
    bindGroup_material: 2,

    moveLightsWorkgroupSize: 128,

    lightRadius: 2,

    // clustering
    clusterGridSizeX: 16,
    clusterGridSizeY: 9,
    clusterGridSizeZ: 24,
    maxLightsPerCluster: 200,
    clusteringWorkgroupSize: 4,

    // bloom
    bloomWorkgroupSize: 8,

    // toon
    toonEdgeThreshold: 0.02,
};

// =================================

function evalShaderRaw(raw: string) {
    return raw.replace(
        /\$\{(\w+)\}/g,
        (_, name: string) => {
            const value = constants[name as keyof typeof constants];

            if (value === undefined) {
                throw new Error(`Missing shader constant: ${name}`);
            }

            return String(value);
        }
    );
}

const commonSrc: string = evalShaderRaw(commonRaw);

function processShaderRaw(raw: string) {
    return commonSrc + evalShaderRaw(raw);
}

export const naiveVertSrc: string = processShaderRaw(naiveVertRaw);
export const naiveFragSrc: string = processShaderRaw(naiveFragRaw);

export const forwardPlusFragSrc: string = processShaderRaw(forwardPlusFragRaw);

export const clusteredDeferredFragSrc: string = processShaderRaw(clusteredDeferredFragRaw);
export const clusteredDeferredFullscreenVertSrc: string = processShaderRaw(clusteredDeferredFullscreenVertRaw);
export const clusteredDeferredFullscreenFragSrc: string = processShaderRaw(clusteredDeferredFullscreenFragRaw);

export const moveLightsComputeSrc: string = processShaderRaw(moveLightsComputeRaw);
export const clusteringComputeSrc: string = processShaderRaw(clusteringComputeRaw);

export const bloomBrightSrc: string = processShaderRaw(bloomBrightRaw);
export const bloomBlurSrc: string = processShaderRaw(bloomBlurRaw);
export const bloomCompositeSrc: string = processShaderRaw(bloomCompositeRaw);
export const blitFragSrc: string = processShaderRaw(blitFragRaw);

export const toonSrc: string = processShaderRaw(toonRaw);