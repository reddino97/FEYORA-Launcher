// Web Audio API Synthesizer for Console Feedback (Nintendo Switch / Xbox style)

class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.7;
    this._master = null;
  }

  // uscita comune con il volume degli effetti (Impostazioni -> Controller e audio)
  out() {
    if (!this._master || this._master.context !== this.ctx) {
      this._master = this.ctx.createGain();
      this._master.connect(this.ctx.destination);
    }
    this._master.gain.value = Math.max(0, Math.min(1, this.volume));
    return this._master;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Smooth short blip for navigating list / cards
  playMove() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      
      const now = this.ctx.currentTime;
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(580, now + 0.04);
      
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
      
      osc.connect(gain);
      gain.connect(this.out());
      
      osc.start(now);
      osc.stop(now + 0.05);
    } catch(e) {}
  }

  // Positive chime for confirming / selecting / opening
  playSelect() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc1.type = 'triangle';
      osc2.type = 'sine';
      
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // E5
      
      osc2.frequency.setValueAtTime(1046.5, now); // C6
      osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.08); // E6

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.out());

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.13);
      osc2.stop(now + 0.13);
    } catch(e) {}
  }

  // Descending chime for cancel / back
  playBack() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(493.88, now); // B4
      osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.09); // E4

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(this.out());

      osc.start(now);
      osc.stop(now + 0.1);
    } catch(e) {}
  }

  // Tab switch woosh/click
  playTab() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.exponentialRampToValueAtTime(740, now + 0.06);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.out());

      osc.start(now);
      osc.stop(now + 0.07);
    } catch(e) {}
  }

  // Sparkling chord when favoriting
  playFavorite() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const notes = [659.25, 830.61, 987.77, 1318.51]; // E major chord
      notes.forEach((freq, idx) => {
        const now = this.ctx.currentTime + idx * 0.03;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.out());
        osc.start(now);
        osc.stop(now + 0.2);
      });
    } catch(e) {}
  }

  // Grand launch sound
  playLaunch() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.35);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.connect(gain);
      gain.connect(this.out());

      osc.start(now);
      osc.stop(now + 0.5);
    } catch(e) {}
  }
}

window.SFX = new SoundFX();
