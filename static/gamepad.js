// Gamepad & Keyboard Spatial Navigation Engine for 100% Controller Navigation

class GamepadEngine {
  constructor() {
    this.gamepadIndex = null;
    this.lastState = {};
    this.nextRepeat = {};
    this.repeatDelay = 350;
    this.repeatInterval = 130;
    this.deadzone = 0.35;
    this.pollTimer = null;
    this.rumbleEnabled = true;
    this.rumbleScale = 1;

    // Focus system
    this.currentZone = 'carousel'; // 'carousel' | 'header' | 'actions' | 'settings' | 'profile' | 'modal_details' | 'modal_cover' | 'modal_launch'
    this.headerFocusIndex = 0; // index in header items (categories + right buttons)
    this.actionsFocusIndex = 0; // 0: Play, 1: Fav, 2: Cover, 3: Details
    this.settingsFocusIndex = 0; // row in settings
    this.profileFocusIndex = 0; // row in profile
    this.modalFocusIndex = 0; // index in modal buttons
    this.coverFocusRow = 0; // 0: top buttons, 1: suggestions grid, 2: url input/button, 3: close button
    this.coverGridIndex = 0; // index inside suggestions grid

    this.callbacks = {};
    this.initEvents();
    this.startPolling();
  }

  on(action, callback) {
    this.callbacks[action] = callback;
  }

  trigger(action, data) {
    if (this.callbacks[action]) {
      this.callbacks[action](data);
    }
  }

  initEvents() {
    window.addEventListener('gamepadconnected', (e) => {
      if (this.gamepadIndex === null || !this.getActivePad()) this.gamepadIndex = e.gamepad.index;
      this.lastState = {};
      this.nextRepeat = {};
      console.log('Gamepad connected:', e.gamepad.id);
      this.trigger('connectionChange', { connected: true, id: e.gamepad.id });
      this.rumbleSoft();
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
      }
      this.lastState = {};
      this.nextRepeat = {};
      console.log('Gamepad disconnected:', e.gamepad.id);
      this.trigger('connectionChange', { connected: false });
    });

    // Keyboard fallback with identical controls
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        this.handleAction('f11');
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        this.handleAction(e.shiftKey ? 'left' : 'right');
        return;
      }

      // Don't intercept if user is typing in text input (e.g. Nickname or URL)
      if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.target.blur();
        }
        return;
      }

      const keyMap = {
        ArrowLeft: 'left',
        ArrowRight: 'right',
        ArrowUp: 'up',
        ArrowDown: 'down',
        Enter: 'a',
        ' ': 'a',
        Escape: 'b',
        Backspace: 'b',
        f: 'y',
        F: 'y',
        y: 'y',
        Y: 'y',
        x: 'x',
        X: 'x',
        c: 'x',
        C: 'x',
        i: 'info',
        I: 'info',
        q: 'lb',
        Q: 'lb',
        e: 'rb',
        E: 'rb',
        PageUp: 'lt',
        PageDown: 'rt',
        s: 'start',
        S: 'start',
        m: 'start',
        M: 'start',
        p: 'select',
        P: 'select',
        v: 'select',
        V: 'select',
        r: 'l3',
        R: 'l3'
      };

      const act = keyMap[e.key];
      if (act) {
        e.preventDefault();
        this.handleAction(act);
      }
    });
  }

  rumble(weak = 0.2, strong = 0.0, duration = 80) {
    if (!this.rumbleEnabled) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads[this.gamepadIndex];
    if (pad && pad.vibrationActuator) {
      try {
        pad.vibrationActuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: duration,
          weakMagnitude: Math.min(1, weak * this.rumbleScale),
          strongMagnitude: Math.min(1, strong * this.rumbleScale)
        }).catch(() => {});
      } catch (e) {}
    }
  }

  rumbleSoft() {
    this.rumble(0.18, 0.0, 50);
  }

  rumbleHeavy() {
    this.rumble(0.5, 0.7, 220);
  }

  startPolling() {
    const poll = () => {
      this.pollGamepad();
      const delay = document.visibilityState === 'hidden' ? 500 : (this.getActivePad() ? 16 : 120);
      this.pollTimer = setTimeout(poll, delay);
    };
    this.pollTimer = setTimeout(poll, 0);
  }

  getActivePad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) return pads[this.gamepadIndex];
    for (let i = 0; i < pads.length; i++) {
      if (pads[i]) { this.gamepadIndex = i; return pads[i]; }
    }
    return null;
  }

  pollGamepad() {
    if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
    const pad = this.getActivePad();
    if (!pad) return;

    const btn = (idx) => pad.buttons[idx] && (pad.buttons[idx].pressed || (typeof pad.buttons[idx].value === 'number' && pad.buttons[idx].value > 0.45));
    const axX = pad.axes[0] || 0;
    const axY = pad.axes[1] || 0;

    const left = btn(14) || axX < -this.deadzone;
    const right = btn(15) || axX > this.deadzone;
    const up = btn(12) || axY < -this.deadzone;
    const down = btn(13) || axY > this.deadzone;

    this.checkEdge('left', left, true, () => this.handleAction('left'));
    this.checkEdge('right', right, true, () => this.handleAction('right'));
    this.checkEdge('up', up, true, () => this.handleAction('up'));
    this.checkEdge('down', down, true, () => this.handleAction('down'));

    this.checkEdge('a', btn(0), false, () => this.handleAction('a'));
    this.checkEdge('b', btn(1), false, () => this.handleAction('b'));
    this.checkEdge('x', btn(2), false, () => this.handleAction('x'));
    this.checkEdge('y', btn(3), false, () => this.handleAction('y'));

    this.checkEdge('lb', btn(4), false, () => this.handleAction('lb'));
    this.checkEdge('rb', btn(5), false, () => this.handleAction('rb'));
    this.checkEdge('lt', btn(6) || pad.axes[2] > 0.5, true, () => this.handleAction('lt'));
    this.checkEdge('rt', btn(7) || pad.axes[5] > 0.5, true, () => this.handleAction('rt'));

    this.checkEdge('select', btn(8), false, () => this.handleAction('select'));
    this.checkEdge('start', btn(9), false, () => this.handleAction('start'));
    this.checkEdge('l3', btn(10), false, () => this.handleAction('l3'));
  }

  checkEdge(name, isPressed, canRepeat, callback) {
    const now = performance.now();
    if (isPressed) {
      if (!this.lastState[name]) {
        this.lastState[name] = true;
        this.nextRepeat[name] = now + this.repeatDelay;
        callback();
      } else if (canRepeat && now >= this.nextRepeat[name]) {
        this.nextRepeat[name] = now + this.repeatInterval;
        callback();
      }
    } else {
      this.lastState[name] = false;
    }
  }

  handleAction(action) {
    if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
    this.trigger('action', { action, zone: this.currentZone });
  }
}

window.GamepadManager = new GamepadEngine();
