// Keyboard + mouse handling: a live key-down set, "just pressed" edge events consumed once per
// frame (so holding a key does not re-trigger an action every frame), and the mouse's screen and
// (once main.js supplies a camera) world position plus its button state.
export function createInput(canvas) {
  const down = new Set();
  const pressedThisFrame = new Set();
  const mouse = { x: 0, y: 0, worldX: 0, worldY: 0, leftDown: false, rightDown: false, leftClicked: false, rightClicked: false };

  function keyName(e) {
    return e.key.length === 1 ? e.key.toLowerCase() : e.key;
  }

  window.addEventListener('keydown', (e) => {
    const k = keyName(e);
    if (!down.has(k)) pressedThisFrame.add(k);
    down.add(k);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    down.delete(keyName(e));
  });
  window.addEventListener('blur', () => {
    down.clear();
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouse.leftDown = true;
      mouse.leftClicked = true;
    } else if (e.button === 2) {
      mouse.rightDown = true;
      mouse.rightClicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.leftDown = false;
    else if (e.button === 2) mouse.rightDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    mouse,
    /** Whether `key` (lowercase letter, or an arrow-key name) is currently held. */
    isDown(key) {
      return down.has(key);
    },
    /** Whether any of `keys` is currently held. */
    anyDown(...keys) {
      return keys.some((k) => down.has(k));
    },
    /** Whether `key` went down since the last endFrame() call (fires once per press). */
    wasPressed(key) {
      return pressedThisFrame.has(key);
    },
    /** Call once per frame after reading input, so edge-triggered keys/clicks reset. */
    endFrame() {
      pressedThisFrame.clear();
      mouse.leftClicked = false;
      mouse.rightClicked = false;
    },
  };
}
