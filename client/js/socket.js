const socket = io();

let myId = null;
let myNickname = '';
let currentRoom = null;

socket.on('connect', () => {
  myId = socket.id;
  tryReconnect();
});

socket.on('disconnect', () => {
  showToast('Disconnected from server', 'error');
});

socket.on('error', (data) => {
  showToast(data.message, 'error');
});

socket.on('kicked', () => {
  showToast('You were kicked from the lobby', 'error');
  clearStoredRoom();
  showScreen('menu');
  currentRoom = null;
});

function tryReconnect() {
  var stored = localStorage.getItem('mao_reconnect');
  if (!stored) return;
  try {
    var data = JSON.parse(stored);
    if (data.code && data.nickname) {
      myNickname = data.nickname;
      currentRoom = data.code;
      socket.emit('reconnect_game', { code: data.code, nickname: data.nickname });
    }
  } catch (e) {}
}

socket.on('game_state', function(state) {
  if (state.yourHand && currentRoom) {
    showScreen('game');
    gameState = state;
    myHand = state.yourHand || [];
    gameRoomCode.textContent = currentRoom;
    renderGame();
  }
});

function storeRoomInfo(code, nickname) {
  try {
    localStorage.setItem('mao_reconnect', JSON.stringify({ code, nickname }));
  } catch (e) {}
}

function clearStoredRoom() {
  try { localStorage.removeItem('mao_reconnect'); } catch (e) {}
}

function showToast(message, type) {
  if (!type) type = 'info';
  var container = document.getElementById('toast-container');
  var toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(function() {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(function() { toast.remove(); }, 300);
  }, 3000);
}