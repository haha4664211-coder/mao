function getCardImage(card) {
  if (!card) return '';
  if (card.rank === 'joker') return '/cards/' + card.color + '_joker.png';
  return '/cards/' + card.rank + '_of_' + card.suit + '.png';
}

function getCardDisplayName(card) {
  if (!card) return '';
  if (card.rank === 'joker') return card.color.toUpperCase() + ' JOKER';
  return card.rank.toUpperCase() + ' ' + card.suit.toUpperCase();
}

let gameState = null;
let selectedCardIndex = -1;
let myHand = [];

let lastPlayedTime = 0;
const CARD_COOLDOWN_MS = 3000;

const gameRoomCode = document.getElementById('game-room-code');
const otherPlayersEl = document.getElementById('other-players');
const playerHandEl = document.getElementById('player-hand');
const discardPileEl = document.getElementById('discard-pile');
const drawPile = document.getElementById('draw-pile');
const deckCountEl = document.getElementById('deck-count');
const btnDraw = document.getElementById('btn-draw');
const btnEndTurn = document.getElementById('btn-end-turn');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnLeaveGame = document.getElementById('btn-leave-game');
const logEntries = document.getElementById('log-entries');
const chatInput = document.getElementById('chat-input');
const btnChatSend = document.getElementById('btn-chat-send');

const punishmentOverlay = document.getElementById('punishment-overlay');
const punishmentTitle = document.getElementById('punishment-title');
const punishmentBody = document.getElementById('punishment-body');
const punishmentActions = document.getElementById('punishment-actions');

