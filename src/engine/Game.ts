import * as THREE from 'three';
import { World } from '../terrain/World';
import { Controls } from './Controls';
import { SimplexNoise } from '../terrain/Noise';

export class Game {
  private canvas: HTMLCanvasElement;
  
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock!: THREE.Clock;

  // Game Systems
  private world!: World;
  private controls!: Controls;
  private noiseEvaluator!: SimplexNoise; // For collision checks

  // Lights
  private dirLight!: THREE.DirectionalLight;
  private ambientLight!: THREE.AmbientLight;

  // Meshes
  private waterPlane!: THREE.Mesh;
  private playerArmGroup!: THREE.Group; // FPS Voxel Hand

  // Animation Frame ID
  private animationFrameId: number | null = null;

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    this.clock = new THREE.Clock();
    
    // Seed noise evaluator matching the world terrain generator
    this.noiseEvaluator = new SimplexNoise(1337);

    this.initThree();
    this.initLighting();
    this.initWater();
    this.initPlayerArm();
    
    this.world = new World(this.scene, 1337);
    this.controls = new Controls(this.camera, this.canvas);

    // Initial position: Start on the central plateau (X=0, Z=0)
    // Find initial Y ground level dynamically
    const startY = this.getGroundHeight(0, 0) + 2.5;
    this.controls.getObject().position.set(0, startY, 0);
    this.scene.add(this.controls.getObject());

