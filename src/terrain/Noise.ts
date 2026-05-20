/**
 * Seedable, deterministic 3D Simplex Noise generator.
 * Used for procedural generation of terrain heights, layers, and caves.
 */
export class SimplexNoise {
  private p: Uint8Array;
  private perm: Uint8Array;
  private permMod12: Uint8Array;

  // Skewing and unskewing factors for 3D
  private static F3 = 1.0 / 3.0;
  private static G3 = 1.0 / 6.0;

  // Gradients for 3D Simplex noise
  private static grad3 = new Float32Array([
    1, 1, 0,  -1, 1, 0,  1,-1, 0,  -1,-1, 0,
    1, 0, 1,  -1, 0, 1,  1, 0,-1,  -1, 0,-1,
    0, 1, 1,   0,-1, 1,  0, 1,-1,   0,-1,-1
  ]);

  constructor(seed: number = 1337) {
    this.p = new Uint8Array(256);
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);

    // Initialize with sequential values
    for (let i = 0; i < 256; i++) {
      this.p[i] = i;
    }

    // Seeded Mulberry32 generator for deterministic shuffling
    const random = this.mulberry32(seed);

    // Shuffle the table
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const temp = this.p[i];
      this.p[i] = this.p[j];
      this.p[j] = temp;
    }

    // Populate perm and permMod12 arrays
    for (let i = 0; i < 512; i++) {
      const val = this.p[i & 255];
      this.perm[i] = val;
      this.permMod12[i] = val % 12;
    }
  }

  /**
   * Seedable pseudo-random number generator
   */
  private mulberry32(a: number) {
    return function() {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  }

  /**
   * Generates a 3D Simplex Noise value in the range [-1, 1]
   */
  public noise(xin: number, yin: number, zin: number): number {
    let s = (xin + yin + zin) * SimplexNoise.F3; // Skew factor
    let i = Math.floor(xin + s);
    let j = Math.floor(yin + s);
    let k = Math.floor(zin + s);

    let t = (i + j + k) * SimplexNoise.G3; // Unskew factor
    let X0 = i - t; // Unskewed origin coordinate
    let Y0 = j - t;
    let Z0 = k - t;

    let x0 = xin - X0; // Distances from cell origin
    let y0 = yin - Y0;
    let z0 = zin - Z0;

    // For 3D simplex, the cell shape is a slightly skewed tetrahedra.
    // Determine which simplex we are in.
    let i1, j1, k1; // Offsets for second corner
    let i2, j2, k2; // Offsets for third corner

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // X Y Z order
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; // X Z Y order
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; // Z X Y order
      }
    } else { // x0 < y0
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; // Z Y X order
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; // Y Z X order
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; // Y X Z order
      }
    }

    // A step of (1,0,0) in (i,j,k) means a step of (1-c,-c,-c) in (x,y,z),
    // a step of (0,1,0) in (i,j,k) means a step of (-c,1-c,-c) in (x,y,z), and
    // a step of (0,0,1) in (i,j,k) means a step of (-c,-c,1-c) in (x,y,z), where c = G3.
    let x1 = x0 - i1 + SimplexNoise.G3; // Offsets for second corner
    let y1 = y0 - j1 + SimplexNoise.G3;
    let z1 = z0 - k1 + SimplexNoise.G3;

    let x2 = x0 - i2 + 2.0 * SimplexNoise.G3; // Offsets for third corner
    let y2 = y0 - j2 + 2.0 * SimplexNoise.G3;
    let z2 = z0 - k2 + 2.0 * SimplexNoise.G3;

    let x3 = x0 - 1.0 + 3.0 * SimplexNoise.G3; // Offsets for fourth corner
    let y3 = y0 - 1.0 + 3.0 * SimplexNoise.G3;
    let z3 = z0 - 1.0 + 3.0 * SimplexNoise.G3;

    // Work out the hashed gradient indices of the four simplex corners
    let ii = i & 255;
    let jj = j & 255;
    let kk = k & 255;

    let gi0 = this.permMod12[ii + this.perm[jj + this.perm[kk]]];
    let gi1 = this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]];
    let gi2 = this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]];
    let gi3 = this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]];

    // Calculate the contribution from the four corners
    let n0, n1, n2, n3;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0.0;
    else {
      t0 *= t0;
      n0 = t0 * t0 * this.dot3d(gi0, x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0.0;
    else {
      t1 *= t1;
      n1 = t1 * t1 * this.dot3d(gi1, x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0.0;
    else {
      t2 *= t2;
      n2 = t2 * t2 * this.dot3d(gi2, x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0.0;
    else {
      t3 *= t3;
      n3 = t3 * t3 * this.dot3d(gi3, x3, y3, z3);
    }

    // Add contributions and scale the result to [-1, 1] range
    return 32.0 * (n0 + n1 + n2 + n3);
  }

  private dot3d(gi: number, x: number, y: number, z: number): number {
    const idx = gi * 3;
    return SimplexNoise.grad3[idx] * x + SimplexNoise.grad3[idx + 1] * y + SimplexNoise.grad3[idx + 2] * z;
  }

  /**
   * Fractional Brownian Motion (fBm) for layered, natural noise
   */
  public fBm(x: number, y: number, z: number, octaves = 4, lacunarity = 2.0, gain = 0.5): number {
    let total = 0.0;
    let amplitude = 1.0;
    let frequency = 1.0;
    let maxValue = 0.0; // Used for normalizing the result

    for (let i = 0; i < octaves; i++) {
      total += this.noise(x * frequency, y * frequency, z * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= gain;
      frequency *= lacunarity;
    }

    return total / maxValue;
  }
}
