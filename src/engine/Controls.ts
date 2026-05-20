import * as THREE from 'three';

export class Controls {
  private camera: THREE.Camera;
  private domElement: HTMLElement;

  // Rotation states
  private pitchObject = new THREE.Object3D();
  private yawObject = new THREE.Object3D();

  // Movement inputs
  public moveForward = false;
  public moveBackward = false;
  public moveLeft = false;
  public moveRight = false;
  public moveUp = false;
  public moveDown = false;
  
  // Physics modes
  public isFlying = false; // Spectator flight mode (toggled by 'V' key)
  public velocity = new THREE.Vector3();
  public isGrounded = false;

  public isLocked = false;
  public hasStarted = false;

  constructor(camera: THREE.Camera, domElement: HTMLElement) {
    this.camera = camera;
    this.domElement = domElement;

    // Structure: Yaw holds Pitch, Pitch holds Camera
    this.yawObject.position.set(0, 10, 0); // Start position
    this.yawObject.add(this.pitchObject);
    this.pitchObject.add(this.camera);

    this.initEventListeners();
  }

  public getObject(): THREE.Object3D {
    return this.yawObject;
  }

  private onPlayClick = (): void => {
    this.hasStarted = true;
    this.domElement.requestPointerLock();
  };

  private onResumeClick = (): void => {
    this.domElement.requestPointerLock();
  };

  private onQuitClick = (): void => {
    this.hasStarted = false;
    const confirmExit = document.getElementById('confirm-exit');
    const instructions = document.getElementById('instructions');
    if (confirmExit) confirmExit.style.display = 'none';
    if (instructions) instructions.style.display = 'flex';
    
    // Reset player position when quitting to main menu
    this.yawObject.position.set(0, 15, 0);
    this.velocity.set(0, 0, 0);
  };

  private onPointerLockChange = (): void => {
    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');
    const confirmExit = document.getElementById('confirm-exit');

    if (document.pointerLockElement === this.domElement) {
      this.isLocked = true;
      if (blocker) blocker.style.opacity = '0';
      setTimeout(() => { 
        if (blocker) blocker.style.display = 'none'; 
      }, 500);
    } else {
      this.isLocked = false;
      
      if (this.hasStarted) {
        if (instructions) instructions.style.display = 'none';
        if (confirmExit) confirmExit.style.display = 'flex';
      } else {
        if (instructions) instructions.style.display = 'flex';
        if (confirmExit) confirmExit.style.display = 'none';
      }

      if (blocker) {
        blocker.style.display = 'flex';
        blocker.style.opacity = '1';
      }
    }
  };

  private onMouseMoveEvent = (e: MouseEvent): void => {
    this.onMouseMove(e);
  };

  private onKeyDownEvent = (e: KeyboardEvent): void => {
    this.onKeyDown(e);
  };

  private onKeyUpEvent = (e: KeyboardEvent): void => {
    this.onKeyUp(e);
  };

