@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var bloomTexture: texture_2d<f32>;
@group(0) @binding(2) var dstTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: CompositeParams;

struct CompositeParams {
    intensity: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@compute @workgroup_size(${bloomWorkgroupSize}, ${bloomWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let dims = textureDimensions(sceneTexture);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }

    let coords = vec2i(i32(gid.x), i32(gid.y));
    let sceneColor = textureLoad(sceneTexture, coords, 0).rgb;
    let bloomColor = textureLoad(bloomTexture, coords, 0).rgb;

    let finalColor = sceneColor + bloomColor * params.intensity;
    textureStore(dstTexture, coords, vec4f(finalColor, 1.0));
}