class SoundManager {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  play(type) {
    try {
      this.init();
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      var t = this.ctx.currentTime;
      switch (type) {
        case 'cardPlay':
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
          osc.start(t); osc.stop(t + 0.1);
          break;
        case 'cardDraw':
          osc.frequency.setValueAtTime(300, t);
          osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
          gain.gain.setValueAtTime(0.12, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
          osc.start(t); osc.stop(t + 0.15);
          break;
        case 'turn':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, t);
          gain.gain.setValueAtTime(0.1, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
          osc.start(t); osc.stop(t + 0.2);
          break;
        case 'punish':
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.setValueAtTime(660, t + 0.15);
          osc.frequency.setValueAtTime(880, t + 0.3);
          gain.gain.setValueAtTime(0.15, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
          osc.start(t); osc.stop(t + 0.5);
          break;
        case 'click':
          osc.frequency.setValueAtTime(1000, t);
          gain.gain.setValueAtTime(0.08, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
          osc.start(t); osc.stop(t + 0.05);
          break;
      }
    } catch (e) {}
  }
}

var sound = new SoundManager();

socket.on('game_started', function(state) {
  showScreen('game');
  gameRoomCode.textContent = currentRoom;
  gameState = state;
  renderGame();
  sound.play('click');
});

socket.on('game_state', function(state) {
  gameState = state;
  if (state.yourHand) {
    myHand = state.yourHand;
  }
  renderGame();
});

socket.on('card_played', function(data) {
  sound.play('cardPlay');
  animateCardPlay(data.card, data.playerId);
});

socket.on('card_drawn', function(data) {
  sound.play('cardDraw');
});

socket.on('punishment_request', function(data) {
  sound.play('punish');
  showPunishmentVote(data);
});

socket.on('punishment_vote', function(data) {
  updatePunishmentVote(data);
});

socket.on('punishment_result', function(data) {
  closePunishmentOverlay();
  var nick = gameState ? gameState.players.find(function(p) { return p.id === data.targetId; }) : null;
  var name = nick ? nick.nickname : 'Player';
  if (data.approved) {
    showToast(name + ' was punished! +' + data.amount + ' cards', 'error');
  } else {
    showToast(name + ' falsely accused! +' + data.amount + ' cards', 'info');
  }
});

socket.on('player_punished', function(data) {
  sound.play('punish');
  if (gameState) {
    var victim = gameState.players.find(function(p) { return p.id === data.targetId; });
    var punisher = gameState.players.find(function(p) { return p.id === data.punisherId; });
    var vName = victim ? victim.nickname : 'Player';
    var pName = punisher ? punisher.nickname : 'Player';
    showToast(pName + ' punished ' + vName + '! They drew a card', 'error');

    // If I was punished, show punish-back button
    if (data.targetId === myId) {
      showPunishBackButton(data.punisherId);
    }
  }
});

socket.on('punish_back_result', function(data) {
  if (gameState) {
    var victim = gameState.players.find(function(p) { return p.id === data.victimId; });
    var punisher = gameState.players.find(function(p) { return p.id === data.punisherId; });
    var vName = victim ? victim.nickname : 'Player';
    var pName = punisher ? punisher.nickname : 'Player';
    showToast(vName + ' punished back ' + pName + '! Card returned!', 'success');
    hidePunishBackButton();
  }
});

socket.on('player_disconnected', function(data) {
  var nick = gameState ? gameState.players.find(function(p) { return p.id === data.playerId; }) : null;
  showToast((nick ? nick.nickname : 'A player') + ' disconnected', 'info');
});

socket.on('host_migration', function(data) {
  showToast('Host has migrated to another player', 'info');
});

socket.on('lobby_closed', function() {
  showToast('Lobby closed', 'error');
  clearStoredRoom();
  showScreen('menu');
  currentRoom = null;
});

socket.on('player_kicked', function(data) {
  if (data.playerId !== myId) {
    var nick = gameState ? gameState.players.find(function(p) { return p.id === data.playerId; }) : null;
    showToast((nick ? nick.nickname : 'A player') + ' was kicked', 'info');
  }
});

socket.on('round_won', function(data) {
  sound.play('punish');
  showRuleForm(data);
});

socket.on('rule_under_review', function() {
  showToast('Checking rule with AI...', 'info');
});

socket.on('rule_evaluated', function(result) {
  var description = '';
  var descEl = document.getElementById('rule-description');
  if (descEl) description = descEl.value;

  if (result.valid) {
    punishmentBody.innerHTML =
      '<div class="punish-info">' +
      '<p style="color:var(--accent-green);font-size:18px;font-weight:700">RULE ACCEPTED!</p>' +
      '<p class="punish-reason">"' + description + '"</p>' +
      '<p><span class="punish-highlight">Summary:</span> ' + result.summary + '</p>' +
      '<p><span class="punish-highlight">Interpretation:</span> ' + result.interpretation + '</p>' +
      '</div>';
    punishmentActions.innerHTML =
      '<button class="btn btn-primary" id="btn-confirm-rule">CONFIRM RULE</button>';
    document.getElementById('btn-confirm-rule').addEventListener('click', function() {
      socket.emit('confirm_rule', {
        rule: {
          description: description,
          summary: result.summary,
          interpretation: result.interpretation,
          createdBy: myNickname,
          round: gameState ? gameState.round : 0
        }
      });
    });
  } else {
    var errorMsg = result.error || 'sorry i don\'t understand that';
    punishmentBody.innerHTML =
      '<div class="punish-info">' +
      '<p style="color:var(--accent-red);font-size:16px;font-weight:700">RULE REJECTED</p>' +
      '<p class="punish-reason">"' + description + '"</p>' +
      '<p style="color:var(--text-secondary)">' + errorMsg + '</p>' +
      '<p style="margin-top:12px">Try describing your rule differently.</p>' +
      '</div>';
    punishmentActions.innerHTML =
      '<button class="btn btn-primary" id="btn-try-again">TRY AGAIN</button>' +
      '<button class="btn btn-danger" id="btn-skip-rule">SKIP</button>';
    document.getElementById('btn-try-again').addEventListener('click', function() {
      if (gameState) {
        showRuleForm({ winnerId: myId, winnerNickname: myNickname, round: gameState.round, rules: gameState.rules || [] });
      }
    });
    document.getElementById('btn-skip-rule').addEventListener('click', function() {
      socket.emit('confirm_rule', {
        rule: {
          description: 'No rule added',
          summary: 'Skipped',
          interpretation: 'Winner chose not to add a rule this round.',
          createdBy: myNickname,
          round: gameState ? gameState.round : 0
        }
      });
    });
  }
});

socket.on('rule_created', function(data) {
  closePunishmentOverlay();
  showToast('New rule added!', 'success');
  showRuleApproved(data);
});

socket.on('new_round', function(data) {
  showToast('Round ' + data.round + ' started!', 'success');
});

function renderGame() {
  if (!gameState) return;
  deckCountEl.textContent = gameState.deckSize;
  renderOtherPlayers();
  renderHand();
  renderDiscardPile();
  updateActionButtons();
}

function animateCardPlay(card, playerId) {
  if (!card) return;

  var gameTable = document.querySelector('.game-table');
  var tableRect = gameTable.getBoundingClientRect();
  var discardRect = discardPileEl.getBoundingClientRect();

  var startX = discardRect.left - tableRect.left + (discardRect.width / 2);
  var startY = discardRect.top - tableRect.top;

  var animEl = document.createElement('div');
  animEl.className = 'card-play-animation';

  var imgSrc = getCardImage(card);
  var displayName = getCardDisplayName(card);

  var playerNick = '';
  if (gameState) {
    var p = gameState.players.find(function(p) { return p.id === playerId; });
    if (p) playerNick = p.nickname;
  }

  animEl.innerHTML =
    '<div class="card-play-inner">' +
    '<div class="card-play-label">' + playerNick + ' played</div>' +
    '<img src="' + imgSrc + '" alt="' + displayName + '">' +
    '</div>';

  animEl.style.left = (startX - 50) + 'px';
  animEl.style.top = (startY - 70) + 'px';

  gameTable.appendChild(animEl);

  setTimeout(function() {
    if (animEl.parentNode) animEl.parentNode.removeChild(animEl);
  }, 3000);
}

// Cooldown timer: update UI every second
var cooldownInterval = setInterval(function() {
  if (gameState && !canAct()) updateCooldownUI();
}, 1000);

// Punish button click delegation on other-players container
otherPlayersEl.addEventListener('click', function(e) {
  var btn = e.target.closest('.btn-punish');
  if (btn) {
    var targetId = btn.getAttribute('data-target');
    sound.play('click');
    socket.emit('punish_player', { targetId: targetId });
  }
});

function showPunishBackButton(punisherId) {
  var existing = document.getElementById('punish-back-bar');
  if (existing) existing.remove();

  var bar = document.createElement('div');
  bar.id = 'punish-back-bar';
  bar.className = 'punish-back-bar';
  bar.setAttribute('data-punisher', punisherId);
  bar.innerHTML =
    '<span>You were punished! Get revenge?</span>' +
    '<button class="btn btn-danger btn-small" id="btn-punish-back">PUNISH BACK!</button>';
  document.querySelector('.game-bottom-bar').appendChild(bar);

  document.getElementById('btn-punish-back').addEventListener('click', function() {
    socket.emit('punish_back');
    sound.play('punish');
    hidePunishBackButton();
  });
}

function hidePunishBackButton() {
  var bar = document.getElementById('punish-back-bar');
  if (bar) bar.remove();
}

// Re-render players on window resize for circle layout
window.addEventListener('resize', function() {
  if (gameState) renderOtherPlayers();
});

function renderOtherPlayers() {
  var container = otherPlayersEl;
  container.innerHTML = '';

  var players = gameState.players;
  var count = players.length;
  if (count === 0) return;

  var myIdx = players.findIndex(function(p) { return p.id === myId; });
  if (myIdx === -1) myIdx = 0;

  var tableEl = container.parentElement;
  var rect = tableEl.getBoundingClientRect();
  var cx = rect.width / 2;
  var cy = rect.height / 2;
  var radius = Math.min(rect.width * 0.35, rect.height * 0.32, 280);

  players.forEach(function(p, i) {
    var angle = ((i - myIdx) / count) * 2 * Math.PI + Math.PI / 2;
    var x = cx + radius * Math.cos(angle);
    var y = cy + radius * Math.sin(angle);

    var div = document.createElement('div');
    div.className = 'other-player';
    if (!p.isConnected) div.classList.add('disconnected');
    if (p.id === myId) div.classList.add('is-me');

    div.style.left = x + 'px';
    div.style.top = y + 'px';

    var punishBtnHtml = '<button class="btn-punish" data-target="' + p.id + '">PUNISH</button>';
    if (p.id === myId) {
      div.innerHTML =
        '<div class="opl-avatar">' + p.nickname.charAt(0).toUpperCase() + '</div>' +
        '<div class="opl-name">' + p.nickname + ' (You)</div>' +
        '<div class="opl-cards">' + (myHand ? myHand.length : p.handSize) + ' cards</div>' +
        punishBtnHtml;
    } else {
      div.innerHTML =
        '<div class="opl-avatar">' + p.nickname.charAt(0).toUpperCase() + '</div>' +
        '<div class="opl-name">' + p.nickname + '</div>' +
        '<div class="opl-cards">' + p.handSize + ' cards</div>' +
        punishBtnHtml;
    }

    container.appendChild(div);
  });
}

function renderHand() {
  playerHandEl.innerHTML = '';
  if (!myHand) return;
  myHand.forEach(function(card, i) {
    var div = document.createElement('div');
    div.className = 'table-card' + (i === selectedCardIndex ? ' selected' : '');
    div.innerHTML = '<img src="' + getCardImage(card) + '" alt="' + getCardDisplayName(card) + '" draggable="false">';
    div.addEventListener('click', function() {
      sound.play('click');
      if (selectedCardIndex === i) {
        playCard(i);
      } else {
        selectedCardIndex = i;
        renderHand();
      }
    });
    playerHandEl.appendChild(div);
  });
}

function renderDiscardPile() {
  discardPileEl.innerHTML = '';
  var topCard = null;
  if (gameState.discardPile && gameState.discardPile.length > 0) {
    topCard = gameState.discardPile[gameState.discardPile.length - 1];
  } else if (gameState.discardTop) {
    topCard = gameState.discardTop;
  }
  if (topCard) {
    var div = document.createElement('div');
    div.className = 'table-card';
    div.style.cursor = 'default';
    div.innerHTML = '<img src="' + getCardImage(topCard) + '" alt="' + getCardDisplayName(topCard) + '" draggable="false">';
    discardPileEl.appendChild(div);
  } else {
    discardPileEl.innerHTML = '<div class="discard-placeholder">PILE</div>';
  }
}

function updateActionButtons() {
  updateCooldownUI();
  btnEndTurn.disabled = false;
}

function playCard(index) {
  var now = Date.now();
  if (now - lastPlayedTime < CARD_COOLDOWN_MS) {
    showToast('Wait ' + Math.ceil((CARD_COOLDOWN_MS - (now - lastPlayedTime)) / 1000) + 's before playing again', 'info');
    return;
  }
  socket.emit('play_card', { cardIndex: index });
  selectedCardIndex = -1;
  lastPlayedTime = now;
  updateCooldownUI();
}

function canAct() {
  return Date.now() - lastPlayedTime >= CARD_COOLDOWN_MS;
}

function updateCooldownUI() {
  if (!canAct()) {
    btnDraw.disabled = true;
    btnDraw.textContent = 'WAIT...';
    if (drawPile) drawPile.style.opacity = '0.5';
    if (drawPile) drawPile.style.pointerEvents = 'none';
  } else {
    btnDraw.disabled = false;
    btnDraw.textContent = 'DRAW';
    if (drawPile) drawPile.style.opacity = '1';
    if (drawPile) drawPile.style.pointerEvents = 'auto';
  }
}

btnDraw.addEventListener('click', function() {
  if (!canAct()) {
    showToast('Wait for cooldown before drawing', 'info');
    return;
  }
  socket.emit('draw_card');
  sound.play('click');
});

btnEndTurn.addEventListener('click', function() {
  socket.emit('end_turn');
  selectedCardIndex = -1;
  sound.play('click');
  lastPlayedTime = 0;
  updateCooldownUI();
});

drawPile.addEventListener('click', function() {
  if (!canAct()) {
    showToast('Wait for cooldown before drawing', 'info');
    return;
  }
  socket.emit('draw_card');
  sound.play('click');
});

btnFullscreen.addEventListener('click', function() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(function(){});
  } else {
    document.exitFullscreen().catch(function(){});
  }
});

btnLeaveGame.addEventListener('click', function() {
  if (confirm('Leave the game?')) {
    clearInterval(cooldownInterval);
    currentRoom = null;
    clearStoredRoom();
    myHand = [];
    gameState = null;
    window.location.reload();
  }
});

chatInput.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') sendChat();
});

