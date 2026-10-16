import * as renderer from '../renderer';
import * as shaders from '../shaders/shaders';
import { Stage } from '../stage/stage';

export class ForwardPlusRenderer extends renderer.Renderer {
    // TODO-2: add layouts, pipelines, textures, etc. needed for Forward+ here
    // you may need extra uniforms such as the camera view matrix and the canvas resolution

    // foward+ 
    sceneUniformsBindGroupLayout: GPUBindGroupLayout;
    sceneUniformsBindGroup: GPUBindGroup;
    depthTexture: GPUTexture;
    depthTextureView: GPUTextureView;
    pipeline: GPURenderPipeline;

    // bloom state
    bloomEnabled = false;
    bloomThreshold = 0.6;
    bloomIntensity = 1.2;

    // scene + post-processing textures
    sceneColorTexture: GPUTexture;
    brightTexture: GPUTexture;
    blurHTexture: GPUTexture;
    blurVTexture: GPUTexture;
    finalTexture: GPUTexture;

    // compute pipelines
    brightPipeline: GPUComputePipeline;
    blurPipeline: GPUComputePipeline;
    compositePipeline: GPUComputePipeline;

    // compute bind groups
    brightBindGroup: GPUBindGroup;
    blurHBindGroup: GPUBindGroup;
    blurVBindGroup: GPUBindGroup;
    compositeBindGroup: GPUBindGroup;

    // compute uniforms
    brightUniformBuffer: GPUBuffer;
    blurHUniformBuffer: GPUBuffer;
    blurVUniformBuffer: GPUBuffer;
    compositeUniformBuffer: GPUBuffer;

    // blit
    blitPipeline: GPURenderPipeline;
    blitSceneBindGroup: GPUBindGroup;
    blitFinalBindGroup: GPUBindGroup;

