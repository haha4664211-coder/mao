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

socket.on('rule_created_notification', function(data) {
  closePunishmentOverlay();
  closeRuleCreator();
  if (data.creatorId !== myId) {
    showToast('A new hidden rule was added!', 'success');
  }
});

socket.on('rule_created_detail', function(data) {
  closePunishmentOverlay();
  closeRuleCreator();
  showBlockRuleApproved(data.rule, data.round);
});

// ========== RULE BLOCK CREATOR ==========

var RC_TRIGGER_DEFS = [
  { type: 'after_card_played', name: 'A card is played', desc: 'a card is played', params: [] },
  { type: 'before_turn', name: 'A turn starts', desc: 'a turn begins', params: [] },
  { type: 'after_drawing', name: 'A card is drawn', desc: 'a card is drawn', params: [] },
  { type: 'after_punishment', name: 'A player is punished', desc: 'a player is punished', params: [] },
  { type: 'after_specific_rank', name: 'A specific rank is played', desc: 'a {rank} is played', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'after_specific_suit', name: 'A specific suit is played', desc: 'a {suit} is played', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'after_red_black', name: 'A red or black card is played', desc: 'a {color} card is played', params: [
    { name: 'color', label: 'Color', type: 'select', options: ['red', 'black'] }
  ]},
  { type: 'after_card_combo', name: 'A combo is formed', desc: 'a {combo} combo is formed', params: [
    { name: 'combo', label: 'Combo type', type: 'select', options: ['pair', 'run', 'flush', 'same suit'] }
  ]},
  { type: 'after_speaking', name: 'Someone talks', desc: 'someone speaks', params: [] },
  { type: 'after_saying_word', name: 'Someone says a specific word', desc: 'someone says "{word}"', params: [
    { name: 'word', label: 'Word or phrase', type: 'string' }
  ]},
];

var RC_CONDITION_DEFS = [
  { type: 'specific_suit', name: 'Card suit is...', desc: 'card suit is {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'specific_rank', name: 'Card rank is...', desc: 'card rank is {rank}', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'red_black', name: 'Card is red or black', desc: 'card color is {color}', params: [
    { name: 'color', label: 'Color', type: 'select', options: ['red', 'black'] }
  ]},
  { type: 'even_odd', name: 'Card rank is even/odd', desc: 'card rank is {parity}', params: [
    { name: 'parity', label: 'Parity', type: 'select', options: ['even', 'odd'] }
  ]},
  { type: 'consecutive_cards', name: 'Consecutive cards', desc: 'at least {count} cards in a row', params: [
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 10 }
  ]},
  { type: 'repeated_actions', name: 'Same action repeated', desc: 'same action repeated {count}x', params: [
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 10 }
  ]},
  { type: 'player_count', name: 'Number of players', desc: 'there are {operator} {count} players', params: [
    { name: 'operator', label: 'Comparison', type: 'select', options: ['exactly', 'at least', 'at most'] },
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 8 }
  ]},
  { type: 'current_direction', name: 'Turn direction is...', desc: 'direction is {direction}', params: [
    { name: 'direction', label: 'Direction', type: 'select', options: ['clockwise', 'counter-clockwise'] }
  ]},
  { type: 'card_amount_in_hand', name: 'Cards in hand', desc: 'player has {operator} {count} cards', params: [
    { name: 'operator', label: 'Comparison', type: 'select', options: ['exactly', 'at least', 'at most', 'less than', 'more than'] },
    { name: 'count', label: 'Count', type: 'number', min: 0, max: 52 }
  ]},
];

