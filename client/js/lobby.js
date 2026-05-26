const roomCodeEl = document.getElementById('room-code');
const lobbyPlayersEl = document.getElementById('lobby-players');
const btnReady = document.getElementById('btn-ready');
const btnStartGame = document.getElementById('btn-start-game');
const btnLeaveLobby = document.getElementById('btn-leave-lobby');
const btnCopyCode = document.getElementById('btn-copy-code');
const btnAddBot = document.getElementById('btn-add-bot');
const deckSelect = document.getElementById('deck-select');

let isReady = false;
let botConfigPopup = null;

function renderLobby(state) {
  roomCodeEl.textContent = state.code;

  var existingBanner = document.getElementById('game-in-progress-banner');
  if (existingBanner) existingBanner.remove();
  if (state.gameInProgress) {
    var banner = document.createElement('div');
    banner.id = 'game-in-progress-banner';
    banner.style.cssText = 'text-align:center;padding:10px;margin-bottom:12px;background:var(--accent-purple);color:#fff;border-radius:6px;font-weight:700;font-size:14px';
    banner.textContent = '⚡ GAME IN PROGRESS — joining mid-game';
    document.querySelector('.lobby-container').insertBefore(banner, lobbyPlayersEl);
  }

  lobbyPlayersEl.innerHTML = '';
  state.players.forEach(p => {
    const div = document.createElement('div');
    div.className = 'lobby-player';
    div.style.position = 'relative';
    const isMe = p.id === myId;
    const isBot = p.isBot;
    div.innerHTML = `
      <span class="player-name">${p.nickname} ${isMe ? '(You)' : ''} ${isBot ? '🤖' : ''}</span>
      <div style="display:flex;gap:6px;align-items:center">
        ${isBot ? `<span class="player-tag tag-bot">BOT ${p.botLevel || 'good'}</span>` : ''}
        ${p.isHost ? '<span class="player-tag tag-host">HOST</span>' : ''}
        ${!p.isHost && !isBot ? `<span class="player-tag ${p.isReady ? 'tag-ready' : 'tag-not-ready'}">${p.isReady ? 'READY' : 'NOT READY'}</span>` : ''}
        ${state.hostId === myId && !p.isHost && !isBot ? `<button class="btn btn-small btn-danger kick-btn" data-id="${p.id}" style="padding:2px 8px;font-size:10px">KICK</button>` : ''}
        ${state.hostId === myId && isBot ? `<button class="bot-config-btn" data-bot-id="${p.id}">&#183;&#183;&#183;</button>` : ''}
      </div>
    `;
    lobbyPlayersEl.appendChild(div);
  });

  document.querySelectorAll('.kick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('kick_player', { targetId: btn.dataset.id });
    });
  });

  document.querySelectorAll('.bot-config-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showBotConfig(btn.dataset.botId, btn);
    });
  });

  const myPlayer = state.players.find(p => p.id === myId);
  const isHost = myPlayer && myPlayer.isHost;

  btnReady.classList.toggle('hidden', isHost);
  btnStartGame.classList.toggle('hidden', !isHost);
  btnAddBot.classList.toggle('hidden', !isHost);
  deckSelect.classList.toggle('hidden', !isHost);
  btnStartGame.disabled = !state.players.every(p => p.isReady || p.isHost);
  btnReady.textContent = isReady ? 'UNREADY' : 'READY';
}

function showBotConfig(botId, anchor) {
  if (botConfigPopup) { botConfigPopup.remove(); botConfigPopup = null; return; }
  const popup = document.createElement('div');
  popup.className = 'bot-config-popup';
  const levels = ['bad', 'medium', 'good', 'pro', 'impossible'];
  levels.forEach(level => {
    const btn = document.createElement('button');
    btn.textContent = level.charAt(0).toUpperCase() + level.slice(1);
    const p = window.currentLobbyState ? window.currentLobbyState.players.find(pl => pl.id === botId) : null;
    if (p && p.botLevel === level) btn.className = 'active';
    btn.addEventListener('click', () => {
      socket.emit('set_bot_level', { botId, level });
      popup.remove();
      botConfigPopup = null;
    });
    popup.appendChild(btn);
  });
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-bot-btn';
  removeBtn.textContent = 'Remove bot';
  removeBtn.addEventListener('click', () => {
    socket.emit('remove_bot', { botId });
    popup.remove();
    botConfigPopup = null;
  });
  popup.appendChild(removeBtn);
  anchor.parentElement.appendChild(popup);
  botConfigPopup = popup;

  const closePopup = (ev) => {
    if (!popup.contains(ev.target) && ev.target !== anchor) {
      popup.remove();
      botConfigPopup = null;
      document.removeEventListener('click', closePopup);
    }
  };
  setTimeout(() => document.addEventListener('click', closePopup), 10);
}

socket.on('lobby_update', (state) => {
  window.currentLobbyState = state;
  renderLobby(state);
});

btnAddBot.addEventListener('click', () => {
  socket.emit('add_bot', { level: 'good' });
});

btnReady.addEventListener('click', () => {
  isReady = !isReady;
  socket.emit('toggle_ready');
});

btnStartGame.addEventListener('click', () => {
  var selected = document.querySelector('input[name="deckCount"]:checked');
  var deckCount = selected ? parseInt(selected.value) : 2;
  socket.emit('start_game', { deckCount: deckCount });
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