    this.initResizeHandler();
    this.startLoop();
  }

  private initThree(): void {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    
    // Sky blue background
    this.scene.background = new THREE.Color(0xbfe3f4); // Cyan sky
    // Sky haze fog
    this.scene.fog = new THREE.FogExp2(0xbfe3f4, 0.012);

    // 2. Camera setup
    this.camera = new THREE.PerspectiveCamera(
      70, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Tone mapping
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
  }

  private initLighting(): void {
    // Soft sky light
    this.ambientLight = new THREE.AmbientLight(0xdbeafe, 0.6);
    this.scene.add(this.ambientLight);

    // Directional Sun Light
    this.dirLight = new THREE.DirectionalLight(0xfef08a, 1.2); // Warm sunlight
    this.dirLight.position.set(100, 150, 50);
    
    // Shadow properties
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 400;
    
    const d = 100;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;

    this.scene.add(this.dirLight);
  }

  private initWater(): void {
    // Infinite ocean look at Y = -0.5
    const waterGeo = new THREE.PlaneGeometry(2000, 2000);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4, // Vivid cyan
      transparent: true,
      opacity: 0.6,
      roughness: 0.15,
      metalness: 0.1,
      flatShading: true,
      side: THREE.DoubleSide // Visible from below when swimming underwater!
    });

    this.waterPlane = new THREE.Mesh(waterGeo, waterMat);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.position.y = -0.5;
    this.waterPlane.receiveShadow = true;

    this.scene.add(this.waterPlane);
  }

  /**
   * Builds and attaches the player's pixelated sleeve/arm mesh to the camera
   */
  private initPlayerArm(): void {
    this.playerArmGroup = new THREE.Group();

    // 1. Sleeve (Red tropical shirt block)
    const sleeveGeo = new THREE.BoxGeometry(0.2, 0.2, 0.6);
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Vibrant Red
      roughness: 0.9,
      flatShading: true
    });
    const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
    sleeve.position.set(0, 0, -0.3);
    sleeve.castShadow = true;
    sleeve.receiveShadow = true;
    this.playerArmGroup.add(sleeve);

    // 2. Hand (Flesh-toned beige block)
    const handGeo = new THREE.BoxGeometry(0.16, 0.16, 0.25);
    const handMat = new THREE.MeshStandardMaterial({
      color: 0xfbcfe8, // Soft pink/beige skin tone
      roughness: 0.9,
      flatShading: true
    });
    const hand = new THREE.Mesh(handGeo, handMat);
    hand.position.set(0, 0, -0.7);
    hand.castShadow = true;
    hand.receiveShadow = true;
    this.playerArmGroup.add(hand);

    // Position arm in the bottom right corner of the screen relative to camera
    this.playerArmGroup.position.set(0.35, -0.3, -0.4);
    // Rotate slightly inward
    this.playerArmGroup.rotation.set(0.2, -0.2, 0.1);

    // Add to camera so it moves along with player vision
    this.camera.add(this.playerArmGroup);
  }

  /**
   * Helper function to sample ground Y height at a specific horizontal coordinate
   */
  private getGroundHeight(wx: number, wz: number): number {
    // Walk downwards from a safe high value (e.g. Y=100) to find the density crossing point
    for (let wy = 80; wy > -80; wy -= 0.5) {
      const pos = new THREE.Vector3(wx, wy, wz);
      if (this.getTerrainDensity(pos) < 0) {
        return wy;
      }
    }
    return 0;
  }

  /**
   * Replicating the exact chunk density formula to allow instant, perfect collision detection
   */
  private getTerrainDensity(pos: THREE.Vector3): number {
    const wx = pos.x;
    const wy = pos.y;
    const wz = pos.z;

    const distFromCenter = Math.sqrt(wx * wx + wz * wz);
    const islandRadius = 160.0;
    const falloff = Math.max(0, 1.0 - distFromCenter / islandRadius);
    const t = falloff * falloff * (3 - 2 * falloff);

    const baseHeight = this.noiseEvaluator.fBm(wx * 0.006, 0, wz * 0.006, 4) * 35.0;
    const detailNoise = this.noiseEvaluator.fBm(wx * 0.03, wy * 0.02, wz * 0.03, 3) * 6.0;

    const terrainHeight = baseHeight * t - 4.0;
    
    let density = wy - (terrainHeight + detailNoise);

    if (distFromCenter > islandRadius) {
      density = wy + 10.0; // Air
    }

    return density;
  }

  private initResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private startLoop(): void {
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);
      this.tick();
    };
    loop();
  }

  private tick(): void {
    const delta = Math.min(this.clock.getDelta(), 0.1); // Clamp delta to avoid physics clips on lag

    if (this.controls.isLocked) {
      // Update movements & resolve collisions
      this.controls.update(delta, (pos) => this.getTerrainDensity(pos));

      // Dynamic stream chunks centered around player position
      const playerPos = this.controls.getObject().position;
      this.world.update(playerPos);

      // Follow lighting: adjust Sun light position relative to player to cast shadows near viewport
      // Placing sun almost perpendicular (straight down) temporarily for better workflow visibility
      this.dirLight.position.set(playerPos.x + 5, playerPos.y + 250, playerPos.z + 5);
      this.dirLight.target = this.controls.getObject();

      // Idle breathing micro-animation on the hand
      const time = this.clock.getElapsedTime();
      this.playerArmGroup.position.y = -0.3 + Math.sin(time * 2.0) * 0.008;
      this.playerArmGroup.position.x = 0.35 + Math.cos(time * 1.0) * 0.004;

      // Update UI HUD
      this.updateHUD(playerPos);
    }

    // Dynamic underwater visual effects transition
    this.updateUnderwaterEffect();

    // Render viewport scene
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Refreshes the HTML HUD labels with current positions, layers, and temperature readings
   */
  private updateHUD(playerPos: THREE.Vector3): void {
    const depthEl = document.getElementById('depth-value');
    const layerEl = document.getElementById('layer-value');
    const tempEl = document.getElementById('temp-value');

    // Round depth (Y position). We treat Y = 0 as 0m.
    const depth = Math.floor(playerPos.y);

    if (depthEl) {
      depthEl.innerText = `${depth} m`;
    }

    // Layer bounds matching world rules
    let layerName = "Superficie";
    let temp = 24; // Default stable temp

    if (depth <= -1100) {
      layerName = "Nucleo Nickel-Iron";
      temp = 3200;
    } else if (depth <= -700) {
      layerName = "Energia Geomagnetica";
      temp = 1200;
    } else if (depth <= -99) {
      layerName = "Magma";
      temp = 980;
    } else if (depth <= -67) {
      layerName = "Strato Profondo";
      // Interpolate temp rising between -67m (24°C) and -99m (980°C)
      const ratio = Math.min(1.0, (depth - (-67)) / (-99 - (-67)));
      temp = Math.round(24 + ratio * (980 - 24));
    } else if (depth <= -33) {
      layerName = "Cave Nascoste";
    } else if (depth <= -11) {
      layerName = "Roccia Viva";
    } else if (depth <= -7) {
      layerName = "Transizione";
    }

    if (layerEl) {
      layerEl.innerText = layerName;
    }
    if (tempEl) {
      tempEl.innerText = `${temp} °C`;
    }
  }

  public destroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.world.destroy();
    this.controls.destroy();
    this.controls.getObject().clear();
    this.scene.clear();
    this.renderer.dispose();
  }

  /**
   * Evaluates if the camera is below the ocean surface and applies realistic underwater fog/color transitions.
   */
  private updateUnderwaterEffect(): void {
    const cameraWorldPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraWorldPos);

    // Water level is at Y = -0.5
    const isUnderwater = cameraWorldPos.y < -0.5;
    const fog = this.scene.fog;

    if (fog && 'density' in fog) {
      if (isUnderwater) {
        // Deep turquoise pastel blue for Caribbean deep water, slightly darker and highly blurred
        (this.scene.background as THREE.Color).setHex(0x0a5870);
        (fog as THREE.FogExp2).color.setHex(0x0a5870);
        (fog as THREE.FogExp2).density = 0.15; // Thick fog to simulate muddy/scattering depth blur
      } else {
        // Clear sky blue and light mist above surface
        (this.scene.background as THREE.Color).setHex(0xbfe3f4);
        (fog as THREE.FogExp2).color.setHex(0xbfe3f4);
        (fog as THREE.FogExp2).density = 0.012;
      }
    }
  }
}
