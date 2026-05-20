import * as THREE from 'three';
import { SimplexNoise } from './Noise';
import { marchCube } from './MarchingCubes';

export const CHUNK_SIZE = 16;
export const ISO_LEVEL = 0.0;

export class Chunk {
  public chunkX: number;
  public chunkY: number;
  public chunkZ: number;
  
  public worldX: number;
  public worldY: number;
  public worldZ: number;

  public mesh: THREE.Mesh | null = null;
  public isDisposed = false;

  // Grid size with padding for neighbor reading (gradient and seamless connection)
  // We need values from -1 to CHUNK_SIZE + 1. Total size is CHUNK_SIZE + 3
  private gridSize = CHUNK_SIZE + 3;
  private densities: Float32Array;
  private gradients: Float32Array;
  private colors: Float32Array;

  constructor(
    chunkX: number,
    chunkY: number,
    chunkZ: number,
    noise: SimplexNoise,
    scene: THREE.Scene,
    material: THREE.Material
  ) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.chunkZ = chunkZ;

    this.worldX = chunkX * CHUNK_SIZE;
    this.worldY = chunkY * CHUNK_SIZE;
    this.worldZ = chunkZ * CHUNK_SIZE;

    this.densities = new Float32Array(this.gridSize * this.gridSize * this.gridSize);
    this.gradients = new Float32Array(this.gridSize * this.gridSize * this.gridSize * 3);
    this.colors = new Float32Array(this.gridSize * this.gridSize * this.gridSize * 3);

    // 1. Generate densities and colors at grid points
    this.generateFields(noise);

    // 2. Compute gradients at grid points for smooth normals
    this.computeGradients();

