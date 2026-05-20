import { Game } from './engine/Game';

function init() {
  // 1. Clean up existing game instances and event listeners on hot-swap
  if ((window as any).__gameInstance) {
    try {
      (window as any).__gameInstance.destroy();
    } catch (e) {
      console.warn('Failed to destroy previous game instance:', e);
    }
  }

  if ((window as any).__cleanupMainListeners) {
    try {
      (window as any).__cleanupMainListeners();
    } catch (e) {
      console.warn('Failed to clean up main event listeners:', e);
    }
  }

  // 2. Initialize new Game Engine and store reference globally
  const game = new Game();
  (window as any).__gameInstance = game;

  // 3. Wire up Interactive HUD hotbar slots selection
  const slots = document.querySelectorAll('.hotbar .slot');
  let currentActiveIdx = 0;

  function setActiveSlot(index: number) {
    currentActiveIdx = (index + 9) % 9;
    slots.forEach((slot, idx) => {
      if (idx === currentActiveIdx) {
        slot.classList.add('active');
      } else {
        slot.classList.remove('active');
      }
    });
  }

  // Click handlers for slots
  const clickHandlers: { el: Element; fn: () => void }[] = [];
  slots.forEach((slot, index) => {
    const handler = () => setActiveSlot(index);
    slot.addEventListener('click', handler);
    clickHandlers.push({ el: slot, fn: handler });
  });

  // Keyboard slot selection (keys 1 to 9)
  const onKeyDown = (e: KeyboardEvent) => {
    const key = e.key;
    if (key >= '1' && key <= '9') {
      const idx = parseInt(key) - 1;
      setActiveSlot(idx);
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // Mouse wheel slot selection
  const onWheel = (e: WheelEvent) => {
    if (document.pointerLockElement) {
      if (e.deltaY > 0) {
        setActiveSlot(currentActiveIdx + 1);
      } else {
        setActiveSlot(currentActiveIdx - 1);
      }
    }
  };
  document.addEventListener('wheel', onWheel);

  // Store cleanup callback for hot-swaps
  (window as any).__cleanupMainListeners = () => {
    clickHandlers.forEach(({ el, fn }) => el.removeEventListener('click', fn));
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('wheel', onWheel);
  };
}

// Bootstrap once the DOM is ready (interactive or complete)
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  document.addEventListener('DOMContentLoaded', init);
}

