import { edgeTable, triTable } from './MarchingTable';

// Constants for cube corner positions relative to local origin
const CORNER_OFFSETS = [
  [0, 0, 0], // 0
  [1, 0, 0], // 1
  [1, 1, 0], // 2
  [0, 1, 0], // 3
  [0, 0, 1], // 4
  [1, 0, 1], // 5
  [1, 1, 1], // 6
  [0, 1, 1]  // 7
];

// Map from edge ID to its starting and ending corners
const EDGE_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 0], // Bottom edges (0, 1, 2, 3)
  [4, 5], [5, 6], [6, 7], [7, 4], // Top edges (4, 5, 6, 7)
  [0, 4], [1, 5], [2, 6], [3, 7]  // Vertical edges (8, 9, 10, 11)
];

// Temporary buffers to avoid garbage collection overhead in the tight loops
const tempEdgeVerts = new Float32Array(12 * 3);
const tempEdgeNorms = new Float32Array(12 * 3);
const tempEdgeColors = new Float32Array(12 * 3);

/**
 * Linearly interpolates between two values.
 */
function interpolate(
  valA: number, valB: number,
  posA: number, posB: number,
  isolevel: number
): number {
  if (Math.abs(isolevel - valA) < 0.00001) return posA;
  if (Math.abs(isolevel - valB) < 0.00001) return posB;
  if (Math.abs(valA - valB) < 0.00001) return posA;
  
  const mu = (isolevel - valA) / (valB - valA);
  return posA + mu * (posB - posA);
}

/**
 * Consumes a single cube's corner data, interpolates edges intersected by the isolevel,
 * and adds triangles to the output vertex, normal, and color arrays.
 * 
 * @param x Local grid x coordinates
 * @param y Local grid y coordinates
 * @param z Local grid z coordinates
 * @param cornerDensities Densities at the 8 corners (0-7)
 * @param cornerGradients 3D density gradients at the 8 corners (0-7) (for smooth lighting normals)
 * @param cornerColors RGB colors at the 8 corners (0-7)
 * @param isolevel Isosurface threshold (usually 0.0)
 * @param outVertices Output float array of vertices
 * @param outNormals Output float array of normals
 * @param outColors Output float array of colors
 */