var RC_ACTION_DEFS = [
  { type: 'force_draw_cards', name: 'Force draw cards', desc: 'force draw {count} cards', params: [
    { name: 'count', label: 'Cards to draw', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'skip_turn', name: 'Skip their turn', desc: 'skip next turn', params: [] },
  { type: 'reverse_direction', name: 'Reverse turn order', desc: 'reverse turn order', params: [] },
  { type: 'must_say_phrase', name: 'Make them say...', desc: 'must say "{phrase}"', params: [
    { name: 'phrase', label: 'Required phrase', type: 'string' }
  ]},
  { type: 'cannot_say_phrase', name: 'Forbid a word', desc: 'cannot say "{phrase}"', params: [
    { name: 'phrase', label: 'Forbidden phrase', type: 'string' }
  ]},
  { type: 'punish_player', name: 'Give penalty cards', desc: 'punish (+{count} cards)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'punish_everyone', name: 'Punish everyone', desc: 'punish everyone (+{count} cards)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'reveal_card', name: 'Reveal their card', desc: 'reveal a card from hand', params: [] },
  { type: 'mute_player', name: 'Mute for some turns', desc: 'mute for {turns} turn(s)', params: [
    { name: 'turns', label: 'Number of turns', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'change_active_suit', name: 'Change suit to...', desc: 'change suit to {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'must_play_rank', name: 'Must play a specific rank', desc: 'must play a {rank}', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'must_play_suit', name: 'Must play a specific suit', desc: 'must play a {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'cannot_play_rank', name: 'Cannot play a specific rank', desc: 'cannot play a {rank}', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'cannot_play_suit', name: 'Cannot play a specific suit', desc: 'cannot play a {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'play_again', name: 'Take another turn', desc: 'take another turn', params: [] },
];

var SUIT_OPTIONS = ['any', 'spades', 'clubs', 'diamonds', 'hearts', 'red suits', 'black suits'];
var RANK_OPTIONS = ['any', 'ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'];

var TARGET_LABELS = { next: 'the next player', prev: 'the previous player', that: 'that player', all: 'everyone' };
var TIMING_LABELS = { now: 'immediately', next_round: 'next round' };

var SIMPLE_ACTIONS = {
  skip_player: { name: 'Skip', desc: 'skip {target} {timing}', targets: ['next', 'prev', 'that'], timing: true, mapType: 'skip_turn' },
  reverse: { name: 'Reverse direction', desc: 'reverse direction {timing}', targets: [], timing: true, mapType: 'reverse_direction' },
  double_turn: { name: 'Double turn', desc: '{target} takes double turn {timing}', targets: ['that', 'next'], timing: true, mapType: 'play_again' },
  change_suit: { name: 'Change suit to...', desc: '{target} must change suit to {suit} {timing}', targets: ['that', 'next'], timing: true, mapType: 'change_active_suit', params: [{ name: 'suit', label: 'Suit', type: 'select', options: ['clubs','diamonds','hearts','spades'] }] },
  must_say: { name: 'Must say...', desc: '{target} must say "{phrase}"', targets: ['that', 'next', 'prev', 'all'], timing: false, mapType: 'must_say_phrase', params: [{ name: 'phrase', label: 'Phrase', type: 'string' }] }
};

var SIMPLE_ACTION_KEYS = Object.keys(SIMPLE_ACTIONS);

var rcOverlay = document.getElementById('rule-creator-overlay');
var rcRuleName = document.getElementById('rc-rule-name');
var rcWhenSuit = document.getElementById('rc-when-suit');
var rcWhenRank = document.getElementById('rc-when-rank');
var rcWhenLabel = document.getElementById('rc-when-label');
var rcActionType = document.getElementById('rc-action-type');
var rcActionGear = document.getElementById('rc-action-gear');
var rcActionConfig = document.getElementById('rc-action-config');
var rcPreview = document.getElementById('rc-preview');
var rcBtnCreate = document.getElementById('rc-btn-create');
var rcBtnSkip = document.getElementById('rc-btn-skip');
var rcAdvToggle = document.getElementById('rc-adv-toggle');
var rcAdvPanel = document.getElementById('rc-adv-panel');
var rcAdvTriggerType = document.getElementById('rc-adv-trigger-type');
var rcAdvConditionsList = document.getElementById('rc-adv-conditions-list');
var rcAdvAddCondition = document.getElementById('rc-adv-add-condition');

var rcState = null;

function populateSelect(sel, options, selected) {
  sel.innerHTML = '';
  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement('option');
    var val = typeof options[i] === 'string' ? options[i] : options[i].value;
    var label = typeof options[i] === 'string' ? options[i].charAt(0).toUpperCase() + options[i].slice(1) : options[i].label;
    opt.value = val;
    opt.textContent = label;
    if (val === selected) opt.selected = true;
    sel.appendChild(opt);
  }
}

function renderActionConfig() {
  rcActionConfig.innerHTML = '';
  var cfg = SIMPLE_ACTIONS[rcState.actionKey];
  if (!cfg) return;

  var hasParams = cfg.params && cfg.params.length > 0;
  var hasAdv = (cfg.targets && cfg.targets.length > 0) || cfg.timing;

  if (cfg.params) {
    for (var k = 0; k < cfg.params.length; k++) {
      var p = cfg.params[k];
      var paramRow = document.createElement('div');
      paramRow.className = 'rc-config-row';
      var pLabel = document.createElement('span');
      pLabel.className = 'rc-config-label';
      pLabel.textContent = p.label;
      paramRow.appendChild(pLabel);
      if (p.type === 'select') {
        var pSel = document.createElement('select');
        pSel.className = 'rc-select rc-config-select';
        for (var m = 0; m < p.options.length; m++) {
          var opt3 = document.createElement('option');
          opt3.value = p.options[m];
          opt3.textContent = p.options[m].charAt(0).toUpperCase() + p.options[m].slice(1);
          if (p.options[m] === rcState.actionParams[p.name]) opt3.selected = true;
          pSel.appendChild(opt3);
        }
        pSel.addEventListener('change', function(paramName, s) {
          return function() { rcState.actionParams[paramName] = s.value; updateRulePreview(); };
        }(p.name, pSel));
        paramRow.appendChild(pSel);
      } else if (p.type === 'string') {
        var pInp = document.createElement('input');
        pInp.type = 'text';
        pInp.className = 'rc-input rc-config-input';
        pInp.placeholder = p.label;
        pInp.value = rcState.actionParams[p.name] || '';
        pInp.addEventListener('input', function(paramName, ipt) {
          return function() { rcState.actionParams[paramName] = ipt.value; updateRulePreview(); };
        }(p.name, pInp));
        paramRow.appendChild(pInp);
      }
      rcActionConfig.appendChild(paramRow);
    }
  }

  if (hasAdv) {
    var advDiv = document.createElement('div');
    advDiv.id = 'rc-action-adv';
    advDiv.className = 'rc-action-adv' + (rcState.showActionAdv ? '' : ' hidden');

    if (cfg.targets && cfg.targets.length > 0) {
      var targetRow = document.createElement('div');
      targetRow.className = 'rc-config-row';
      var tLabel = document.createElement('span');
      tLabel.className = 'rc-config-label';
      tLabel.textContent = 'Who';
      targetRow.appendChild(tLabel);
      var tSel = document.createElement('select');
      tSel.className = 'rc-select rc-config-select';
      for (var i = 0; i < cfg.targets.length; i++) {
        var opt = document.createElement('option');
        opt.value = cfg.targets[i];
        opt.textContent = TARGET_LABELS[cfg.targets[i]] || cfg.targets[i];
        if (cfg.targets[i] === rcState.target) opt.selected = true;
        tSel.appendChild(opt);
      }
      tSel.addEventListener('change', function() {
        rcState.target = tSel.value;
        updateRulePreview();
      });
      targetRow.appendChild(tSel);
      advDiv.appendChild(targetRow);
    }

    if (cfg.timing) {
      var timeRow = document.createElement('div');
      timeRow.className = 'rc-config-row';
      var tiLabel = document.createElement('span');
      tiLabel.className = 'rc-config-label';
      tiLabel.textContent = 'When';
      timeRow.appendChild(tiLabel);
      var tiSel = document.createElement('select');
      tiSel.className = 'rc-select rc-config-select';
      var timeOpts = ['now', 'next_round'];
      for (var j = 0; j < timeOpts.length; j++) {
        var opt2 = document.createElement('option');
        opt2.value = timeOpts[j];
        opt2.textContent = TIMING_LABELS[timeOpts[j]] || timeOpts[j];
        if (timeOpts[j] === rcState.timing) opt2.selected = true;
        tiSel.appendChild(opt2);
      }
      tiSel.addEventListener('change', function() {
        rcState.timing = tiSel.value;
        updateRulePreview();
      });
      timeRow.appendChild(tiSel);
      advDiv.appendChild(timeRow);
    }

    rcActionConfig.appendChild(advDiv);
  }

  if (hasParams) {
    rcActionConfig.classList.remove('hidden');
  } else if (!rcState.showActionAdv) {
    rcActionConfig.classList.add('hidden');
  }
}

function getDesc(cfg) {
  var desc = cfg.desc;
  desc = desc.replace('{target}', TARGET_LABELS[rcState.target] || '');
  desc = desc.replace('{timing}', TIMING_LABELS[rcState.timing] || '');
  if (cfg.params) {
    for (var i = 0; i < cfg.params.length; i++) {
      var p = cfg.params[i];
      desc = desc.replace('{' + p.name + '}', rcState.actionParams[p.name] || '?');
    }
  }
  desc = desc.replace(/\s+/g, ' ').trim();
  return desc;
}

function updateRulePreview() {
  if (!rcState) return;
  var cardDesc = '';
  if (rcState.advOpen && (rcState.advTrigger.type !== 'after_card_played' || rcState.advConditions.length > 0)) {
    var tDef = getDef(RC_TRIGGER_DEFS, rcState.advTrigger.type);
    cardDesc = tDef ? fillDesc(tDef, rcState.advTrigger.params) : '?';
    if (rcState.advConditions.length > 0) {
      var condTexts = [];
      for (var i = 0; i < rcState.advConditions.length; i++) {
        var cDef = getDef(RC_CONDITION_DEFS, rcState.advConditions[i].type);
        if (cDef) condTexts.push(fillDesc(cDef, rcState.advConditions[i].params));
      }
      if (condTexts.length > 0) cardDesc += ' if ' + condTexts.join(' and ');
    }
  } else {
    var suitLabel = rcState.suit === 'any' ? '' : rcState.suit;
    var rankLabel = rcState.rank === 'any' ? '' : rcState.rank;
    cardDesc = suitLabel || rankLabel ? (suitLabel + ' ' + rankLabel).trim() : 'a card';
  }
  var cfg = SIMPLE_ACTIONS[rcState.actionKey];
  var actionDesc = cfg ? getDesc(cfg) : '?';
  rcPreview.textContent = 'When ' + cardDesc + ' is played, ' + actionDesc + ' (or draw 1 card)';
}

function buildRuleForSubmit() {
  var conditions = [];
  if (rcState.advOpen && (rcState.advTrigger.type !== 'after_card_played' || rcState.advConditions.length > 0)) {
    conditions = rcState.advConditions.slice();
  } else {
    if (rcState.suit !== 'any') {
      if (rcState.suit === 'red suits') {
        conditions.push({ type: 'red_black', params: { color: 'red' } });
      } else if (rcState.suit === 'black suits') {
        conditions.push({ type: 'red_black', params: { color: 'black' } });
      } else {
        conditions.push({ type: 'specific_suit', params: { suit: rcState.suit } });
      }
    }
    if (rcState.rank !== 'any') {
      conditions.push({ type: 'specific_rank', params: { rank: rcState.rank } });
    }
  }
  var triggerType = rcState.advOpen && rcState.advTrigger.type !== 'after_card_played' ? rcState.advTrigger.type : 'after_card_played';
  var triggerParams = rcState.advOpen && rcState.advTrigger.type !== 'after_card_played' ? rcState.advTrigger.params : {};
  var cfg = SIMPLE_ACTIONS[rcState.actionKey];
  var action = {
    type: cfg.mapType,
    params: {
      target: rcState.target,
      timing: rcState.timing,
      suit: rcState.actionParams.suit || null,
      phrase: rcState.actionParams.phrase || null
    }
  };
  return {
    name: rcRuleName.value.trim(),
    trigger: { type: triggerType, params: triggerParams },
    conditions: conditions,
    actions: [action]
  };
}

function getDefaultParams(def) {
  var p = {};
  if (!def || !def.params) return p;
  for (var i = 0; i < def.params.length; i++) {
    var paramDef = def.params[i];
    if (paramDef.default !== undefined) {
      p[paramDef.name] = paramDef.default;
    } else if (paramDef.type === 'select' && paramDef.options && paramDef.options.length > 0) {
      p[paramDef.name] = paramDef.options[0];
    } else if (paramDef.type === 'number') {
      p[paramDef.name] = paramDef.min || 1;
    } else if (paramDef.type === 'string') {
      p[paramDef.name] = '';
    }
  }
  return p;
}

function renderParams(container, def, values, onChange) {
  container.innerHTML = '';
  if (!def || !def.params || def.params.length === 0) return;
  for (var i = 0; i < def.params.length; i++) {
    var p = def.params[i];
    var val = values[p.name] !== undefined ? values[p.name] : '';
    var wrapper = document.createElement('div');
    wrapper.className = 'rc-param-wrapper';
    var label = document.createElement('span');
    label.className = 'rc-param-label';
    label.textContent = p.label;
    wrapper.appendChild(label);
    if (p.type === 'select') {
      var sel = document.createElement('select');
      sel.className = 'rc-select rc-param-select';
      for (var j = 0; j < p.options.length; j++) {
        var opt = document.createElement('option');
        opt.value = p.options[j];
        opt.textContent = p.options[j].charAt(0).toUpperCase() + p.options[j].slice(1);
        if (p.options[j] === val) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function(paramName, s) {
        return function() { values[paramName] = s.value; if (onChange) onChange(); };
      }(p.name, sel));
      wrapper.appendChild(sel);
    } else if (p.type === 'number') {
      var inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'rc-input rc-param-input';
      inp.min = p.min || 1;
      inp.max = p.max || 10;
      inp.value = val || p.min || 1;
      inp.addEventListener('input', function(paramName, ipt) {
        return function() { values[paramName] = parseInt(ipt.value) || (p.min || 1); if (onChange) onChange(); };
      }(p.name, inp));
      wrapper.appendChild(inp);
    } else if (p.type === 'string') {
      var inp2 = document.createElement('input');
      inp2.type = 'text';
      inp2.className = 'rc-input rc-param-input';
      inp2.placeholder = p.label;
      inp2.value = val || '';
      inp2.addEventListener('input', function(paramName, ipt) {
        return function() { values[paramName] = ipt.value; if (onChange) onChange(); };
      }(p.name, inp2));
      wrapper.appendChild(inp2);
    }
    container.appendChild(wrapper);
  }
}

function renderAdvConditionBlock(idx) {
  var cond = rcState.advConditions[idx];
  var def = getDef(RC_CONDITION_DEFS, cond.type);
  if (!def) return;
  var block = document.createElement('div');
  block.className = 'rc-condition-block';
  block.dataset.index = idx;
  var sel = document.createElement('select');
  sel.className = 'rc-select rc-condition-select';
  for (var i = 0; i < RC_CONDITION_DEFS.length; i++) {
    var opt = document.createElement('option');
    opt.value = RC_CONDITION_DEFS[i].type;
    opt.textContent = RC_CONDITION_DEFS[i].name;
    if (RC_CONDITION_DEFS[i].type === cond.type) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', function(index, select) {
    return function() {
      var newDef = getDef(RC_CONDITION_DEFS, select.value);
      if (newDef) {
        rcState.advConditions[index] = { type: select.value, params: getDefaultParams(newDef) };
        rebuildAdvConditions();
        updateRulePreview();
      }
    };
  }(idx, sel));
  block.appendChild(sel);
  renderParams(block, def, cond.params, updateRulePreview);
  var removeBtn = document.createElement('button');
  removeBtn.className = 'rc-remove-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', function(index) {
    return function() {
      rcState.advConditions.splice(index, 1);
      rebuildAdvConditions();
      updateRulePreview();
    };
  }(idx));
  block.appendChild(removeBtn);
  var existing = rcAdvConditionsList.children[idx];
  if (existing) {
    rcAdvConditionsList.replaceChild(block, existing);
  } else {
    rcAdvConditionsList.appendChild(block);
  }
}

function rebuildAdvConditions() {
  rcAdvConditionsList.innerHTML = '';
  if (!rcState.advOpen) return;
  for (var i = 0; i < rcState.advConditions.length; i++) {
    renderAdvConditionBlock(i);
  }
  rcAdvAddCondition.classList.toggle('hidden', rcState.advConditions.length >= 5);
}

function initRuleCreator() {
  populateSelect(rcWhenSuit, SUIT_OPTIONS, 'any');
  populateSelect(rcWhenRank, RANK_OPTIONS, 'any');
  populateSelect(rcActionType, SIMPLE_ACTION_KEYS.map(function(k) { return { value: k, label: SIMPLE_ACTIONS[k].name }; }), 'skip_player');
  populateSelect(rcAdvTriggerType, RC_TRIGGER_DEFS, 'after_card_played');

  rcWhenSuit.addEventListener('change', function() {
    rcState.suit = rcWhenSuit.value;
    var parts = [];
    if (rcState.suit !== 'any') parts.push(rcState.suit);
    if (rcState.rank !== 'any') parts.push(rcState.rank);
    rcWhenLabel.textContent = parts.length > 0 ? parts.join(' ') : 'card';
    updateRulePreview();
  });

  rcWhenRank.addEventListener('change', function() {
    rcState.rank = rcWhenRank.value;
    var parts = [];
    if (rcState.suit !== 'any') parts.push(rcState.suit);
    if (rcState.rank !== 'any') parts.push(rcState.rank);
    rcWhenLabel.textContent = parts.length > 0 ? parts.join(' ') : 'card';
    updateRulePreview();
  });

  rcActionType.addEventListener('change', function() {
    rcState.actionKey = rcActionType.value;
    rcState.target = SIMPLE_ACTIONS[rcState.actionKey].targets && SIMPLE_ACTIONS[rcState.actionKey].targets.length > 0 ? SIMPLE_ACTIONS[rcState.actionKey].targets[0] : '';
    rcState.timing = SIMPLE_ACTIONS[rcState.actionKey].timing ? 'now' : '';
    rcState.actionParams = {};
    rcState.showActionAdv = false;
    var cfg = SIMPLE_ACTIONS[rcState.actionKey];
    if (cfg.params) {
      for (var i = 0; i < cfg.params.length; i++) {
        var p = cfg.params[i];
        rcState.actionParams[p.name] = p.options ? p.options[0] : '';
      }
    }
    rcActionGear.classList.remove('rc-adv-toggle--active');
    renderActionConfig();
    updateRulePreview();
  });

  rcActionGear.addEventListener('click', function() {
    rcState.showActionAdv = !rcState.showActionAdv;
    rcActionGear.classList.toggle('rc-adv-toggle--active', rcState.showActionAdv);
    var adv = document.getElementById('rc-action-adv');
    if (adv) adv.classList.toggle('hidden', !rcState.showActionAdv);
    if (rcState.showActionAdv) rcActionConfig.classList.remove('hidden');
  });

  rcAdvToggle.addEventListener('click', function() {
    rcState.advOpen = !rcState.advOpen;
    rcAdvPanel.classList.toggle('hidden', !rcState.advOpen);
    rcAdvToggle.classList.toggle('rc-adv-toggle--active', rcState.advOpen);
    if (rcState.advOpen) {
      rcAdvTriggerType.value = rcState.advTrigger.type;
      rebuildAdvConditions();
    }
    updateRulePreview();
  });

  rcAdvTriggerType.addEventListener('change', function() {
    var type = rcAdvTriggerType.value;
    var def = getDef(RC_TRIGGER_DEFS, type);
    if (def) {
      rcState.advTrigger = { type: type, params: getDefaultParams(def) };
      updateRulePreview();
    }
  });

  rcAdvAddCondition.addEventListener('click', function() {
    if (rcState.advConditions.length >= 5) {
      showToast('Maximum 5 extra conditions', 'error');
      return;
    }
    var def = getDef(RC_CONDITION_DEFS, 'specific_suit');
    rcState.advConditions.push({ type: 'specific_suit', params: getDefaultParams(def) });
    rebuildAdvConditions();
    updateRulePreview();
  });

  rcBtnCreate.addEventListener('click', function() {
    var name = rcRuleName.value.trim();
    if (!name) { showToast('Give your rule a name', 'error'); return; }
    var rule = buildRuleForSubmit();
    socket.emit('submit_block_rule', { rule: rule });
    rcBtnCreate.disabled = true;
    rcBtnCreate.textContent = 'CREATING...';
  });

  rcBtnSkip.addEventListener('click', function() {
    socket.emit('confirm_rule', {
      rule: {
        description: 'No rule added',
        summary: 'Skipped',
        interpretation: 'Winner chose not to add a rule this round.',
        createdBy: myNickname,
        round: gameState ? gameState.round : 0,
        revealed: true
      }
    });
    closeRuleCreator();
  });
}

function showRuleCreator(data) {
  rcState = {
    suit: 'any',
    rank: 'any',
    actionKey: 'skip_player',
    target: 'next',
    timing: 'now',
    actionParams: {},
    showActionAdv: false,
    advOpen: false,
    advTrigger: { type: 'after_card_played', params: {} },
    advConditions: []
  };
  rcRuleName.value = '';
  rcWhenSuit.value = 'any';
  rcWhenRank.value = 'any';
  rcWhenLabel.textContent = 'card';
  rcActionType.value = 'skip_player';
  rcActionGear.classList.remove('rc-adv-toggle--active');
  rcAdvToggle.classList.remove('rc-adv-toggle--active');
  rcAdvPanel.classList.add('hidden');
  rcAdvTriggerType.value = 'after_card_played';
  rcAdvConditionsList.innerHTML = '';
  rcAdvAddCondition.classList.add('hidden');
  renderActionConfig();
  rcBtnCreate.disabled = false;
  rcBtnCreate.textContent = 'CREATE RULE';
  updateRulePreview();
  rcOverlay.classList.remove('hidden');
}

function closeRuleCreator() {
  rcOverlay.classList.add('hidden');
}

function showBlockRuleApproved(rule, round) {
  var preview = '';
  var suit = '';
  var rank = '';
  if (rule.conditions) {
    for (var i = 0; i < rule.conditions.length; i++) {
      var c = rule.conditions[i];
      if (c.type === 'specific_suit') suit = c.params.suit;
      if (c.type === 'specific_rank') rank = c.params.rank;
      if (c.type === 'red_black') suit = c.params.color + ' suits';
    }
  }
  var cardDesc = suit || rank ? (suit + ' ' + rank).trim() : 'a card';
  preview += 'When ' + cardDesc + ' is played';

  if (rule.actions && rule.actions.length > 0) {
    var a = rule.actions[0];
    var target = a.params && a.params.target ? (TARGET_LABELS[a.params.target] || a.params.target) : '';
    var timing = a.params && a.params.timing ? (TIMING_LABELS[a.params.timing] || a.params.timing) : '';
    var aDesc = '';
    var aDef = getDef(RC_ACTION_DEFS, a.type);
    if (aDef) {
      aDesc = fillDesc(aDef, a.params);
    }
    if (target) aDesc = target + ' ' + aDesc;
    if (timing) aDesc += ' (' + timing + ')';
    if (aDesc) preview += ', ' + aDesc;
  }
  preview += ' (or draw 1 card)';

  punishmentTitle.textContent = 'ROUND ' + round + ' - NEW RULE!';
  punishmentBody.innerHTML =
    '<div class="punish-info">' +
    '<p style="color:var(--accent-green);font-size:18px;font-weight:700">RULE CREATED!</p>' +
    '<p class="punish-reason" style="font-weight:600;font-size:16px">"' + escapeHtml(rule.name) + '"</p>' +
    '<p style="color:var(--accent-gold);font-size:13px;margin-top:4px">' + escapeHtml(preview) + '</p>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px">Other players cannot see this rule.</p>' +
    '</div>';
  punishmentActions.innerHTML =
    '<button class="btn btn-primary" id="btn-next-round">NEXT ROUND</button>';
  punishmentOverlay.classList.remove('hidden');
  document.getElementById('btn-next-round').addEventListener('click', function() {
    closePunishmentOverlay();
    socket.emit('start_new_round');
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getDef(defs, type) {
  for (var i = 0; i < defs.length; i++) {
    if (defs[i].type === type) return defs[i];
  }
  return null;
}

function fillDesc(def, params) {
  var desc = def.desc;
  if (!params) return desc;
  for (var key in params) {
    var val = params[key];
    if (val !== undefined && val !== null) {
      desc = desc.replace('{' + key + '}', val);
    }
  }
  return desc;
}

initRuleCreator();

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

  if (isWinner) {
    showRuleCreator(data);
  } else {
    var ruleCount = gameState && gameState.rules ? gameState.rules.length : '?';
    punishmentTitle.textContent = 'ROUND ' + data.round + ' - ' + data.winnerNickname + ' WINS!';
    punishmentBody.innerHTML =
      '<div class="punish-info">' +
      '<p><span class="punish-highlight">' + data.winnerNickname + '</span> won round ' + data.round + '!</p>' +
      '<p>They are creating a new hidden rule...</p>' +
      '<p style="font-size:12px;color:var(--text-secondary)">Total rules: ' + ruleCount + '</p>' +
      '</div>';
    punishmentActions.innerHTML = '<p style="color:var(--text-secondary);font-size:13px">Waiting for winner to create a rule</p>';
    punishmentOverlay.classList.remove('hidden');
  }
}

function showRuleApproved(data) {
  var ruleCount = gameState && gameState.rules ? gameState.rules.length : '?';
  punishmentBody.innerHTML =
    '<div class="punish-info">' +
    '<p style="color:var(--accent-green);font-size:18px;font-weight:700">NEW RULE IN PLAY!</p>' +
    '<p class="punish-reason">"' + data.rule.description + '"</p>' +
    '<p><span class="punish-highlight">' + data.rule.summary + '</span></p>' +
    '<p style="font-size:12px;color:var(--text-secondary);margin-top:8px">Total rules: ' + ruleCount + '</p>' +
    '</div>';
  punishmentActions.innerHTML =
    '<button class="btn btn-primary" id="btn-next-round">NEXT ROUND</button>';
  punishmentOverlay.classList.remove('hidden');

  document.getElementById('btn-next-round').addEventListener('click', function() {
    closePunishmentOverlay();
    socket.emit('start_new_round');
  });
}
