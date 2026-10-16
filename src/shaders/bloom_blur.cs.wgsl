@group(0) @binding(0) var srcTexture: texture_2d<f32>;
@group(0) @binding(1) var dstTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform> params: BlurParams;

struct BlurParams {
    direction: vec2f,
    _pad0: vec2f,
}

@compute @workgroup_size(${bloomWorkgroupSize}, ${bloomWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let dims = textureDimensions(srcTexture);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }

    let coords = vec2i(i32(gid.x), i32(gid.y));
    let dir = vec2i(i32(params.direction.x), i32(params.direction.y));

    // 9-tap Gaussian, unrolled to avoid dynamic indexing of a const array
    var color = textureLoad(srcTexture, coords, 0).rgb * 0.227027;
    color += textureLoad(srcTexture, coords + dir,     0).rgb * 0.1945946;
    color += textureLoad(srcTexture, coords - dir,     0).rgb * 0.1945946;
    color += textureLoad(srcTexture, coords + dir * 2, 0).rgb * 0.1216216;
    color += textureLoad(srcTexture, coords - dir * 2, 0).rgb * 0.1216216;
    color += textureLoad(srcTexture, coords + dir * 3, 0).rgb * 0.054054;
    color += textureLoad(srcTexture, coords - dir * 3, 0).rgb * 0.054054;
    color += textureLoad(srcTexture, coords + dir * 4, 0).rgb * 0.016216;
    color += textureLoad(srcTexture, coords - dir * 4, 0).rgb * 0.016216;

    textureStore(dstTexture, coords, vec4f(color, 1.0));
}