btnChatSend.addEventListener('click', sendChat);

function sendChat() {
  var msg = chatInput.value.trim();
  if (!msg) return;
  socket.emit('send_chat', { message: msg });
  chatInput.value = '';
}

function addLogEntry(data) {
  var entry = document.createElement('div');
  entry.className = 'log-entry';
  entry.innerHTML = '<span class="log-nick">' + data.nickname + ':</span> ' + data.message;
  logEntries.appendChild(entry);
  logEntries.scrollTop = logEntries.scrollHeight;
}

function showPunishmentVote(data) {
  punishmentTitle.textContent = 'PUNISHMENT VOTE';
  punishmentBody.innerHTML =
    '<div class="punish-info">' +
    '<p><span class="punish-highlight">' + data.accuserNickname + '</span> accuses <span class="punish-highlight">' + data.targetNickname + '</span></p>' +
    '<p class="punish-reason">"' + data.reason + '"</p>' +
    '<p>Penalty: <strong>+' + data.amount + '</strong> cards</p>' +
    '<p id="vote-status">Waiting for votes...</p>' +
    '</div>';

  if (data.accuserId !== myId && data.targetId !== myId) {
    punishmentActions.innerHTML =
      '<div class="vote-buttons">' +
      '<button class="btn btn-primary" id="btn-vote-yes">GUILTY</button>' +
      '<button class="btn btn-danger" id="btn-vote-no">INNOCENT</button>' +
      '</div>';
    document.getElementById('btn-vote-yes').addEventListener('click', function() {
      socket.emit('vote_punishment', { punishmentId: data.id, approve: true });
      document.getElementById('vote-status').textContent = 'Vote submitted (GUILTY)';
      document.querySelectorAll('.vote-buttons .btn').forEach(function(b) { b.disabled = true; });
      sound.play('click');
    });
    document.getElementById('btn-vote-no').addEventListener('click', function() {
      socket.emit('vote_punishment', { punishmentId: data.id, approve: false });
      document.getElementById('vote-status').textContent = 'Vote submitted (INNOCENT)';
      document.querySelectorAll('.vote-buttons .btn').forEach(function(b) { b.disabled = true; });
      sound.play('click');
    });
  } else {
    punishmentActions.innerHTML = '<p style="color:var(--text-secondary);text-align:center">You cannot vote in your own case</p>';
  }
  punishmentOverlay.classList.remove('hidden');
}