export function marchCube(
  x: number, y: number, z: number,
  cornerDensities: Float32Array,
  cornerGradients: Float32Array, // Flat array of 24 values (8 corners * 3 dimensions)
  cornerColors: Float32Array,    // Flat array of 24 values (8 corners * 3 channels)
  isolevel: number,
  outVertices: number[],
  outNormals: number[],
  outColors: number[]
): void {
  // Determine the index in the edgeTable configuration
  let cubeIndex = 0;
  if (cornerDensities[0] < isolevel) cubeIndex |= 1;
  if (cornerDensities[1] < isolevel) cubeIndex |= 2;
  if (cornerDensities[2] < isolevel) cubeIndex |= 4;
  if (cornerDensities[3] < isolevel) cubeIndex |= 8;
  if (cornerDensities[4] < isolevel) cubeIndex |= 16;
  if (cornerDensities[5] < isolevel) cubeIndex |= 32;
  if (cornerDensities[6] < isolevel) cubeIndex |= 64;
  if (cornerDensities[7] < isolevel) cubeIndex |= 128;

  // Retrieve the edge bitmask
  const edges = edgeTable[cubeIndex];
  if (edges === 0) return; // Entirely inside or outside the surface

  // Calculate coordinates of the 8 corners in world/chunk coordinates
  // (x, y, z are local coordinates inside the grid)
  
  // Calculate interpolated vertices and normals for the active edges
  for (let i = 0; i < 12; i++) {
    if (edges & (1 << i)) {
      const c1 = EDGE_CONNECTIONS[i][0];
      const c2 = EDGE_CONNECTIONS[i][1];
      
      const pos1X = x + CORNER_OFFSETS[c1][0];
      const pos1Y = y + CORNER_OFFSETS[c1][1];
      const pos1Z = z + CORNER_OFFSETS[c1][2];

      const pos2X = x + CORNER_OFFSETS[c2][0];
      const pos2Y = y + CORNER_OFFSETS[c2][1];
      const pos2Z = z + CORNER_OFFSETS[c2][2];

      const val1 = cornerDensities[c1];
      const val2 = cornerDensities[c2];

      // Interpolate vertex position
      const vx = interpolate(val1, val2, pos1X, pos2X, isolevel);
      const vy = interpolate(val1, val2, pos1Y, pos2Y, isolevel);
      const vz = interpolate(val1, val2, pos1Z, pos2Z, isolevel);

      tempEdgeVerts[i * 3] = vx;
      tempEdgeVerts[i * 3 + 1] = vy;
      tempEdgeVerts[i * 3 + 2] = vz;

      // Interpolate vertex normal (from density field gradients)
      const grad1X = cornerGradients[c1 * 3];
      const grad1Y = cornerGradients[c1 * 3 + 1];
      const grad1Z = cornerGradients[c1 * 3 + 2];

      const grad2X = cornerGradients[c2 * 3];
      const grad2Y = cornerGradients[c2 * 3 + 1];
      const grad2Z = cornerGradients[c2 * 3 + 2];

      let nx = interpolate(val1, val2, grad1X, grad2X, isolevel);
      let ny = interpolate(val1, val2, grad1Y, grad2Y, isolevel);
      let nz = interpolate(val1, val2, grad1Z, grad2Z, isolevel);

      // Normalize the gradient vector to get unit normal
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      if (len > 0.0001) {
        nx /= len;
        ny /= len;
        nz /= len;
      } else {
        nx = 0;
        ny = 1;
        nz = 0;
      }

      // We point normals outwards (towards lower density for standard terrain)
      tempEdgeNorms[i * 3] = nx;
      tempEdgeNorms[i * 3 + 1] = ny;
      tempEdgeNorms[i * 3 + 2] = nz;

      // Interpolate colors (R, G, B)
      const col1R = cornerColors[c1 * 3];
      const col1G = cornerColors[c1 * 3 + 1];
      const col1B = cornerColors[c1 * 3 + 2];

      const col2R = cornerColors[c2 * 3];
      const col2G = cornerColors[c2 * 3 + 1];
      const col2B = cornerColors[c2 * 3 + 2];

      tempEdgeColors[i * 3] = interpolate(val1, val2, col1R, col2R, isolevel);
      tempEdgeColors[i * 3 + 1] = interpolate(val1, val2, col1G, col2G, isolevel);
      tempEdgeColors[i * 3 + 2] = interpolate(val1, val2, col1B, col2B, isolevel);
    }
  }

  // Look up the active triangles and push to outputs
  const triStart = cubeIndex * 16;
  for (let i = 0; triTable[triStart + i] !== -1; i += 3) {
    const e0 = triTable[triStart + i];
    const e1 = triTable[triStart + i + 1];
    const e2 = triTable[triStart + i + 2];

    // Read coordinates
    const v0x = tempEdgeVerts[e0 * 3], v0y = tempEdgeVerts[e0 * 3 + 1], v0z = tempEdgeVerts[e0 * 3 + 2];
    const v1x = tempEdgeVerts[e1 * 3], v1y = tempEdgeVerts[e1 * 3 + 1], v1z = tempEdgeVerts[e1 * 3 + 2];
    const v2x = tempEdgeVerts[e2 * 3], v2y = tempEdgeVerts[e2 * 3 + 1], v2z = tempEdgeVerts[e2 * 3 + 2];

    // Read normals
    const n0x = tempEdgeNorms[e0 * 3], n0y = tempEdgeNorms[e0 * 3 + 1], n0z = tempEdgeNorms[e0 * 3 + 2];
    const n1x = tempEdgeNorms[e1 * 3], n1y = tempEdgeNorms[e1 * 3 + 1], n1z = tempEdgeNorms[e1 * 3 + 2];
    const n2x = tempEdgeNorms[e2 * 3], n2y = tempEdgeNorms[e2 * 3 + 1], n2z = tempEdgeNorms[e2 * 3 + 2];

    // Read colors
    const c0x = tempEdgeColors[e0 * 3], c0y = tempEdgeColors[e0 * 3 + 1], c0z = tempEdgeColors[e0 * 3 + 2];
    const c1x = tempEdgeColors[e1 * 3], c1y = tempEdgeColors[e1 * 3 + 1], c1z = tempEdgeColors[e1 * 3 + 2];
    const c2x = tempEdgeColors[e2 * 3], c2y = tempEdgeColors[e2 * 3 + 1], c2z = tempEdgeColors[e2 * 3 + 2];

    // Skip the triangle if it has any NaN values to safeguard GPU rendering culling
    if (
      isNaN(v0x) || isNaN(v0y) || isNaN(v0z) ||
      isNaN(v1x) || isNaN(v1y) || isNaN(v1z) ||
      isNaN(v2x) || isNaN(v2y) || isNaN(v2z) ||
      isNaN(n0x) || isNaN(n0y) || isNaN(n0z) ||
      isNaN(n1x) || isNaN(n1y) || isNaN(n1z) ||
      isNaN(n2x) || isNaN(n2y) || isNaN(n2z) ||
      isNaN(c0x) || isNaN(c0y) || isNaN(c0z) ||
      isNaN(c1x) || isNaN(c1y) || isNaN(c1z) ||
      isNaN(c2x) || isNaN(c2y) || isNaN(c2z)
    ) {
      continue;
    }

    // Push vertex 1
    outVertices.push(v0x, v0y, v0z);
    outNormals.push(n0x, n0y, n0z);
    outColors.push(c0x, c0y, c0z);

    // Push vertex 2
    outVertices.push(v1x, v1y, v1z);
    outNormals.push(n1x, n1y, n1z);
    outColors.push(c1x, c1y, c1z);

    // Push vertex 3
    outVertices.push(v2x, v2y, v2z);
    outNormals.push(n2x, n2y, n2z);
    outColors.push(c2x, c2y, c2z);
  }
}
