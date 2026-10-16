// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterLightCounts: array<u32>;
@group(${bindGroup_scene}) @binding(3) var<storage, read> clusterLightIndices: array<u32>;

@group(1) @binding(0) var gbufPos: texture_2d<f32>;
@group(1) @binding(1) var gbufNor: texture_2d<f32>;
@group(1) @binding(2) var gbufAlbedo: texture_2d<f32>;

const NX: u32 = ${clusterGridSizeX};
const NY: u32 = ${clusterGridSizeY};
const NZ: u32 = ${clusterGridSizeZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let pixelCoord = vec2i(i32(fragCoord.x), i32(fragCoord.y));

    // read G-buffer
    let gbufPosSample = textureLoad(gbufPos, pixelCoord, 0);
    let albedo = textureLoad(gbufAlbedo, pixelCoord, 0);
    if (albedo.a < 0.5) { discard; }

    let posWorld = gbufPosSample.xyz;
    let zNdc = gbufPosSample.w;
    let nor = normalize(textureLoad(gbufNor, pixelCoord, 0).xyz);

    // cluster lookup (identical to Forward+)
    let near = cameraUniforms.nearFarScreenSize.x;
    let far = cameraUniforms.nearFarScreenSize.y;
    let screenW = cameraUniforms.nearFarScreenSize.z;
    let screenH = cameraUniforms.nearFarScreenSize.w;

    let cx = min(u32(fragCoord.x / screenW * f32(NX)), NX - 1u);
    let fy = clamp(fragCoord.y / screenH, 0.0, 1.0);
    let cy = u32(clamp((1.0 - fy) * f32(NY), 0.0, f32(NY - 1u)));

    let viewDepth = far * near / (far - zNdc * (far - near));
    let logRatio = log(viewDepth / near) / log(far / near);
    let cz = min(u32(clamp(logRatio, 0.0, 0.9999) * f32(NZ)), NZ - 1u);

    let clusterIdx = cx + cy * NX + cz * NX * NY;
    let lightCount = clusterLightCounts[clusterIdx];
    let baseIdx = clusterIdx * MAX_LIGHTS_PER_CLUSTER;

    var totalLightContrib = vec3f(0.0);
    for (var i = 0u; i < lightCount; i++) {
        let lightIdx = clusterLightIndices[baseIdx + i];
        totalLightContrib += calculateLightContrib(lightSet.lights[lightIdx], posWorld, nor);
    }

    return vec4(albedo.rgb * totalLightContrib, 1.0);
}