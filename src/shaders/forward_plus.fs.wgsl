// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterLightCounts: array<u32>;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterLightIndices: array<u32>;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

const NX: u32 = ${clusterGridSizeX};
const NY: u32 = ${clusterGridSizeY};
const NZ: u32 = ${clusterGridSizeZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput, @builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5) { discard; }

    let near = cameraUniforms.nearFarScreenSize.x;
    let far = cameraUniforms.nearFarScreenSize.y;
    let screenW = cameraUniforms.nearFarScreenSize.z;
    let screenH = cameraUniforms.nearFarScreenSize.w;

    // Screen tile
    let cx = min(u32(fragCoord.x / screenW * f32(NX)), NX - 1u);
    let fy = clamp(fragCoord.y / screenH, 0.0, 1.0);
    let cy = u32(clamp((1.0 - fy) * f32(NY), 0.0, f32(NY - 1u)));

    // Z slice (inverse of the exponential distribution used in the compute shader)
    let zNdc = fragCoord.z; // WebGPU depth is already in [0,1]
    let viewDepth = far * near / (far - zNdc * (far - near));
    let logRatio = log(viewDepth / near) / log(far / near);
    let cz = min(u32(clamp(logRatio, 0.0, 0.9999) * f32(NZ)), NZ - 1u);

    let clusterIdx = cx + cy * NX + cz * NX * NY;
    let lightCount = clusterLightCounts[clusterIdx];
    let baseIdx = clusterIdx * MAX_LIGHTS_PER_CLUSTER;

    let nor = normalize(in.nor);
    var totalLightContrib = vec3f(0.0);
    for (var i = 0u; i < lightCount; i++) {
        let lightIdx = clusterLightIndices[baseIdx + i];
        totalLightContrib += calculateLightContrib(lightSet.lights[lightIdx], in.pos, nor);
    }

    return vec4(diffuseColor.rgb * totalLightContrib, 1.0);
}