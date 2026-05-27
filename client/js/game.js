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
const CARD_COOLDOWN_MS = 500;
let isAnimating = false;

const gameRoomCode = document.getElementById('game-room-code');
const otherPlayersEl = document.getElementById('other-players');
const playerHandEl = document.getElementById('player-hand');
const discardPileEl = document.getElementById('discard-pile');
const drawPile = document.getElementById('draw-pile');
const deckCountEl = document.getElementById('deck-count');
const btnDraw = document.getElementById('btn-draw');
const btnBadCard = document.getElementById('btn-bad-card');
const btnMyRules = document.getElementById('btn-my-rules');
const btnConfused = document.getElementById('btn-confused');
const btnFullscreen = document.getElementById('btn-fullscreen');
const btnLeaveGame = document.getElementById('btn-leave-game');
const btnKnock = document.getElementById('btn-knock');
const btnChatToggle = document.getElementById('btn-chat-toggle');
const logEntries = document.getElementById('log-entries');
const chatInput = document.getElementById('chat-input');
const btnChatSend = document.getElementById('btn-chat-send');

const punishmentOverlay = document.getElementById('punishment-overlay');
const punishmentTitle = document.getElementById('punishment-title');
const punishmentBody = document.getElementById('punishment-body');
const punishmentActions = document.getElementById('punishment-actions');

const myRulesOverlay = document.getElementById('my-rules-overlay');
const myRulesList = document.getElementById('my-rules-list');
const btnMyRulesDownload = document.getElementById('btn-my-rules-download');
const btnMyRulesClose = document.getElementById('btn-my-rules-close');

var sound = { play: function(type) { AudioManager.playSfx(type); } };

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
  animateCardDraw(data.card, data.playerId, data.faceUp);
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

    if (data.type === 'bad_card') {
      showToast(pName + ' caught ' + vName + '! Card returned + penalty!', 'error');
    } else {
      showToast(pName + ' punished ' + vName + '! They drew a card', 'error');
    }

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

socket.on('back_to_deck_result', function(data) {
  if (gameState) {
    showToast('Card sent back to the deck!', 'info');
    hidePunishBackButton();
  }
});

