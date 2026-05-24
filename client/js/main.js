function showScreen(id) {
  document.querySelectorAll('.screen').forEach(function(s) {
    s.classList.remove('active');
  });
  document.getElementById('screen-' + id).classList.add('active');
}

function init() {
  var canvas = document.getElementById('particles-canvas');
  if (canvas) {
    new ParticleSystem(canvas);
  }
  showScreen('menu');
}

document.addEventListener('DOMContentLoaded', init);

document.addEventListener('click', function() {
  var audioCtx = window.AudioContext || window.webkitAudioContext;
  if (audioCtx && typeof audioCtx !== 'undefined') {
    try {
      var ctx = new audioCtx();
      ctx.close();
    } catch(e) {}
  }
}, { once: true });