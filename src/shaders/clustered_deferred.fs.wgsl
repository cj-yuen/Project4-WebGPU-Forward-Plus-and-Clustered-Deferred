// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct FragmentOutput {
    @location(0) posOut: vec4f,
    @location(1) norOut: vec4f,
    @location(2) albedoOut: vec4f,
}

@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4f) -> FragmentOutput {
    let diffuse = textureSample(diffuseTex, diffuseTexSampler, in.uv);

    var out: FragmentOutput;
    // store world pos in xyz & interpolated depth (NDC z in [0,1]) in w
    out.posOut = vec4f(in.pos, fragCoord.z);
    out.norOut = vec4f(normalize(in.nor), 1.0);
    out.albedoOut = diffuse;
    return out;
}