socket.on('confused_result', function(data) {
  if (gameState && data.results && data.results.length > 0) {
    var names = data.results.map(function(r) {
      var p = gameState.players.find(function(pl) { return pl.id === r.targetId; });
      return p ? p.nickname : 'Player';
    });
    showToast('Confused! ' + names.join(', ') + ' drew a card', 'info');
  } else if (gameState) {
    showToast('Confused! Nobody broke any rules', 'info');
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

socket.on('rule_created', function(data) {
  closePunishmentOverlay();
  showToast('New rule added!', 'success');
  showRuleApproved(data);
});

socket.on('new_round', function(data) {
  showToast('Round ' + data.round + ' started!', 'success');
  hidePunishBackButton();
  closePunishmentOverlay();
  closeRuleCreator();
});

socket.on('game_state', function(state) {
  gameState = state;
  if (state.yourHand) {
    myHand = state.yourHand;
  }
  if (state.currentTurn === myId) {
    hidePunishBackButton();
  }
  renderGame();
});

socket.on('rule_created_notification', function(data) {
  closePunishmentOverlay();
  closeRuleCreator();
  if (data.creatorId !== myId) {
    showToast('A new hidden rule was added!', 'success');
    showRuleCreatedNextRound(data);
  }
});

function showRuleCreatedNextRound(data) {
  var ruleCount = gameState && gameState.rules ? gameState.rules.length : '?';
  punishmentTitle.textContent = 'ROUND ' + data.round + ' - NEW RULE!';
  punishmentBody.innerHTML =
    '<div class="punish-info">' +
    '<p style="color:var(--accent-green);font-size:18px;font-weight:700">A new hidden rule was added!</p>' +
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

socket.on('rule_created_detail', function(data) {
  closePunishmentOverlay();
  closeRuleCreator();
  showBlockRuleApproved(data.rule, data.round);
});

// ========== RULE BLOCK CREATOR ==========



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
  { type: 'knock_on_table', name: 'Knock on table', desc: 'knock on the table', params: [] },
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
  must_say: { name: 'Must say...', desc: '{target} must say "{phrase}"', targets: ['that', 'next', 'prev', 'all'], timing: false, mapType: 'must_say_phrase', params: [{ name: 'phrase', label: 'Phrase', type: 'string' }] },
  knock: { name: 'Knock on table', desc: '{target} knocks {count} times {timing}', targets: ['that', 'next', 'prev'], timing: true, mapType: 'knock_on_table', params: [{ name: 'count', label: 'Times', type: 'number', min: 1 }] }
};

var SIMPLE_ACTION_KEYS = Object.keys(SIMPLE_ACTIONS);

var rcOverlay = document.getElementById('rule-creator-overlay');
var rcRuleName = document.getElementById('rc-rule-name');
var rcTriggerType = document.getElementById('rc-trigger-type');
var rcActionType = document.getElementById('rc-action-type');
var rcActionGear = document.getElementById('rc-action-gear');
var rcActionConfig = document.getElementById('rc-action-config');
var rcPreview = document.getElementById('rc-preview');
var rcBtnCreate = document.getElementById('rc-btn-create');
var rcBtnSkip = document.getElementById('rc-btn-skip');
var rcTriggerRowsEl = document.getElementById('rc-trigger-rows');
var rcAddTriggerRow = document.getElementById('rc-add-trigger-row');
var rcSuitChange = document.getElementById('rc-suit-change');
var rcSuitFrom = document.getElementById('rc-suit-from');
var rcSuitTo = document.getElementById('rc-suit-to');
var rcSuitWarning = document.getElementById('rc-suit-warning');
var rcNumericOffset = document.getElementById('rc-numeric-offset');
var rcNumOffset = document.getElementById('rc-num-offset');
var rcNumDirection = document.getElementById('rc-num-direction');
var rcNumSuit = document.getElementById('rc-num-suit');
var rcNumSpecificSuits = document.getElementById('rc-num-specific-suits');

var SUIT_NAMES = ['any', 'black', 'red', 'spades', 'clubs', 'diamonds', 'hearts'];

var SUIT_SETS = {
  any: ['spades', 'clubs', 'diamonds', 'hearts'],
  black: ['spades', 'clubs'],
  red: ['diamonds', 'hearts'],
  spades: ['spades'],
  clubs: ['clubs'],
  diamonds: ['diamonds'],
  hearts: ['hearts']
};

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
  var hasAdv = rcState.actionKey === 'skip_player' || rcState.actionKey === 'reverse';

  rcActionGear.classList.toggle('hidden', !hasAdv);

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
      } else if (p.type === 'number') {
        var pNum = document.createElement('input');
        pNum.type = 'number';
        pNum.className = 'rc-input rc-config-input rc-config-number';
        pNum.min = p.min || 1;
        pNum.max = rcState.playerCount || 10;
        pNum.value = rcState.actionParams[p.name] || '1';
        pNum.addEventListener('input', function(paramName, inp) {
          return function() { rcState.actionParams[paramName] = inp.value; updateRulePreview(); };
        }(p.name, pNum));
        paramRow.appendChild(pNum);
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

function validateSuitChange() {
  var from = rcState.suitChangeFrom;
  var to = rcState.suitChangeTo;
  var fromSet = SUIT_SETS[from] || [];
  var toSet = SUIT_SETS[to] || [];
  var overlap = fromSet.some(function(s) { return toSet.indexOf(s) !== -1; });
  if (overlap) {
    rcSuitWarning.classList.remove('hidden');
    rcBtnCreate.disabled = true;
  } else {
    rcSuitWarning.classList.add('hidden');
    rcBtnCreate.disabled = false;
  }
}

function updateRulePreview() {
  if (!rcState) return;
  var cfg = SIMPLE_ACTIONS[rcState.actionKey];
  var actionDesc = cfg ? getDesc(cfg) : '?';
  if (rcState.triggerKey === 'suit_change') {
    var fromLabel = rcState.suitChangeFrom.charAt(0).toUpperCase() + rcState.suitChangeFrom.slice(1);
    var toLabel = rcState.suitChangeTo.charAt(0).toUpperCase() + rcState.suitChangeTo.slice(1);
    rcPreview.textContent = 'When suit changes from ' + fromLabel + ' to ' + toLabel + ', ' + actionDesc + ' (or draw 1 card)';
    return;
  }
  if (rcState.triggerKey === 'numeric_offset') {
    var dirLabel = { positive: '+', negative: '−', both: '±' }[rcState.numericDirection] || '+';
    var suitLabels = {
      any: 'any suit',
      same_suit: 'same suit',
      same_color: 'same color',
      diff_color: 'different color',
      specific: (rcState.numericSpecificSuits && rcState.numericSpecificSuits.length > 0 ? rcState.numericSpecificSuits.join('/') : 'specific suits')
    };
    var sLabel = suitLabels[rcState.numericSuitConstraint] || 'any suit';
    rcPreview.textContent = 'When a card is played with offset ' + dirLabel + rcState.numericOffset + ' (' + sLabel + '), ' + actionDesc + ' (or draw 1 card)';
    return;
  }
  var parts = [];
  for (var i = 0; i < rcState.triggerRows.length; i++) {
    var row = rcState.triggerRows[i];
    var s = row.suit === 'any' ? '' : row.suit;
    var r = row.rank === 'any' ? '' : row.rank;
    var label = (s + ' ' + r).trim();
    if (!label || label === 'any') label = 'a card';
    parts.push(label);
  }
  var cardDesc = parts.join(' or ');
  rcPreview.textContent = 'When ' + cardDesc + ' is played, ' + actionDesc + ' (or draw 1 card)';
}

function buildRuleForSubmit() {
  var orConditions = [];
  for (var i = 0; i < rcState.triggerRows.length; i++) {
    var row = rcState.triggerRows[i];
    var group = [];
    if (row.suit !== 'any') {
      if (row.suit === 'red suits') {
        group.push({ type: 'red_black', params: { color: 'red' } });
      } else if (row.suit === 'black suits') {
        group.push({ type: 'red_black', params: { color: 'black' } });
      } else {
        group.push({ type: 'specific_suit', params: { suit: row.suit } });
      }
    }
    if (row.rank !== 'any') {
      group.push({ type: 'specific_rank', params: { rank: row.rank } });
    }
    if (group.length > 0) orConditions.push(group);
  }
  var cfg = SIMPLE_ACTIONS[rcState.actionKey];
  var action = {
    type: cfg.mapType,
    params: {
      target: rcState.target,
      timing: rcState.timing,
      suit: rcState.actionParams.suit || null,
      phrase: rcState.actionParams.phrase || null,
      count: rcState.actionParams.count ? parseInt(rcState.actionParams.count, 10) : null
    }
  };

  var triggerType = 'after_card_played';
  var triggerParams = {};
  if (rcState.triggerKey === 'suit_change') {
    triggerType = 'after_suit_change';
    triggerParams = { from: rcState.suitChangeFrom, to: rcState.suitChangeTo };
  } else if (rcState.triggerKey === 'numeric_offset') {
    triggerType = 'numeric_offset';
    triggerParams = {
      offset: parseInt(rcState.numericOffset, 10) || 1,
      direction: rcState.numericDirection,
      suitConstraint: rcState.numericSuitConstraint,
      specificSuits: rcState.numericSuitConstraint === 'specific' ? (rcState.numericSpecificSuits || []) : []
    };
  }

  return {
    name: rcRuleName.value.trim(),
    trigger: { type: triggerType, params: triggerParams },
    conditions: [],
    orConditions: orConditions.length > 0 ? orConditions : undefined,
    actions: [action]
  };
}



function renderTriggerRow(index) {
  var row = rcState.triggerRows[index];
  var div = document.createElement('div');
  div.className = 'rc-trigger-row-item';
  div.dataset.index = index;

  var suitLabel = document.createElement('span');
  suitLabel.className = 'rc-inline-label';
  suitLabel.textContent = 'Suit';
  div.appendChild(suitLabel);

  var suitSel = document.createElement('select');
  suitSel.className = 'rc-select rc-trigger-suit';
  populateSelect(suitSel, SUIT_OPTIONS, row.suit);
  suitSel.addEventListener('change', function(idx, sel) {
    return function() { rcState.triggerRows[idx].suit = sel.value; updateRulePreview(); };
  }(index, suitSel));
  div.appendChild(suitSel);

  var rankLabel = document.createElement('span');
  rankLabel.className = 'rc-inline-label';
  rankLabel.textContent = 'Card';
  div.appendChild(rankLabel);

  var rankSel = document.createElement('select');
  rankSel.className = 'rc-select rc-trigger-rank';
  populateSelect(rankSel, RANK_OPTIONS, row.rank);
  rankSel.addEventListener('change', function(idx, sel) {
    return function() { rcState.triggerRows[idx].rank = sel.value; updateRulePreview(); };
  }(index, rankSel));
  div.appendChild(rankSel);

  if (rcState.triggerRows.length > 1) {
    var removeBtn = document.createElement('button');
    removeBtn.className = 'rc-trigger-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', function(idx) {
      return function() {
        rcState.triggerRows.splice(idx, 1);
        renderTriggerRows();
        updateRulePreview();
      };
    }(index));
    div.appendChild(removeBtn);
  }

  var existing = rcTriggerRowsEl.children[index];
  if (existing) {
    rcTriggerRowsEl.replaceChild(div, existing);
  } else {
    rcTriggerRowsEl.appendChild(div);
  }
}

function renderTriggerRows() {
  rcTriggerRowsEl.innerHTML = '';
  for (var i = 0; i < rcState.triggerRows.length; i++) {
    renderTriggerRow(i);
  }
}

function initRuleCreator() {
  populateSelect(rcActionType, SIMPLE_ACTION_KEYS.map(function(k) { return { value: k, label: SIMPLE_ACTIONS[k].name }; }), 'skip_player');

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

  rcTriggerType.addEventListener('change', function() {
    rcState.triggerKey = rcTriggerType.value;
    rcTriggerRowsEl.classList.add('hidden');
    rcAddTriggerRow.classList.add('hidden');
    rcSuitChange.classList.add('hidden');
    rcNumericOffset.classList.add('hidden');
    rcBtnCreate.disabled = false;
    if (rcTriggerType.value === 'suit_change') {
      rcSuitChange.classList.remove('hidden');
      validateSuitChange();
    } else if (rcTriggerType.value === 'numeric_offset') {
      rcNumericOffset.classList.remove('hidden');
    } else {
      rcTriggerRowsEl.classList.remove('hidden');
      rcAddTriggerRow.classList.remove('hidden');
    }
    updateRulePreview();
  });

  rcSuitFrom.addEventListener('change', function() {
    rcState.suitChangeFrom = rcSuitFrom.value;
    validateSuitChange();
    updateRulePreview();
  });

  rcSuitTo.addEventListener('change', function() {
    rcState.suitChangeTo = rcSuitTo.value;
    validateSuitChange();
    updateRulePreview();
  });

  rcNumOffset.addEventListener('input', function() {
    rcState.numericOffset = parseInt(rcNumOffset.value, 10) || 1;
    if (rcState.numericOffset < 1) rcState.numericOffset = 1;
    if (rcState.numericOffset > 13) rcState.numericOffset = 13;
    updateRulePreview();
  });

  rcNumDirection.addEventListener('change', function() {
    rcState.numericDirection = rcNumDirection.value;
    updateRulePreview();
  });

  rcNumSuit.addEventListener('change', function() {
    rcState.numericSuitConstraint = rcNumSuit.value;
    if (rcNumSuit.value === 'specific') {
      rcNumSpecificSuits.classList.remove('hidden');
    } else {
      rcNumSpecificSuits.classList.add('hidden');
    }
    updateRulePreview();
  });

  rcNumSpecificSuits.addEventListener('change', function(e) {
    if (e.target && e.target.classList.contains('rc-suit-check')) {
      rcState.numericSpecificSuits = [];
      var checks = rcNumSpecificSuits.querySelectorAll('.rc-suit-check:checked');
      for (var c = 0; c < checks.length; c++) {
        rcState.numericSpecificSuits.push(checks[c].value);
      }
      updateRulePreview();
    }
  });

  rcAddTriggerRow.addEventListener('click', function() {
    rcState.triggerRows.push({ suit: 'any', rank: 'any' });
    renderTriggerRow(rcState.triggerRows.length - 1);
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

socket.on('rule_created_notification', function() {
  // This event handler is intended for other players in the lobby.
  // The rule creator receives `rule_created_detail` instead, which handles closing.
  // However, in case of any out-of-order events or dropped `rule_created_detail`,
  // we should ensure the button is reset.
  rcBtnCreate.disabled = false;
  rcBtnCreate.textContent = 'CREATE RULE';
});

socket.on('rule_created_detail', function() {
  // This event is for the rule creator. The `showBlockRuleApproved` is called from here.
  rcBtnCreate.disabled = false;
  rcBtnCreate.textContent = 'CREATE RULE';
});

socket.on('error', function() {
  // If any server error occurs, reset the button state
  rcBtnCreate.disabled = false;
  rcBtnCreate.textContent = 'CREATE RULE';
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
    triggerRows: [{ suit: 'any', rank: 'any' }],
    triggerKey: 'card_played',
    actionKey: 'skip_player',
    target: 'next',
    timing: 'now',
    actionParams: {},
    suitChangeFrom: 'any',
    suitChangeTo: 'any',
    numericOffset: 1,
    numericDirection: 'positive',
    numericSuitConstraint: 'any',
    numericSpecificSuits: [],
    showActionAdv: false,
    playerCount: data.playerCount || 4
  };
  rcRuleName.value = '';
  populateSelect(rcTriggerType, [
    { value: 'card_played', label: 'A card is played' },
    { value: 'suit_change', label: 'Suit changes' },
    { value: 'numeric_offset', label: 'Numeric offset play' }
  ], 'card_played');
  populateSelect(rcSuitFrom, SUIT_NAMES.map(function(s) { return { value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }; }), 'any');
  populateSelect(rcSuitTo, SUIT_NAMES.map(function(s) { return { value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }; }), 'any');
  rcActionType.value = 'skip_player';
  rcActionGear.classList.remove('rc-adv-toggle--active');
  rcActionGear.classList.add('hidden');
  rcNumOffset.value = 1;
  rcNumDirection.value = 'positive';
  rcNumSuit.value = 'any';
  rcNumSpecificSuits.classList.add('hidden');
  var checks = rcNumSpecificSuits.querySelectorAll('.rc-suit-check');
  for (var ci = 0; ci < checks.length; ci++) checks[ci].checked = false;
  renderTriggerRows();
  renderActionConfig();
  rcTriggerRowsEl.classList.remove('hidden');
  rcAddTriggerRow.classList.remove('hidden');
  rcSuitChange.classList.add('hidden');
  rcSuitWarning.classList.add('hidden');
  rcNumericOffset.classList.add('hidden');
  rcNumSpecificSuits.classList.add('hidden');
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
  if (rule.trigger && rule.trigger.type === 'after_suit_change') {
    var from = (rule.trigger.params && rule.trigger.params.from) || 'any';
    var to = (rule.trigger.params && rule.trigger.params.to) || 'any';
    preview += 'When suit changes from ' + from.charAt(0).toUpperCase() + from.slice(1) + ' to ' + to.charAt(0).toUpperCase() + to.slice(1);
  } else if (rule.trigger && rule.trigger.type === 'numeric_offset') {
    var p = rule.trigger.params || {};
    var dirLabel = { positive: '+', negative: '−', both: '±' }[p.direction] || '+';
    var suitLabels = { any: 'any suit', same_suit: 'same suit', same_color: 'same color', diff_color: 'different color' };
    var sl = suitLabels[p.suitConstraint] || (p.suitConstraint === 'specific' ? (p.specificSuits || []).join('/') : 'any suit');
    preview += 'When a card is played with offset ' + dirLabel + (p.offset || 1) + ' (' + sl + ')';
  } else { // This block handles 'after_card_played'
    var cardDescParts = [];
    if (rule.orConditions && rule.orConditions.length > 0) {
      // For simplicity in preview, just process the first OR group
      var firstGroup = rule.orConditions[0];
      var suit = '';
      var rank = '';
      for (var i = 0; i < firstGroup.length; i++) {
        var c = firstGroup[i];
        if (c.type === 'specific_suit') suit = c.params.suit;
        if (c.type === 'specific_rank') rank = c.params.rank;
        if (c.type === 'red_black') suit = c.params.color + ' suits';
      }
      var label = (suit || rank) ? (suit + ' ' + rank).trim() : 'a card';
      cardDescParts.push(label);

      // If there are more OR groups, indicate that
      if (rule.orConditions.length > 1) {
        cardDescParts.push(' (and more)');
      }
    }

    var cardDesc = cardDescParts.length > 0 ? cardDescParts.join(' ') : 'a card';
    preview += 'When ' + cardDesc + ' is played';
  }

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
    isAnimating = false;
    updateCooldownUI();
  }, 3000);
}

function animateCardDraw(card, playerId, faceUp) {
  if (!card) return;

  var gameTable = document.querySelector('.game-table');
  var drawPileEl = document.getElementById('draw-pile');
  if (!gameTable || !drawPileEl) return;

  var tableRect = gameTable.getBoundingClientRect();
  var pileRect = drawPileEl.getBoundingClientRect();

  var startX = pileRect.left - tableRect.left + (pileRect.width / 2);
  var startY = pileRect.top - tableRect.top;

  var targetX, targetY;
  if (playerId === myId) {
    targetX = tableRect.width / 2;
    targetY = tableRect.height * 0.85;
  } else {
    var playerEl = document.querySelector('.other-player[data-player-id="' + playerId + '"]');
    if (playerEl) {
      var pr = playerEl.getBoundingClientRect();
      targetX = pr.left - tableRect.left + pr.width / 2;
      targetY = pr.top - tableRect.top + pr.height / 2;
    } else {
      targetX = tableRect.width / 2;
      targetY = tableRect.height * 0.25;
    }
  }

  var dx = targetX - startX;
  var dy = targetY - startY;

  var animEl = document.createElement('div');
  animEl.className = 'card-draw-animation';

  var playerNick = '';
  if (gameState) {
    var p = gameState.players.find(function(p) { return p.id === playerId; });
    if (p) playerNick = p.nickname;
  }

  var imgSrc = faceUp ? getCardImage(card) : '/cards/back.png';

  animEl.innerHTML =
    '<div class="card-draw-inner">' +
    '<div class="card-draw-label">' + playerNick + ' drew</div>' +
    '<img src="' + imgSrc + '" alt="draw">' +
    '</div>';

  animEl.style.left = (startX - 50) + 'px';
  animEl.style.top = (startY - 70) + 'px';
  animEl.style.setProperty('--fly-x', dx + 'px');
  animEl.style.setProperty('--fly-y', dy + 'px');

  gameTable.appendChild(animEl);

  setTimeout(function() {
    if (animEl.parentNode) animEl.parentNode.removeChild(animEl);
  }, 2500);
}

// Cooldown timer: update UI every second
var cooldownInterval = setInterval(function() {
  if (gameState) updateCooldownUI();
}, 200);

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
    div.setAttribute('data-player-id', p.id);
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

  var punisherName = punisherId;
  if (gameState) {
    var p = gameState.players.find(function(pl) { return pl.id === punisherId; });
    if (p) punisherName = p.nickname;
  }

  var bar = document.createElement('div');
  bar.id = 'punish-back-bar';
  bar.className = 'punish-back-bar';
  bar.setAttribute('data-punisher', punisherId);
  bar.innerHTML =
    '<span>You have been punished by <strong>' + escapeHtml(punisherName) + '</strong></span>' +
    '<button class="btn btn-danger btn-small" id="btn-punish-back">PUNISH BACK!</button>' +
    '<button class="btn btn-secondary btn-small" id="btn-back-to-deck">BACK TO DECK</button>';
  document.querySelector('.game-bottom-bar').appendChild(bar);

  document.getElementById('btn-punish-back').addEventListener('click', function() {
    socket.emit('punish_back');
    sound.play('punish');
    hidePunishBackButton();
  });

  document.getElementById('btn-back-to-deck').addEventListener('click', function() {
    socket.emit('back_to_deck');
    sound.play('click');
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
  if (gameState.discardPile && gameState.discardPile.length > 0) {
    for (var i = Math.max(0, gameState.discardPile.length - 2); i < gameState.discardPile.length; i++) {
      var card = gameState.discardPile[i];
      var div = document.createElement('div');
      div.className = 'table-card' + (i < gameState.discardPile.length - 1 ? ' prev-card' : '');
      div.style.cursor = 'default';
      div.innerHTML = '<img src="' + getCardImage(card) + '" alt="' + getCardDisplayName(card) + '" draggable="false">';
      discardPileEl.appendChild(div);
    }
  } else if (gameState.discardTop) {
    var div = document.createElement('div');
    div.className = 'table-card';
    div.style.cursor = 'default';
    div.innerHTML = '<img src="' + getCardImage(gameState.discardTop) + '" alt="' + getCardDisplayName(gameState.discardTop) + '" draggable="false">';
    discardPileEl.appendChild(div);
  } else {
    discardPileEl.innerHTML = '<div class="discard-placeholder">PILE</div>';
  }
}

function playCard(index) {
  if (isAnimating) {
    showToast('Wait for the animation to finish', 'info');
    return;
  }
  var now = Date.now();
  if (now - lastPlayedTime < CARD_COOLDOWN_MS) {
    showToast('Wait ' + Math.ceil((CARD_COOLDOWN_MS - (now - lastPlayedTime)) / 1000) + 's before playing again', 'info');
    return;
  }
  socket.emit('play_card', { cardIndex: index });
  selectedCardIndex = -1;
  lastPlayedTime = now;
  isAnimating = true;
  updateCooldownUI();
}

function canAct() {
  return Date.now() - lastPlayedTime >= CARD_COOLDOWN_MS && !isAnimating;
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

btnBadCard.addEventListener('click', function() {
  socket.emit('bad_card_punish');
  sound.play('punish');
});

btnMyRules.addEventListener('click', function() {
  showMyRules();
});

btnConfused.addEventListener('click', function() {
  socket.emit('confused_punish');
  sound.play('click');
  showToast('Checking everyone\'s hand...', 'info');
});

btnMyRulesClose.addEventListener('click', function() {
  myRulesOverlay.classList.add('hidden');
});

btnMyRulesDownload.addEventListener('click', function() {
  downloadMyRules();
});

myRulesOverlay.addEventListener('click', function(e) {
  if (e.target === myRulesOverlay) myRulesOverlay.classList.add('hidden');
});

function showMyRules() {
  if (!gameState || !gameState.rules) {
    showToast('No rules available', 'error');
    return;
  }
  var myRules = gameState.rules.filter(function(r) { return !r.hidden || r.createdById === myId; });
  myRulesList.innerHTML = '';
  if (myRules.length === 0) {
    myRulesList.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px">No rules yet</p>';
  } else {
    for (var i = 0; i < myRules.length; i++) {
      var r = myRules[i];
      var entry = document.createElement('div');
      entry.className = 'my-rules-entry';
      var name = r.name || 'Unnamed';
      var desc = '';
      if (r.trigger && r.trigger.type === 'after_suit_change') {
        desc = 'Suit changes from ' + (r.trigger.params && r.trigger.params.from || '?') + ' to ' + (r.trigger.params && r.trigger.params.to || '?');
      } else if (r.trigger && r.trigger.type === 'numeric_offset') {
        var p = r.trigger.params || {};
        var dl = { positive: '+', negative: '−', both: '±' }[p.direction] || '+';
        desc = 'Offset ' + dl + (p.offset || 1) + ' (' + (p.suitConstraint || 'any') + ')';
      } else {
        if (r.orConditions && r.orConditions.length > 0) {
          var labels = [];
          for (var gi = 0; gi < r.orConditions.length; gi++) {
            var g = r.orConditions[gi];
            var s = '';
            var rk = '';
            for (var ci = 0; ci < g.length; ci++) {
              if (g[ci].type === 'specific_suit') s = g[ci].params.suit;
              if (g[ci].type === 'specific_rank') rk = g[ci].params.rank;
              if (g[ci].type === 'red_black') s = g[ci].params.color + ' suits';
            }
            labels.push((s || rk) ? (s + ' ' + rk).trim() : 'a card');
          }
          desc = labels.join(' or ');
        } else {
          desc = 'Card played';
        }
      }
      if (r.actions && r.actions.length > 0) {
        var a = r.actions[0];
        desc += ' → ' + (a.type || '?');
      }
      entry.innerHTML = '<div class="mr-name">' + escapeHtml(name) + '</div>' +
        '<div class="mr-desc">' + escapeHtml(desc) + '</div>' +
        '<div class="mr-trigger">Round ' + (r.round || '?') + (r.createdBy ? ' by ' + escapeHtml(r.createdBy) : '') + '</div>';
      myRulesList.appendChild(entry);
    }
  }
  myRulesOverlay.classList.remove('hidden');
}

function downloadMyRules() {
  if (!gameState || !gameState.rules) return;
  var myRules = gameState.rules.filter(function(r) { return !r.hidden || r.createdById === myId; });
  var lines = [];
  lines.push('Mao - My Rules');
  lines.push('==============');
  lines.push('');
  for (var i = 0; i < myRules.length; i++) {
    var r = myRules[i];
    lines.push('Rule ' + (i + 1) + ': ' + (r.name || 'Unnamed'));
    lines.push('  Trigger: ' + (r.trigger ? (r.trigger.type || 'card played') : 'card played'));
    if (r.trigger && r.trigger.params) {
      for (var k in r.trigger.params) {
        var val = r.trigger.params[k];
        if (Array.isArray(val)) val = val.join(', ');
        if (val) lines.push('    ' + k + ': ' + val);
      }
    }
    if (r.orConditions && r.orConditions.length > 0) {
      lines.push('  Trigger cards:');
      for (var oi = 0; oi < r.orConditions.length; oi++) {
        var og = r.orConditions[oi];
        var parts = [];
        for (var oj = 0; oj < og.length; oj++) {
          var oc = og[oj];
          if (oc.type === 'specific_suit') parts.push('suit=' + oc.params.suit);
          if (oc.type === 'specific_rank') parts.push('rank=' + oc.params.rank);
          if (oc.type === 'red_black') parts.push('color=' + oc.params.color);
        }
        lines.push('    - ' + (parts.join(', ') || 'any card'));
      }
    }
    if (r.conditions && r.conditions.length > 0) {
      lines.push('  Conditions: ' + JSON.stringify(r.conditions));
    }
    if (r.actions && r.actions.length > 0) {
      lines.push('  Action: ' + JSON.stringify(r.actions[0]));
    }
    lines.push('  Round: ' + (r.round || '?'));
    lines.push('  Creator: ' + (r.createdBy || '?'));
    lines.push('');
  }
  var blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-mao-rules.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

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

btnKnock.addEventListener('click', function() {
  socket.emit('knock');
});

socket.on('log', function(data) {
  addLogEntry({ nickname: '', message: data.message });
});

socket.on('knock', function(data) {
  addLogEntry({ nickname: data.nickname, message: '👊 knocks on the table!' });
});

socket.on('chat_message', function(data) {
  addLogEntry({ nickname: data.nickname, message: data.message });
});

btnChatToggle.addEventListener('click', function() {
  var panel = document.getElementById('chat-panel');
  var minimized = panel.classList.toggle('chat-panel--min');
  btnChatToggle.textContent = minimized ? '+' : '−';
});

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
