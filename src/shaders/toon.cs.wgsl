@group(0) @binding(0) var sceneTexture: texture_2d<f32>;
@group(0) @binding(1) var depthTexture: texture_depth_2d;
@group(0) @binding(2) var dstTexture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: ToonParams;

struct ToonParams {
    numBands: f32,          // 2.0 = hard two-tone, 4.0 = classic anime
    edgeThreshold: f32,     // relative depth-difference cutoff
    outlineStrength: f32,   // 0 = no outline, 1 = full black line
    _pad: f32,
}

@compute @workgroup_size(${bloomWorkgroupSize}, ${bloomWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    let dims = textureDimensions(sceneTexture);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }

    let coords = vec2i(i32(gid.x), i32(gid.y));

    // depth edge detection
    let c = textureLoad(depthTexture, coords, 0);
    let l = textureLoad(depthTexture, coords + vec2i(-1, 0), 0);
    let r = textureLoad(depthTexture, coords + vec2i( 1, 0), 0);
    let u = textureLoad(depthTexture, coords + vec2i(0, -1), 0);
    let d = textureLoad(depthTexture, coords + vec2i(0,  1), 0);

    let invC = 1.0 / max(c, 0.0001);
    let du = max(abs(c - l), abs(c - r)) * invC;
    let dv = max(abs(c - u), abs(c - d)) * invC;
    let edge = select(0.0, 1.0, max(du, dv) > params.edgeThreshold);

    // posterize luminance
    let color = textureLoad(sceneTexture, coords, 0).rgb;
    let lum = dot(color, vec3f(0.2126, 0.7152, 0.0722));
    let bands = max(params.numBands, 2.0);
    let quantized = floor(lum * bands) / bands;
    let scale = select(quantized / max(lum, 0.0001), 0.0, lum < 0.0001);
    var outColor = color * scale;

    // overlay outline
    outColor = mix(outColor, vec3f(0.0), edge * params.outlineStrength);

    textureStore(dstTexture, coords, vec4f(outColor, 1.0));
}