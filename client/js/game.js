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
  { type: 'after_card_played', name: 'After card played', desc: 'a card is played', params: [] },
  { type: 'before_turn', name: 'Before turn', desc: 'a turn begins', params: [] },
  { type: 'after_drawing', name: 'After drawing', desc: 'a card is drawn', params: [] },
  { type: 'after_punishment', name: 'After punishment', desc: 'a player is punished', params: [] },
  { type: 'after_specific_rank', name: 'After specific rank', desc: 'a {rank} is played', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'after_specific_suit', name: 'After specific suit', desc: 'a {suit} is played', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'after_red_black', name: 'After red/black card', desc: 'a {color} card is played', params: [
    { name: 'color', label: 'Color', type: 'select', options: ['red', 'black'] }
  ]},
  { type: 'after_card_combo', name: 'After card combo', desc: 'a {combo} combo is formed', params: [
    { name: 'combo', label: 'Combo type', type: 'select', options: ['pair', 'run', 'flush', 'same suit'] }
  ]},
  { type: 'after_speaking', name: 'After speaking', desc: 'someone speaks', params: [] },
  { type: 'after_saying_word', name: 'After saying word', desc: 'someone says "{word}"', params: [
    { name: 'word', label: 'Word or phrase', type: 'string' }
  ]},
  { type: 'random_chance', name: 'Random chance', desc: 'random {chance}% chance per turn', params: [
    { name: 'chance', label: 'Chance (%)', type: 'number', min: 1, max: 100 }
  ]},
];