    constructor(stage: Stage) {
        super(stage);

        const width = renderer.canvas.width;
        const height = renderer.canvas.height;

        // TODO-2: initialize layouts, pipelines, textures, etc. needed for Forward+ here

        this.sceneUniformsBindGroupLayout = renderer.device.createBindGroupLayout({
            label: "forward+ scene uniofrms bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
                { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
            ]
        });

        this.sceneUniformsBindGroup = renderer.device.createBindGroup({
            label: "forward+ scene uniforms bind group",
            layout: this.sceneUniformsBindGroupLayout,
            entries: [
                { binding: 0, resource: {buffer: this.camera.uniformsBuffer } },
                { binding: 1, resource: { buffer: this.lights.lightSetStorageBuffer } },
                { binding: 2, resource: { buffer: this.lights.clusterLightCountsBuffer } },
                { binding: 3, resource: { buffer: this.lights.clusterLightIndicesBuffer } },
            ]
        });

        this.depthTexture = renderer.device.createTexture({
            size: [renderer.canvas.width, renderer.canvas.height],
            format: "depth24plus",
            usage: GPUTextureUsage.RENDER_ATTACHMENT
        });

        this.depthTextureView = this.depthTexture.createView();

        this.pipeline = renderer.device.createRenderPipeline({
            layout: renderer.device.createPipelineLayout({
                label: "forward+ pipeline layout",
                bindGroupLayouts: [
                    this.sceneUniformsBindGroupLayout,
                    renderer.modelBindGroupLayout,
                    renderer.materialBindGroupLayout
                ]
            }),
            depthStencil: { depthWriteEnabled: true, depthCompare: "less", format: "depth24plus" },
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "foward+ vert shader",
                    code: shaders.naiveVertSrc  // reuse naive vertex shader
                }),
                buffers: [ renderer.vertexBufferLayout ] 
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "forward+ frag shader",
                    code: shaders.forwardPlusFragSrc,
                }),
                targets: [ { format: "rgba16float" } ]
            }
        });

        // scene + post-processing textures
        this.sceneColorTexture = renderer.device.createTexture({
            label: "scene color",
            size: [width, height],
            format: "rgba16float",
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        const makeHDRTarget = (label: string) => renderer.device.createTexture({
            label, size: [width, height], format: "rgba16float",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        this.brightTexture = makeHDRTarget("bloom bright");
        this.blurHTexture = makeHDRTarget("bloom blur H");
        this.blurVTexture  = makeHDRTarget("bloom blur V");

        this.finalTexture = renderer.device.createTexture({
            label: "bloom final",
            size: [width, height],
            format: "rgba8unorm",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
        });

        // bright extract 
        this.brightUniformBuffer = renderer.device.createBuffer({
            label: "bright uniform",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        renderer.device.queue.writeBuffer(
            this.brightUniformBuffer, 0,
            new Float32Array([this.bloomThreshold, 0, 0, 0]));

        const brightLayout = renderer.device.createBindGroupLayout({
            label: "bright bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: "rgba16float", access: "write-only" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            ]
        });

        this.brightBindGroup = renderer.device.createBindGroup({
            label: "bright bind group",
            layout: brightLayout,
            entries: [
                { binding: 0, resource: this.sceneColorTexture.createView() },
                { binding: 1, resource: this.brightTexture.createView() },
                { binding: 2, resource: { buffer: this.brightUniformBuffer } },
            ]
        });

        this.brightPipeline = renderer.device.createComputePipeline({
            label: "bright pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [brightLayout] }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "bright compute shader",
                    code: shaders.bloomBrightSrc
                }),
                entryPoint: "main"
            }
        });

        // blur (shared by H & V)
        this.blurHUniformBuffer = renderer.device.createBuffer({
            label: "blur H uniform",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.blurVUniformBuffer = renderer.device.createBuffer({
            label: "blur V uniform",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        renderer.device.queue.writeBuffer(this.blurHUniformBuffer, 0, new Float32Array([1, 0, 0, 0]));
        renderer.device.queue.writeBuffer(this.blurVUniformBuffer, 0, new Float32Array([0, 1, 0, 0]));

        const blurLayout = renderer.device.createBindGroupLayout({
            label: "blur bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: "rgba16float", access: "write-only" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            ]
        });

        this.blurHBindGroup = renderer.device.createBindGroup({
            label: "blur H bind group",
            layout: blurLayout,
            entries: [
                { binding: 0, resource: this.brightTexture.createView() },
                { binding: 1, resource: this.blurHTexture.createView() },
                { binding: 2, resource: { buffer: this.blurHUniformBuffer } },
            ]
        });

        this.blurVBindGroup = renderer.device.createBindGroup({
            label: "blur V bind group",
            layout: blurLayout,
            entries: [
                { binding: 0, resource: this.blurHTexture.createView() },
                { binding: 1, resource: this.blurVTexture.createView() },
                { binding: 2, resource: { buffer: this.blurVUniformBuffer } },
            ]
        });

        this.blurPipeline = renderer.device.createComputePipeline({
            label: "blur pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [blurLayout] }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "blur compute shader",
                    code: shaders.bloomBlurSrc
                }),
                entryPoint: "main"
            }
        });

        // composite 
        this.compositeUniformBuffer = renderer.device.createBuffer({
            label: "composite uniform",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        renderer.device.queue.writeBuffer(
            this.compositeUniformBuffer, 0,
            new Float32Array([this.bloomIntensity, 0, 0, 0]));

        const compositeLayout = renderer.device.createBindGroupLayout({
            label: "composite bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
                { binding: 2, visibility: GPUShaderStage.COMPUTE, storageTexture: { format: "rgba8unorm", access: "write-only" } },
                { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
            ]
        });

        this.compositeBindGroup = renderer.device.createBindGroup({
            label: "composite bind group",
            layout: compositeLayout,
            entries: [
                { binding: 0, resource: this.sceneColorTexture.createView() },
                { binding: 1, resource: this.blurVTexture.createView() },
                { binding: 2, resource: this.finalTexture.createView() },
                { binding: 3, resource: { buffer: this.compositeUniformBuffer } },
            ]
        });

        this.compositePipeline = renderer.device.createComputePipeline({
            label: "composite pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [compositeLayout] }),
            compute: {
                module: renderer.device.createShaderModule({
                    label: "composite compute shader",
                    code: shaders.bloomCompositeSrc
                }),
                entryPoint: "main"
            }
        });

        // blit --> canvas
        const blitLayout = renderer.device.createBindGroupLayout({
            label: "blit bind group layout",
            entries: [
                { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "unfilterable-float" } },
            ]
        });

        this.blitSceneBindGroup = renderer.device.createBindGroup({
            label: "blit scene bind group",
            layout: blitLayout,
            entries: [{ binding: 0, resource: this.sceneColorTexture.createView() }]
        });

        this.blitFinalBindGroup = renderer.device.createBindGroup({
            label: "blit final bind group",
            layout: blitLayout,
            entries: [{ binding: 0, resource: this.finalTexture.createView() }]
        });

        this.blitPipeline = renderer.device.createRenderPipeline({
            label: "blit pipeline",
            layout: renderer.device.createPipelineLayout({ bindGroupLayouts: [blitLayout] }),
            vertex: {
                module: renderer.device.createShaderModule({
                    label: "blit vert shader",
                    code: shaders.clusteredDeferredFullscreenVertSrc
                })
            },
            fragment: {
                module: renderer.device.createShaderModule({
                    label: "blit frag shader",
                    code: shaders.blitFragSrc
                }),
                targets: [ { format: renderer.canvasFormat } ]
            }
        });
    }

    // gui hooks
    setBloomEnabled(enabled: boolean) {
        this.bloomEnabled = enabled;
    }

    setBloomParams(threshold: number, intensity: number) {
        this.bloomThreshold = threshold;
        this.bloomIntensity = intensity;
        renderer.device.queue.writeBuffer(
            this.brightUniformBuffer, 0, new Float32Array([threshold, 0, 0, 0]));
        renderer.device.queue.writeBuffer(
            this.compositeUniformBuffer, 0, new Float32Array([intensity, 0, 0, 0]));
    }

    override draw() {
        // TODO-2: run the Forward+ rendering pass:
        // - run the clustering compute shader
        // - run the main rendering pass, using the computed clusters for efficient lighting

        const encoder = renderer.device.createCommandEncoder();

        this.lights.doLightClustering(encoder);

        const renderPass = encoder.beginRenderPass({
            label: "forward+ render pass",
            colorAttachments: [{
                view: this.sceneColorTexture.createView(),
                clearValue: [0, 0, 0, 0],
                loadOp: "clear",
                storeOp: "store"
            }],
            depthStencilAttachment: {
                view: this.depthTextureView,
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "store"
            }
        });

        renderPass.setPipeline(this.pipeline);
        renderPass.setBindGroup(shaders.constants.bindGroup_scene, this.sceneUniformsBindGroup);

        this.scene.iterate(node => {
            renderPass.setBindGroup(shaders.constants.bindGroup_model, node.modelBindGroup);
        }, material => {
            renderPass.setBindGroup(shaders.constants.bindGroup_material, material.materialBindGroup);
        }, primitive => {
            renderPass.setVertexBuffer(0, primitive.vertexBuffer);
            renderPass.setIndexBuffer(primitive.indexBuffer, `uint32`);
            renderPass.drawIndexed(primitive.numIndices);
        });

        renderPass.end();

        // bloom compute passes (skip if disabled)
        let blitSourceBindGroup = this.blitSceneBindGroup;
        if (this.bloomEnabled) {
            const wg = shaders.constants.bloomWorkgroupSize;
            const wgX = Math.ceil(renderer.canvas.width / wg);
            const wgY = Math.ceil(renderer.canvas.height / wg);

            const bp = encoder.beginComputePass({ label: "bloom compute pass" });

            bp.setPipeline(this.brightPipeline);
            bp.setBindGroup(0, this.brightBindGroup);
            bp.dispatchWorkgroups(wgX, wgY);

            bp.setPipeline(this.blurPipeline);
            bp.setBindGroup(0, this.blurHBindGroup);
            bp.dispatchWorkgroups(wgX, wgY);
            bp.setBindGroup(0, this.blurVBindGroup);
            bp.dispatchWorkgroups(wgX, wgY);

            bp.setPipeline(this.compositePipeline);
            bp.setBindGroup(0, this.compositeBindGroup);
            bp.dispatchWorkgroups(wgX, wgY);

            bp.end();

            blitSourceBindGroup = this.blitFinalBindGroup;
        }

        // blit --> canvas
        const canvasTextureView = renderer.context.getCurrentTexture().createView();
        const blitPass = encoder.beginRenderPass({
            label: "blit pass",
            colorAttachments: [{
                view: canvasTextureView,
                clearValue: [0, 0, 0, 1],
                loadOp: "clear",
                storeOp: "store"
            }]
        });

        blitPass.setPipeline(this.blitPipeline);
        blitPass.setBindGroup(0, blitSourceBindGroup);
        blitPass.draw(3);
        blitPass.end();

        renderer.device.queue.submit([encoder.finish()]);
    }
}
