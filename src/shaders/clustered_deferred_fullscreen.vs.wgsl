// TODO-3: implement the Clustered Deferred fullscreen vertex shader

// This shader should be very simple as it does not need all of the information passed by the the naive vertex shader.

struct VertexOutput {
    @builtin(position) pos: vec4f
}

@vertex
fn main(@builtin(vertex_index) vi: u32) -> VertexOutput {
    // f32ullscreen triangle: (-1,-1), (3,-1), (-1,3)
    let x = f32((vi << 1u) & 2u) * 2.0 - 1.0;
    let y = f32(vi & 2u) * 2.0 - 1.0;

    var out: VertexOutput;
    out.pos = vec4f(x, y, 0.0, 1.0);
    return out;
}