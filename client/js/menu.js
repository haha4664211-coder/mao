const nicknameInput = document.getElementById('nickname-input');
const btnHost = document.getElementById('btn-host');
const btnJoin = document.getElementById('btn-join');
const joinSection = document.getElementById('join-section');
const codeInput = document.getElementById('code-input');
const btnJoinSubmit = document.getElementById('btn-join-submit');
const menuError = document.getElementById('menu-error');

btnHost.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  if (!nickname) {
    showMenuError('Please enter a nickname');
    return;
  }
  myNickname = nickname;
  socket.emit('create_lobby', { nickname });
});

btnJoin.addEventListener('click', () => {
  if (!nicknameInput.value.trim()) {
    showMenuError('Please enter a nickname first');
    return;
  }
  joinSection.classList.toggle('hidden');
  if (!joinSection.classList.contains('hidden')) {
    codeInput.focus();
  }
});

btnJoinSubmit.addEventListener('click', () => {
  const nickname = nicknameInput.value.trim();
  const code = codeInput.value.trim();
  if (!nickname) { showMenuError('Enter nickname'); return; }
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    showMenuError('Enter a valid 6-digit code');
    return;
  }
  myNickname = nickname;
  socket.emit('join_lobby', { code, nickname });
});

socket.on('lobby_created', (state) => {
  currentRoom = state.code;
  storeRoomInfo(state.code, myNickname);
  showMenuError('');
  showScreen('lobby');
  renderLobby(state);
});

socket.on('lobby_joined', (state) => {
  currentRoom = state.code;
  storeRoomInfo(state.code, myNickname);
  showMenuError('');
  showScreen('lobby');
  renderLobby(state);
});

function showMenuError(msg) {
  menuError.textContent = msg;
  menuError.classList.toggle('hidden', !msg);
}