var RC_CONDITION_DEFS = [
  { type: 'specific_suit', name: 'Specific suit', desc: 'card suit is {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
  { type: 'specific_rank', name: 'Specific rank', desc: 'card rank is {rank}', params: [
    { name: 'rank', label: 'Rank', type: 'select', options: ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king', 'joker'] }
  ]},
  { type: 'red_black', name: 'Red/black', desc: 'card color is {color}', params: [
    { name: 'color', label: 'Color', type: 'select', options: ['red', 'black'] }
  ]},
  { type: 'even_odd', name: 'Even/odd', desc: 'card rank is {parity}', params: [
    { name: 'parity', label: 'Parity', type: 'select', options: ['even', 'odd'] }
  ]},
  { type: 'consecutive_cards', name: 'Consecutive cards', desc: 'at least {count} cards in a row', params: [
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 10 }
  ]},
  { type: 'repeated_actions', name: 'Repeated actions', desc: 'same action repeated {count}x', params: [
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 10 }
  ]},
  { type: 'player_count', name: 'Player count', desc: 'there are {operator} {count} players', params: [
    { name: 'operator', label: 'Comparison', type: 'select', options: ['exactly', 'at least', 'at most'] },
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 8 }
  ]},
  { type: 'current_direction', name: 'Current direction', desc: 'direction is {direction}', params: [
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
  { type: 'skip_turn', name: 'Skip turn', desc: 'skip next turn', params: [] },
  { type: 'reverse_direction', name: 'Reverse direction', desc: 'reverse turn order', params: [] },
  { type: 'must_say_phrase', name: 'Must say phrase', desc: 'must say "{phrase}"', params: [
    { name: 'phrase', label: 'Required phrase', type: 'string' }
  ]},
  { type: 'cannot_say_phrase', name: 'Cannot say phrase', desc: 'cannot say "{phrase}"', params: [
    { name: 'phrase', label: 'Forbidden phrase', type: 'string' }
  ]},
  { type: 'punish_player', name: 'Punish player', desc: 'punish (+{count} cards)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'punish_everyone', name: 'Punish everyone', desc: 'punish everyone (+{count} cards)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'reveal_card', name: 'Reveal card', desc: 'reveal a card from hand', params: [] },
  { type: 'mute_player', name: 'Mute player', desc: 'mute for {turns} turn(s)', params: [
    { name: 'turns', label: 'Number of turns', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'change_active_suit', name: 'Change active suit', desc: 'change suit to {suit}', params: [
    { name: 'suit', label: 'Suit', type: 'select', options: ['clubs', 'diamonds', 'hearts', 'spades'] }
  ]},
];

var rcOverlay = document.getElementById('rule-creator-overlay');
var rcTriggerType = document.getElementById('rc-trigger-type');
var rcTriggerParams = document.getElementById('rc-trigger-params');
var rcRuleName = document.getElementById('rc-rule-name');
var rcConditionsList = document.getElementById('rc-conditions-list');
var rcActionsList = document.getElementById('rc-actions-list');
var rcPreview = document.getElementById('rc-preview');
var rcAddCondition = document.getElementById('rc-add-condition');
var rcAddAction = document.getElementById('rc-add-action');
var rcBtnCreate = document.getElementById('rc-btn-create');
var rcBtnSkip = document.getElementById('rc-btn-skip');

var rcState = null;

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

function updateRulePreview() {
  if (!rcState) return;
  var parts = [];
  var triggerDef = getDef(RC_TRIGGER_DEFS, rcState.trigger.type);
  if (!triggerDef) { rcPreview.textContent = 'Select a trigger and at least one action.'; return; }
  var triggerText = 'When ' + fillDesc(triggerDef, rcState.trigger.params);
  parts.push(triggerText);
  if (rcState.conditions.length > 0) {
    var condTexts = [];
    for (var i = 0; i < rcState.conditions.length; i++) {
      var c = rcState.conditions[i];
      var cDef = getDef(RC_CONDITION_DEFS, c.type);
      if (cDef) condTexts.push(fillDesc(cDef, c.params));
    }
    if (condTexts.length > 0) {
      parts.push('if ' + condTexts.join(' and '));
    }
  }
  if (rcState.actions.length > 0) {
    var actTexts = [];
    for (var j = 0; j < rcState.actions.length; j++) {
      var a = rcState.actions[j];
      var aDef = getDef(RC_ACTION_DEFS, a.type);
      if (aDef) actTexts.push(fillDesc(aDef, a.params));
    }
    if (actTexts.length > 0) {
      parts.push('then ' + actTexts.join(' and '));
    }
  }
  rcPreview.textContent = parts.join(', ');
}

function addConditionBlock(type) {
  var def = getDef(RC_CONDITION_DEFS, type);
  if (!def) return;
  var cond = { type: type, params: getDefaultParams(def) };
  var idx = rcState.conditions.length;
  rcState.conditions.push(cond);
  renderConditionBlock(idx);
  updateRulePreview();
}

function renderConditionBlock(idx) {
  var cond = rcState.conditions[idx];
  var def = getDef(RC_CONDITION_DEFS, cond.type);
  if (!def) return;
  var block = document.createElement('div');
  block.className = 'rule-block rc-condition-block';
  block.dataset.index = idx;
  var row = document.createElement('div');
  row.className = 'rc-block-row';
  var prefix = document.createElement('span');
  prefix.className = 'rc-block-prefix';
  prefix.textContent = 'If';
  row.appendChild(prefix);
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
        rcState.conditions[index] = { type: select.value, params: getDefaultParams(newDef) };
        rebuildConditions();
        updateRulePreview();
      }
    };
  }(idx, sel));
  row.appendChild(sel);
  var removeBtn = document.createElement('button');
  removeBtn.className = 'rc-remove-btn';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', function(index) {
    return function() {
      rcState.conditions.splice(index, 1);
      rebuildConditions();
      updateRulePreview();
    };
  }(idx));
  row.appendChild(removeBtn);
  block.appendChild(row);
  var paramsDiv = document.createElement('div');
  paramsDiv.className = 'rc-params';
  block.appendChild(paramsDiv);
  renderParams(paramsDiv, def, cond.params, updateRulePreview);
  var existing = rcConditionsList.children[idx];
  if (existing) {
    rcConditionsList.replaceChild(block, existing);
  } else {
    rcConditionsList.appendChild(block);
  }
}

function rebuildConditions() {
  rcConditionsList.innerHTML = '';
  for (var i = 0; i < rcState.conditions.length; i++) {
    renderConditionBlock(i);
  }
}

function addActionBlock(type) {
  var def = getDef(RC_ACTION_DEFS, type);
  if (!def) return;
  var act = { type: type, params: getDefaultParams(def) };
  rcState.actions.push(act);
  rebuildActions();
  updateRulePreview();
}

