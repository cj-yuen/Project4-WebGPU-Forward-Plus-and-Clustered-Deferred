// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

@group(0) @binding(0) var<storage, read> lightSet: LightSet;
@group(0) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(0) @binding(2) var<storage, read_write> clusterLightCounts: array<u32>;
@group(0) @binding(3) var<storage, read_write> clusterLightIndices: array<u32>;

const NX: u32 = ${clusterGridSizeX};
const NY: u32 = ${clusterGridSizeY};
const NZ: u32 = ${clusterGridSizeZ};
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerCluster};

// unproject NDC (sx, sy) point @z=0 (near plane) --> view space
fn unprojectNear(sx: f32, sy: f32) -> vec3f {
    let clip = vec4f(sx, sy, 0.0, 1.0);
    let h = cameraUniforms.inverseProjMat * clip;
    return h.xyz / h.w;
}

@compute
@workgroup_size(${clusteringWorkgroupSize}, ${clusteringWorkgroupSize}, ${clusteringWorkgroupSize})
fn main(@builtin(global_invocation_id) gid: vec3u) {
    if (gid.x >= NX || gid.y >= NY || gid.z >= NZ) { 
        return; 
    }

    let near = cameraUniforms.nearFarScreenSize.x;
    let far  = cameraUniforms.nearFarScreenSize.y;

    // screen-space NDC bounds of tile
    let sx0 = 2.0 * f32(gid.x) / f32(NX) - 1.0;
    let sx1 = 2.0 * f32(gid.x + 1u) / f32(NX) - 1.0;
    let sy0 = 2.0 * f32(gid.y) / f32(NY) - 1.0;
    let sy1 = 2.0 * f32(gid.y + 1u) / f32(NY) - 1.0;

    // exponential z-slicing (closer slices are thinner)
    let t0 = f32(gid.z) / f32(NZ);
    let t1 = f32(gid.z + 1u) / f32(NZ);
    let zSliceNear = near * pow(far / near, t0);
    let zSliceFar  = near * pow(far / near, t1);

    // AABB in view space
    var aabbMin = vec3f(1e30);
    var aabbMax = vec3f(-1e30);

    for (var cx = 0u; cx < 2u; cx++) {
        for (var cy = 0u; cy < 2u; cy++) {
            let sx = select(sx0, sx1, cx == 1u);
            let sy = select(sy0, sy1, cy == 1u);

            // near-plane view point --> direction @depth 1 (z = -1)
            let ray = unprojectNear(sx, sy) / near;

            let pNear = ray * zSliceNear;
            let pFar  = ray * zSliceFar;

            aabbMin = min(aabbMin, min(pNear, pFar));
            aabbMax = max(aabbMax, max(pNear, pFar));
        }
    }

    // assign lights to cluster
    let clusterIdx = gid.x + gid.y * NX + gid.z * NX * NY;
    let baseIdx = clusterIdx * MAX_LIGHTS_PER_CLUSTER;
    const LIGHT_RADIUS: f32 = ${lightRadius};
    let lightRadiusSq = LIGHT_RADIUS * LIGHT_RADIUS;

    var count = 0u;
    for (var i = 0u; i < lightSet.numLights; i++) {
        if (count >= MAX_LIGHTS_PER_CLUSTER) { break; }

        let lightPosView = (cameraUniforms.viewMat * vec4f(lightSet.lights[i].pos, 1.0)).xyz;
        let closest = clamp(lightPosView, aabbMin, aabbMax);
        let d = lightPosView - closest;

        if (dot(d, d) <= lightRadiusSq) {
            clusterLightIndices[baseIdx + count] = i;
            count = count + 1u;
        }
    }

    clusterLightCounts[clusterIdx] = count;
}