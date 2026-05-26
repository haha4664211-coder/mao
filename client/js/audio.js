var AudioManager = {
  musicEnabled: true,
  musicVolume: 0.5,
  sfxEnabled: true,
  sfxVolume: 0.7,
  musicAudio: null,
  musicGain: null,
  ctx: null,
  _unlocked: false,
  _pendingMusic: null,
  _pendingPlay: false,

  init: function() {
    var saved = localStorage.getItem('mao_audio');
    if (saved) {
      try {
        var s = JSON.parse(saved);
        this.musicEnabled = s.musicEnabled !== undefined ? s.musicEnabled : true;
        this.musicVolume = s.musicVolume !== undefined ? s.musicVolume : 0.5;
        this.sfxEnabled = s.sfxEnabled !== undefined ? s.sfxEnabled : true;
        this.sfxVolume = s.sfxVolume !== undefined ? s.sfxVolume : 0.7;
      } catch (e) {}
    }
  },

  save: function() {
    try {
      localStorage.setItem('mao_audio', JSON.stringify({
        musicEnabled: this.musicEnabled,
        musicVolume: this.musicVolume,
        sfxEnabled: this.sfxEnabled,
        sfxVolume: this.sfxVolume
      }));
    } catch (e) {}
  },

  unlock: function() {
    if (this._unlocked) return;
    this.ensureCtx();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this._unlocked = true;
    if (this._pendingPlay) {
      this._pendingPlay = false;
      this._doPlayMusic();
    }
  },

  ensureCtx: function() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  },

  _doPlayMusic: function() {
    var self = this;
    var src = self._pendingMusic;
    self.stopMusic();
    if (!self.musicEnabled || !src) return;

    fetch(src)
      .then(function(r) { return r.arrayBuffer(); })
      .then(function(buf) {
        if (!self.ctx) return;
        return self.ctx.decodeAudioData(buf);
      })
      .then(function(audioBuf) {
        if (!audioBuf || !self.ctx) return;
        var source = self.ctx.createBufferSource();
        source.buffer = audioBuf;
        source.loop = true;

        var gain = self.ctx.createGain();
        gain.gain.value = self.musicVolume;

        source.connect(gain);
        gain.connect(self.ctx.destination);

        source.start(0);
        self.musicAudio = source;
        self.musicGain = gain;
      })
      .catch(function(e) {
        console.log('Music load failed:', e);
      });
  },

  playMusic: function(src) {
    if (this.musicAudio && this._pendingMusic === src) return;
    this._pendingMusic = src;
    this._pendingPlay = true;
    if (this._unlocked) {
      this._doPlayMusic();
    } else {
      this.ensureCtx();
    }
  },

  stopMusic: function() {
    this._pendingPlay = false;
    if (this.musicAudio) {
      try { this.musicAudio.stop(); } catch (e) {}
      this.musicAudio = null;
      this.musicGain = null;
    }
  },

  setMusicVolume: function(v) {
    this.musicVolume = v;
    if (this.musicGain) {
      this.musicGain.gain.value = v;
    }
    this.save();
  },

  setMusicEnabled: function(enabled) {
    this.musicEnabled = enabled;
    if (enabled) {
      this.playMusic('/ui/music/Hidden%20Rules.mp3');
    } else {
      this.stopMusic();
    }
    this.save();
  },

  setSfxVolume: function(v) {
    this.sfxVolume = v;
    this.save();
  },

  setSfxEnabled: function(enabled) {
    this.sfxEnabled = enabled;
    this.save();
  },

  playSfx: function(type, baseVolume) {
    if (!this.sfxEnabled) return;
    this.unlock();

    var vol = (baseVolume || 0.15) * this.sfxVolume;
    try {
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      var t = this.ctx.currentTime;
      switch (type) {
        case 'cardPlay':
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
          gain.gain.setValueAtTime(vol, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
          osc.start(t); osc.stop(t + 0.1);
          break;
        case 'cardDraw':
          osc.frequency.setValueAtTime(300, t);
          osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
          gain.gain.setValueAtTime(vol * 0.8, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
          osc.start(t); osc.stop(t + 0.15);
          break;
        case 'turn':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, t);
          gain.gain.setValueAtTime(vol * 0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
          osc.start(t); osc.stop(t + 0.2);
          break;
        case 'punish':
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.setValueAtTime(660, t + 0.15);
          osc.frequency.setValueAtTime(880, t + 0.3);
          gain.gain.setValueAtTime(vol, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
          osc.start(t); osc.stop(t + 0.5);
          break;
        case 'click':
          osc.frequency.setValueAtTime(1000, t);
          gain.gain.setValueAtTime(vol * 0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
          osc.start(t); osc.stop(t + 0.05);
          break;
      }
    } catch (e) {}
  }
};

AudioManager.init();