function updatePunishmentVote(data) {
  var el = document.getElementById('vote-status');
  if (el) {
    el.textContent = 'Votes: ' + data.votesFor + ' guilty - ' + data.votesAgainst + ' innocent (' + data.totalVotes + '/' + data.eligibleCount + ')';
  }
}

function closePunishmentOverlay() {
  punishmentOverlay.classList.add('hidden');
}

function showRuleForm(data) {
  var isWinner = data.winnerId === myId;
  punishmentTitle.textContent = 'ROUND ' + data.round + ' - ' + data.winnerNickname + ' WINS!';

  if (isWinner) {
    punishmentBody.innerHTML =
      '<div class="punish-info">' +
      '<p>Congratulations! You won round ' + data.round + '.</p>' +
      '<p>Create a new hidden rule that everyone must follow.</p>' +
      '<textarea id="rule-description" class="punish-input" style="height:80px;resize:none" placeholder="Describe your rule... e.g. Only play spades"></textarea>' +
      '<p style="font-size:12px;color:var(--text-secondary)">The AI will check if your rule makes sense.</p>' +
      '</div>';
    punishmentActions.innerHTML =
      '<button class="btn btn-primary" id="btn-submit-rule">CREATE RULE</button>';
    punishmentOverlay.classList.remove('hidden');

    document.getElementById('btn-submit-rule').addEventListener('click', function() {
      var desc = document.getElementById('rule-description').value.trim();
      if (!desc) { showToast('Enter a rule description', 'error'); return; }
      socket.emit('submit_rule', { description: desc });
      document.getElementById('btn-submit-rule').disabled = true;
      document.getElementById('btn-submit-rule').textContent = 'CHECKING...';
    });
  } else {
    punishmentBody.innerHTML =
      '<div class="punish-info">' +
      '<p><span class="punish-highlight">' + data.winnerNickname + '</span> won round ' + data.round + '!</p>' +
      '<p>They are creating a new hidden rule...</p>' +
      '<p style="font-size:12px;color:var(--text-secondary)">Current rules: ' + data.rules.length + '</p>' +
      '</div>';
    punishmentActions.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">Waiting for winner to create a rule</p>';
    punishmentOverlay.classList.remove('hidden');
  }
}

function showRuleApproved(data) {
  punishmentBody.innerHTML =
    '<div class="punish-info">' +
    '<p style="color:var(--accent-green);font-size:18px;font-weight:700">NEW RULE IN PLAY!</p>' +
    '<p class="punish-reason">"' + data.rule.description + '"</p>' +
    '<p><span class="punish-highlight">' + data.rule.summary + '</span></p>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px">Total rules: ' + data.rules.length + '</p>' +
    '</div>';
  punishmentActions.innerHTML =
    '<button class="btn btn-primary" id="btn-next-round">NEXT ROUND</button>';
  punishmentOverlay.classList.remove('hidden');

  document.getElementById('btn-next-round').addEventListener('click', function() {
    closePunishmentOverlay();
    socket.emit('start_new_round');
  });
}