  private initEventListeners(): void {
    const playButton = document.getElementById('play-button');
    const resumeButton = document.getElementById('resume-button');
    const quitButton = document.getElementById('quit-button');

    if (playButton) playButton.addEventListener('click', this.onPlayClick);
    if (resumeButton) resumeButton.addEventListener('click', this.onResumeClick);
    if (quitButton) quitButton.addEventListener('click', this.onQuitClick);

    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('mousemove', this.onMouseMoveEvent);
    document.addEventListener('keydown', this.onKeyDownEvent);
    document.addEventListener('keyup', this.onKeyUpEvent);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.isLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // Look sensitivities
    this.yawObject.rotation.y -= movementX * 0.0022;
    this.pitchObject.rotation.x -= movementY * 0.0022;

    // Clamp pitch between -85 and +85 degrees
    const maxPitch = Math.PI / 2 - 0.05;
    this.pitchObject.rotation.x = Math.max(-maxPitch, Math.min(maxPitch, this.pitchObject.rotation.x));
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.isLocked) return;

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        this.moveUp = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = true;
        break;
      case 'KeyV':
        // Toggle spectator flight mode
        this.isFlying = !this.isFlying;
        this.velocity.set(0, 0, 0);
        console.log(`Flight Mode: ${this.isFlying}`);
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBackward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'Space':
        this.moveUp = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.moveDown = false;
        break;
    }
  }

  /**
   * Updates player position and physics
   * @param delta Frame time delta in seconds
   * @param getDensity Function callback to sample terrain density at coordinate
   */
  public update(delta: number, getDensity: (pos: THREE.Vector3) => number): void {
    if (!this.isLocked) return;

    const speed = this.isFlying ? 30.0 : 8.0; // Faster in flight mode
    const friction = 10.0;

    // Dampen velocities
    this.velocity.x -= this.velocity.x * friction * delta;
    this.velocity.z -= this.velocity.z * friction * delta;
    if (this.isFlying) {
      this.velocity.y -= this.velocity.y * friction * delta;
    }

    // Determine movement direction vector
    const direction = new THREE.Vector3();
    if (this.moveForward) direction.z -= 1;
    if (this.moveBackward) direction.z += 1;
    if (this.moveLeft) direction.x -= 1;
    if (this.moveRight) direction.x += 1;
    direction.normalize();

    // Rotate movement direction based on camera horizontal heading (yaw)
    direction.applyQuaternion(this.yawObject.quaternion);

    // Apply acceleration
    this.velocity.addScaledVector(direction, speed * friction * delta);

    if (this.isFlying) {
      // Flight movement (Space = fly up, Shift = fly down)
      const flyDir = new THREE.Vector3(0, 0, 0);
      if (this.moveUp) flyDir.y += 1;
      if (this.moveDown) flyDir.y -= 1;
      this.velocity.addScaledVector(flyDir, speed * friction * delta);
      
      // Update position directly
      this.yawObject.position.addScaledVector(this.velocity, delta);
    } else {
      // 1. Gravity simulation
      const gravity = 22.0;
      this.velocity.y -= gravity * delta;

      // Jump
      if (this.moveUp && this.isGrounded) {
        this.velocity.y = 7.5; // Jump velocity
        this.isGrounded = false;
      }

      // Translate position horizontally
      const nextPos = this.yawObject.position.clone();
      nextPos.x += this.velocity.x * delta;
      nextPos.z += this.velocity.z * delta;

      // Translate position vertically
      nextPos.y += this.velocity.y * delta;

      // 2. Resolve Simple Collisions
      // Player height is 1.6m. We sample density at the player's feet
      // (nextPos.x, nextPos.y - 1.6, nextPos.z)
      const feetPos = nextPos.clone();
      feetPos.y -= 1.6;

      const densityFeet = getDensity(feetPos);

      if (densityFeet < 0.0) {
        // Feet are inside solid terrain (density < 0)
        // Push the player upwards until their feet are on/above surface
        let pushUp = 0;
        const testPos = feetPos.clone();
        
        // Find the ground surface (density = 0)
        for (let i = 0; i < 20; i++) {
          testPos.y += 0.15; // Incremental steps
          if (getDensity(testPos) >= 0.0) {
            pushUp = testPos.y - feetPos.y;
            break;
          }
        }

        // If step height is reasonable (e.g. climbing hills)
        if (pushUp < 1.8) {
          nextPos.y += pushUp;
          this.velocity.y = 0; // stop falling
          this.isGrounded = true;
        } else {
          // Hit a vertical cliff, block horizontal movement but keep falling
          nextPos.x = this.yawObject.position.x;
          nextPos.z = this.yawObject.position.z;
        }
      } else {
        this.isGrounded = false;
      }

      // Check head collision (density at player head)
      const headPos = nextPos.clone();
      const densityHead = getDensity(headPos);
      if (densityHead < 0.0) {
        this.velocity.y = Math.min(0, this.velocity.y); // bounce down
        nextPos.y = this.yawObject.position.y;
      }

      // Update positions
      this.yawObject.position.copy(nextPos);

      // Clamp position so player doesn't fall off to infinity below the world
      if (this.yawObject.position.y < -1200) {
        this.yawObject.position.set(0, 20, 0); // Respawn at island center altopiano
        this.velocity.set(0, 0, 0);
      }
    }
  }

  public destroy(): void {
    const playButton = document.getElementById('play-button');
    const resumeButton = document.getElementById('resume-button');
    const quitButton = document.getElementById('quit-button');

    if (playButton) playButton.removeEventListener('click', this.onPlayClick);
    if (resumeButton) resumeButton.removeEventListener('click', this.onResumeClick);
    if (quitButton) quitButton.removeEventListener('click', this.onQuitClick);

    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('mousemove', this.onMouseMoveEvent);
    document.removeEventListener('keydown', this.onKeyDownEvent);
    document.removeEventListener('keyup', this.onKeyUpEvent);
  }
}
