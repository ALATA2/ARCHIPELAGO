import * as THREE from 'three';
import { SimplexNoise } from './Noise';
import { Chunk, CHUNK_SIZE } from './Chunk';

export class World {
  private scene: THREE.Scene;
  private noise: SimplexNoise;
  private terrainMaterial: THREE.Material;

  // Active chunks dictionary: key "x,y,z" -> Chunk
  public chunks: Map<string, Chunk> = new Map();

  // Settings
  private renderRadius = 4;       // Horizontal render radius in chunks
  private verticalRadius = 2;     // Vertical render radius in chunks
  private lastPlayerChunkX = 999;
  private lastPlayerChunkY = 999;
  private lastPlayerChunkZ = 999;

  constructor(scene: THREE.Scene, seed: number = 1337) {
    this.scene = scene;
    this.noise = new SimplexNoise(seed);

    // Create the terrain material with vertex colors and smooth shading for soft shapes
    this.terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: false, // Smooth shading for soft organic hills!
      side: THREE.DoubleSide
    });
  }

  /**
   * Updates chunks centered around the player's world position
   */
  public update(playerPos: THREE.Vector3): void {
    // Convert player position to chunk coordinates
    const pChunkX = Math.floor(playerPos.x / CHUNK_SIZE);
    const pChunkY = Math.floor(playerPos.y / CHUNK_SIZE);
    const pChunkZ = Math.floor(playerPos.z / CHUNK_SIZE);

    // Only recalculate chunks when the player crosses a chunk boundary to save CPU cycles
    if (
      pChunkX !== this.lastPlayerChunkX ||
      pChunkY !== this.lastPlayerChunkY ||
      pChunkZ !== this.lastPlayerChunkZ
    ) {
      this.lastPlayerChunkX = pChunkX;
      this.lastPlayerChunkY = pChunkY;
      this.lastPlayerChunkZ = pChunkZ;

      this.loadAndCullChunks(pChunkX, pChunkY, pChunkZ);
    }
  }

  /**
   * Identifies which chunks need to be loaded or culled
   */
  private loadAndCullChunks(px: number, py: number, pz: number): void {
    const activeKeys = new Set<string>();

    // 1. Identify and load chunks within radius
    for (let dz = -this.renderRadius; dz <= this.renderRadius; dz++) {
      const cz = pz + dz;
      for (let dy = -this.verticalRadius; dy <= this.verticalRadius; dy++) {
        const cy = py + dy;
        for (let dx = -this.renderRadius; dx <= this.renderRadius; dx++) {
          const cx = px + dx;

          // Perform spherical distance check for smoother chunk loading boundaries
          const distanceSq = dx * dx + dz * dz;
          if (distanceSq <= this.renderRadius * this.renderRadius) {
            
            // Constrain generation depth for Step 1
            if (cy < -4 || cy > 2) continue;

            const key = `${cx},${cy},${cz}`;
            activeKeys.add(key);

            if (!this.chunks.has(key)) {
              // Instantiate new chunk (Marching Cubes geometry is built inside constructor)
              const chunk = new Chunk(
                cx, cy, cz,
                this.noise,
                this.scene,
                this.terrainMaterial
              );
              this.chunks.set(key, chunk);
            }
          }
        }
      }
    }

    // 2. Cull distant chunks to free memory
    for (const [key, chunk] of this.chunks.entries()) {
      if (!activeKeys.has(key)) {
        chunk.dispose(this.scene);
        this.chunks.delete(key);
      }
    }

    // Update UI HUD chunk count
    const chunksValEl = document.getElementById('chunks-value');
    if (chunksValEl) {
      chunksValEl.innerText = this.chunks.size.toString();
    }
  }

  /**
   * Cleans up all loaded chunks from the scene
   */
  public destroy(): void {
    for (const chunk of this.chunks.values()) {
      chunk.dispose(this.scene);
    }
    this.chunks.clear();
    this.terrainMaterial.dispose();
  }
}
