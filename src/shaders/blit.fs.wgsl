@group(0) @binding(0) var srcTexture: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    let coords = vec2i(i32(fragCoord.x), i32(fragCoord.y));
    return textureLoad(srcTexture, coords, 0);
}