function rebuildActions() {
  rcActionsList.innerHTML = '';
  for (var i = 0; i < rcState.actions.length; i++) {
    var act = rcState.actions[i];
    var def = getDef(RC_ACTION_DEFS, act.type);
    if (!def) continue;
    var block = document.createElement('div');
    block.className = 'rule-block rc-action-block';
    block.dataset.index = i;
    var row = document.createElement('div');
    row.className = 'rc-block-row';
    var prefix = document.createElement('span');
    prefix.className = 'rc-block-prefix';
    prefix.textContent = 'Then';
    row.appendChild(prefix);
    var sel = document.createElement('select');
    sel.className = 'rc-select rc-action-select';
    for (var j = 0; j < RC_ACTION_DEFS.length; j++) {
      var opt = document.createElement('option');
      opt.value = RC_ACTION_DEFS[j].type;
      opt.textContent = RC_ACTION_DEFS[j].name;
      if (RC_ACTION_DEFS[j].type === act.type) opt.selected = true;
      sel.appendChild(opt);
    }
    sel.addEventListener('change', function(index, select) {
      return function() {
        var newDef = getDef(RC_ACTION_DEFS, select.value);
        if (newDef) {
          rcState.actions[index] = { type: select.value, params: getDefaultParams(newDef) };
          rebuildActions();
          updateRulePreview();
        }
      };
    }(i, sel));
    row.appendChild(sel);
    var removeBtn = document.createElement('button');
    removeBtn.className = 'rc-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', function(index) {
      return function() {
        rcState.actions.splice(index, 1);
        rebuildActions();
        updateRulePreview();
      };
    }(i));
    row.appendChild(removeBtn);
    block.appendChild(row);
    var paramsDiv = document.createElement('div');
    paramsDiv.className = 'rc-params';
    block.appendChild(paramsDiv);
    renderParams(paramsDiv, def, act.params, updateRulePreview);
    rcActionsList.appendChild(block);
  }
}

function initRuleCreator() {
  rcTriggerType.innerHTML = '';
  for (var i = 0; i < RC_TRIGGER_DEFS.length; i++) {
    var opt = document.createElement('option');
    opt.value = RC_TRIGGER_DEFS[i].type;
    opt.textContent = RC_TRIGGER_DEFS[i].name;
    rcTriggerType.appendChild(opt);
  }
  rcTriggerType.addEventListener('change', function() {
    var type = rcTriggerType.value;
    var def = getDef(RC_TRIGGER_DEFS, type);
    if (def) {
      rcState.trigger = { type: type, params: getDefaultParams(def) };
      renderParams(rcTriggerParams, def, rcState.trigger.params, updateRulePreview);
      updateRulePreview();
    }
  });
  rcAddCondition.addEventListener('click', function() {
    if (rcState.conditions.length >= 5) {
      showToast('Maximum 5 conditions', 'error');
      return;
    }
    addConditionBlock('specific_suit');
  });
  rcAddAction.addEventListener('click', function() {
    if (rcState.actions.length >= 5) {
      showToast('Maximum 5 actions', 'error');
      return;
    }
    addActionBlock('force_draw_cards');
  });
  rcRuleName.addEventListener('input', updateRulePreview);
  rcBtnCreate.addEventListener('click', function() {
    var name = rcRuleName.value.trim();
    if (!name) { showToast('Give your rule a name', 'error'); return; }
    if (rcState.actions.length === 0) { showToast('Add at least one action', 'error'); return; }
    var rule = {
      name: name,
      trigger: rcState.trigger,
      conditions: rcState.conditions,
      actions: rcState.actions
    };
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
  if (!rcState) {
    rcState = {
      trigger: { type: 'after_card_played', params: {} },
      conditions: [],
      actions: [{ type: 'force_draw_cards', params: {} }]
    };
  } else {
    rcState.trigger = { type: 'after_card_played', params: {} };
    rcState.conditions = [];
    rcState.actions = [{ type: 'force_draw_cards', params: {} }];
  }
  rcRuleName.value = '';
  rcTriggerType.value = 'after_card_played';
  var triggerDef = getDef(RC_TRIGGER_DEFS, 'after_card_played');
  if (triggerDef) {
    rcState.trigger.params = getDefaultParams(triggerDef);
    renderParams(rcTriggerParams, triggerDef, rcState.trigger.params, updateRulePreview);
  }
  rcConditionsList.innerHTML = '';
  rcActionsList.innerHTML = '';
  rebuildActions();
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
  var triggerDef = getDef(RC_TRIGGER_DEFS, rule.trigger.type);
  if (triggerDef) {
    preview += 'When ' + fillDesc(triggerDef, rule.trigger.params);
  }
  if (rule.conditions && rule.conditions.length > 0) {
    var condTexts = [];
    for (var i = 0; i < rule.conditions.length; i++) {
      var cDef = getDef(RC_CONDITION_DEFS, rule.conditions[i].type);
      if (cDef) condTexts.push(fillDesc(cDef, rule.conditions[i].params));
    }
    if (condTexts.length > 0) preview += ', if ' + condTexts.join(' and ');
  }
  var actTexts = [];
  for (var j = 0; j < rule.actions.length; j++) {
    var aDef = getDef(RC_ACTION_DEFS, rule.actions[j].type);
    if (aDef) actTexts.push(fillDesc(aDef, rule.actions[j].params));
  }
  if (actTexts.length > 0) preview += ', then ' + actTexts.join(' and ');

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
