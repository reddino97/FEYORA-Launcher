// Local UI sound effects and home ambience.
// Audio files are bundled with FEYORA so the launcher remains fully offline.
class SoundFX {
  constructor() {
    this.enabled = true;
    this.foreground = true;
    this.volume = 0.7;
    this.idleFactor = 1;
    this.currentScene = 'silent';
    this.music = new Audio('/static/music/home-ambience.mp3');
    this.music.loop = true;
    this.music.preload = 'auto';
    this.musicTarget = 0;
    this.musicFade = null;
    this._unlocked = false;
    this._unlock = () => this.unlockMusic();
    document.addEventListener('pointerdown', this._unlock, { passive: true });
    document.addEventListener('keydown', this._unlock, { passive: true });
  }

  _url(cue) { return `/static/sounds/zen/${cue}.mp3`; }

  _play(cue, gain = 1) {
    if (!this.enabled || !this.foreground) return;
    try {
      const audio = new Audio(this._url(cue));
      audio.volume = Math.max(0, Math.min(1, this.volume * gain));
      audio.play().catch(() => {});
    } catch (e) { /* audio is optional */ }
  }

  playMove() { this._play('focus', 0.45); }
  playSelect() { this._play('select', 0.75); }
  playBack() { this._play('back', 0.7); }
  playTab() { this._play('swipe', 0.55); }
  playFavorite() { this._play('achievement', 0.8); }
  playLaunch() { this._play('start', 0.8); }

  unlockMusic() {
    this._unlocked = true;
    if (this.musicTarget > 0) this._setMusicPlaying(true);
  }

  _setMusicPlaying(playing) {
    if (!playing) { this.music.pause(); return; }
    this.music.play().catch(() => {});
  }

  _fadeMusic(target) {
    target = Math.max(0, Math.min(1, target));
    this.musicTarget = target;
    clearInterval(this.musicFade);
    if (target > 0 && this._unlocked) this._setMusicPlaying(true);
    const start = this.music.volume;
    const started = performance.now();
    this.musicFade = setInterval(() => {
      const p = Math.min(1, (performance.now() - started) / 420);
      this.music.volume = start + (target - start) * p;
      if (p >= 1) {
        clearInterval(this.musicFade);
        this.musicFade = null;
        if (target === 0) this.music.pause();
      }
    }, 30);
  }

  // home: normal ambience, settings: very quiet, every other view: silent.
  setMusicScene(scene) {
    this.currentScene = scene;
    if (!this.enabled || !this.foreground) { this._fadeMusic(0); return; }
    const sceneGain = scene === 'home' ? 0.22 : (scene === 'settings' ? 0.035 : 0);
    this._fadeMusic(this.volume * sceneGain * this.idleFactor);
  }

  setForeground(active) {
    this.foreground = !!active;
    this.setMusicScene(this.currentScene);
  }

  setIdle(idle) {
    this.idleFactor = idle ? 0.35 : 1;
    this.setMusicScene(this.currentScene);
  }
}

window.SFX = new SoundFX();