    // 3. Build the 3D geometry using Marching Cubes
    this.buildMesh(scene, material);
  }

  /**
   * Helper to map 3D local padded grid coordinates to flat 1D array index
   */
  private getIdx(lx: number, ly: number, lz: number): number {
    // lx, ly, lz range from 0 to gridSize - 1
    const x = lx + 1;
    const y = ly + 1;
    const z = lz + 1;
    return x + y * this.gridSize + z * this.gridSize * this.gridSize;
  }

  /**
   * Evaluates densities and textures/colors at each grid vertex
   */
  private generateFields(noise: SimplexNoise): void {
    const padMin = -1;
    const padMax = CHUNK_SIZE + 1;

    for (let lz = padMin; lz <= padMax; lz++) {
      const wz = this.worldZ + lz;
      for (let lx = padMin; lx <= padMax; lx++) {
        const wx = this.worldX + lx;

        // Calculate 2D island shape and terrain base height ONCE per horizontal column
        const distFromCenter = Math.sqrt(wx * wx + wz * wz);
        const islandRadius = 160.0;
        const falloff = Math.max(0, 1.0 - distFromCenter / islandRadius);
        const t = falloff * falloff * (3 - 2 * falloff);
        
        // Base height fBm (4 octaves) - heavy math, now optimized!
        const baseHeight = noise.fBm(wx * 0.006, 0, wz * 0.006, 4) * 35.0;
        const terrainHeight = baseHeight * t - 4.0;

        for (let ly = padMin; ly <= padMax; ly++) {
          const wy = this.worldY + ly;
          const idx = this.getIdx(lx, ly, lz);

          // 3D detail noise (3 octaves)
          const detailNoise = noise.fBm(wx * 0.03, wy * 0.02, wz * 0.03, 3) * 6.0;

          // 3. Density formula: positive is air, negative is ground
          let density = wy - (terrainHeight + detailNoise);

          // Ensure ocean borders are empty (positive density)
          if (distFromCenter > islandRadius) {
            density = wy + 10.0; // Force empty air / ocean basin
          }

          this.densities[idx] = density;

          // 4. Color Assignment based on height and depth layers
          let r = 0.5, g = 0.5, b = 0.5;

          // Calculate height-based materials
          if (wy <= -99) {
            // Magma layer (Step 3/5 preview)
            r = 0.9; g = 0.1; b = 0.0;
          } else if (wy <= -67) {
            // Deep Basalt layer (Step 3/5 preview) - Dark grey/black
            r = 0.12; g = 0.12; b = 0.14;
          } else if (wy <= -11) {
            // Rock layer - Cold Slate Grey
            r = 0.45; g = 0.48; b = 0.5;
          } else if (wy <= -7) {
            // Clay/Gravel - Ochre / Dark Sand
            r = 0.65; g = 0.55; b = 0.42;
          } else {
            // Surface & Shoreline
            if (wy <= 1.5 && wy >= -4.0 && t > 0.05) {
              // Sandy Beach - Bright Warm Yellow
              r = 0.92; g = 0.82; b = 0.55;
            } else {
              // Soft Soil - Light Earthy Brown
              r = 0.48; g = 0.35; b = 0.25;
            }
          }

          const cIdx = idx * 3;
          this.colors[cIdx] = r;
          this.colors[cIdx + 1] = g;
          this.colors[cIdx + 2] = b;
        }
      }
    }
  }

  /**
   * Computes central differences to determine gradients for smooth normals
   */
  private computeGradients(): void {
    const padMin = 0;
    const padMax = CHUNK_SIZE; // 16

    for (let lz = padMin; lz <= padMax; lz++) {
      for (let ly = padMin; ly <= padMax; ly++) {
        for (let lx = padMin; lx <= padMax; lx++) {
          const idx = this.getIdx(lx, ly, lz);

          // Get neighbor indices
          const idxXP = this.getIdx(lx + 1, ly, lz);
          const idxXM = this.getIdx(lx - 1, ly, lz);
          const idxYP = this.getIdx(lx, ly + 1, lz);
          const idxYM = this.getIdx(lx, ly - 1, lz);
          const idxZP = this.getIdx(lx, ly, lz + 1);
          const idxZM = this.getIdx(lx, ly, lz - 1);

          // Compute gradients (central difference)
          const gx = this.densities[idxXP] - this.densities[idxXM];
          const gy = this.densities[idxYP] - this.densities[idxYM];
          const gz = this.densities[idxZP] - this.densities[idxZM];

          const gIdx = idx * 3;
          this.gradients[gIdx] = gx;
          this.gradients[gIdx + 1] = gy;
          this.gradients[gIdx + 2] = gz;
        }
      }
    }
  }

  /**
   * Processes the density grid to construct a BufferGeometry and Three.js Mesh
   */
  private buildMesh(scene: THREE.Scene, material: THREE.Material): void {
    const vertices: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];

    // Local arrays for 8 corners
    const cornerDensities = new Float32Array(8);
    const cornerGradients = new Float32Array(24);
    const cornerColors = new Float32Array(24);

    // March through each voxel cell in the chunk
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {

          // Populate the corners data
          for (let c = 0; c < 8; c++) {
            const ox = c === 1 || c === 2 || c === 5 || c === 6 ? 1 : 0;
            const oy = c === 2 || c === 3 || c === 6 || c === 7 ? 1 : 0;
            const oz = c === 4 || c === 5 || c === 6 || c === 7 ? 1 : 0;

            const gridIdx = this.getIdx(lx + ox, ly + oy, lz + oz);
            
            cornerDensities[c] = this.densities[gridIdx];

            // Gradient
            const gIdx = gridIdx * 3;
            cornerGradients[c * 3] = this.gradients[gIdx];
            cornerGradients[c * 3 + 1] = this.gradients[gIdx + 1];
            cornerGradients[c * 3 + 2] = this.gradients[gIdx + 2];

            // Colors
            const colIdx = gridIdx * 3;
            let cr = this.colors[colIdx];
            let cg = this.colors[colIdx + 1];
            let cb = this.colors[colIdx + 2];

            // Apply procedural GRASS override on the top of soil
            // If it is soil, and we are looking at the top vertex, and the gradient points upwards
            if (cr === 0.48 && cg === 0.35 && cb === 0.25) {
              const ny = -this.gradients[gIdx + 1]; // Invert gradient to get slope direction
              const nx = -this.gradients[gIdx];
              const nz = -this.gradients[gIdx + 2];
              const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
              
              // If surface points upwards (slope <= 35 degrees)
              if (len > 0 && (ny / len) > 0.72) {
                // Bright Vibrant Tropical Green
                cr = 0.35; cg = 0.68; cb = 0.35;
              }
            }

            cornerColors[c * 3] = cr;
            cornerColors[c * 3 + 1] = cg;
            cornerColors[c * 3 + 2] = cb;
          }

          // Run Marching Cubes for this single voxel
          marchCube(
            lx, ly, lz,
            cornerDensities,
            cornerGradients,
            cornerColors,
            ISO_LEVEL,
            vertices,
            normals,
            colors
          );
        }
      }
    }

    if (vertices.length === 0) return;

    // Create Three.js Buffers
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

    // Create Three.js Mesh
    this.mesh = new THREE.Mesh(geometry, material);
    
    // Position mesh at the chunk's world position
    this.mesh.position.set(this.worldX, this.worldY, this.worldZ);

    // Cast and receive shadows for gorgeous lowpoly lighting
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    scene.add(this.mesh);
  }

  /**
   * Destroys and cleans up WebGL geometries and meshes
   */
  public dispose(scene: THREE.Scene): void {
    this.isDisposed = true;
    if (this.mesh) {
      scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh = null;
    }
  }
}
