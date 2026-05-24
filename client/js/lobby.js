const roomCodeEl = document.getElementById('room-code');
const lobbyPlayersEl = document.getElementById('lobby-players');
const btnReady = document.getElementById('btn-ready');
const btnStartGame = document.getElementById('btn-start-game');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');
const btnCopyCode = document.getElementById('btn-copy-code');

let isReady = false;

function renderLobby(state) {
  roomCodeEl.textContent = state.code;

  lobbyPlayersEl.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'lobby-player';
    const isMe = p.id === myId;
    div.innerHTML = `
      <span class="player-name">${p.nickname} ${isMe ? '(You)' : ''}</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${p.isHost ? '<span class="player-tag tag-host">HOST</span>' : ''}
        ${!p.isHost ? `<span class="player-tag ${p.isReady ? 'tag-ready' : 'tag-not-ready'}">${p.isReady ? 'READY' : 'NOT READY'}</span>` : ''}
        ${state.hostId === myId && !p.isHost ? `<button class="btn btn-small btn-danger kick-btn" data-id="${p.id}" style="padding:2px 8px;font-size:10px">KICK</button>` : ''}
      </div>
    `;
    lobbyPlayersEl.appendChild(div);
  });

  document.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('kick_player', { targetId: btn.dataset.id });
    });
  });

  const myPlayer = state.players.find(p => p.id === myId);
  const isHost = myPlayer && myPlayer.isHost;

  btnReady.classList.toggle('hidden', isHost);
  btnStartGame.classList.toggle('hidden', !isHost);
  btnStartGame.disabled = !state.players.every(p => p.isReady || p.isHost);
  btnReady.textContent = isReady ? 'UNREADY' : 'READY';
}

socket.on('lobby_update', renderLobby);

btnReady.addEventListener('click', () => {
  isReady = !isReady;
  socket.emit('toggle_ready');
});

btnStartGame.addEventListener('click', () => {
  socket.emit('start_game');
});

btnLeaveLobby.addEventListener('click', () => {
  currentRoom = null;
  clearStoredRoom();
  window.location.reload();
});

btnCopyCode.addEventListener('click', () => {
  if (currentRoom) {
    navigator.clipboard.writeText(currentRoom).then(() => {
      showToast('Room code copied!', 'success');
    }).catch(() => {});
  }
});