function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  document.getElementById('screen-' + id).classList.add('active');
  if (id === 'menu' || id === 'lobby' || id === 'game') {
    AudioManager.playMusic('/ui/music/Hidden%20Rules.mp3');
  } else {
    AudioManager.stopMusic();
  }
}

function init() {
  var canvas = document.getElementById('particles-canvas');
  if (canvas) {
    new ParticleSystem(canvas);
  }
  showScreen('menu');
  setupSettings();
}

function setupSettings() {
  var overlay = document.getElementById('settings-overlay');
  var musicToggle = document.getElementById('settings-music-toggle');
  var musicVol = document.getElementById('settings-music-volume');
  var musicVal = document.getElementById('settings-music-val');
  var sfxToggle = document.getElementById('settings-sfx-toggle');
  var sfxVol = document.getElementById('settings-sfx-volume');
  var sfxVal = document.getElementById('settings-sfx-val');

  function openSettings() { overlay.classList.remove('hidden'); }
  function closeSettings() { overlay.classList.add('hidden'); }

  document.getElementById('btn-menu-settings').addEventListener('click', openSettings);
  document.getElementById('btn-game-settings').addEventListener('click', openSettings);
  document.getElementById('btn-settings-close').addEventListener('click', closeSettings);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeSettings();
  });

  musicToggle.checked = AudioManager.musicEnabled;
  musicVol.value = Math.round(AudioManager.musicVolume * 100);
  musicVal.textContent = musicVol.value + '%';

  sfxToggle.checked = AudioManager.sfxEnabled;
  sfxVol.value = Math.round(AudioManager.sfxVolume * 100);
  sfxVal.textContent = sfxVol.value + '%';

  musicToggle.addEventListener('change', function() {
    AudioManager.setMusicEnabled(musicToggle.checked);
  });

  musicVol.addEventListener('input', function() {
    var v = parseInt(musicVol.value) / 100;
    musicVal.textContent = musicVol.value + '%';
    AudioManager.setMusicVolume(v);
  });

  sfxToggle.addEventListener('change', function() {
    AudioManager.setSfxEnabled(sfxToggle.checked);
  });

  sfxVol.addEventListener('input', function() {
    var v = parseInt(sfxVol.value) / 100;
    sfxVal.textContent = sfxVol.value + '%';
    AudioManager.setSfxVolume(v);
  });
}

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('click', function() {
  AudioManager.unlock();
}, { once: true });
