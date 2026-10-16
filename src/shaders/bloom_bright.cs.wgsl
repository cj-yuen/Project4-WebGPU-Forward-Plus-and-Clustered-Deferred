@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var dstTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: BloomParams;

struct BloomParams {
    threshold: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@compute @workgroup_size(${bloomWorkgroupSize}, ${bloomWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let dims = textureDimensions(srcTexture);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }

    let coords = vec2i(i32(gid.x), i32(gid.y));
    let color = textureLoad(srcTexture, coords, 0);

    let brightness = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));
    let contribution = max(brightness - params.threshold, 0.0);
    let scale = contribution / max(brightness, 0.0001);

    textureStore(dstTexture, coords, vec4f(color.rgb * scale, 1.0));
}