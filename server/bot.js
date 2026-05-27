const BOT_NAMES = [
  'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Felix',
  'Grace', 'Hank', 'Iris', 'Jack', 'Kate', 'Leo'
];

const BOT_LEVELS = {
  bad:     { detectChance: 0.25, forgetChance: 0.40, misplayChance: 0.30, voteCorrect: 0.30, name: 'Bad' },
  medium:  { detectChance: 0.50, forgetChance: 0.20, misplayChance: 0.10, voteCorrect: 0.60, name: 'Medium' },
  good:    { detectChance: 0.75, forgetChance: 0.05, misplayChance: 0.02, voteCorrect: 0.85, name: 'Good' },
  pro:     { detectChance: 0.92, forgetChance: 0.01, misplayChance: 0.00, voteCorrect: 0.95, name: 'Pro' },
  impossible: { detectChance: 1.00, forgetChance: 0.00, misplayChance: 0.00, voteCorrect: 1.00, name: 'Impossible' },
};

const ACTION_PATTERNS = [
  { keywords: ['cannot play', 'no', 'banned', 'forbidden', "can't play", 'not allowed'], type: 'ban_suit_rank' },
  { keywords: ['must play', 'only'], type: 'force_suit_rank' },
  { keywords: ['must say', 'must speak', 'say "'], type: 'must_say' },
  { keywords: ['cannot say', 'forbid', "can't say", 'no saying'], type: 'cannot_say' },
  { keywords: ['skip', 'loses turn'], type: 'skip_turn' },
  { keywords: ['reverse', 'direction'], type: 'reverse_direction' },
  { keywords: ['knock'], type: 'knock_on_table' },
  { keywords: ['draw', 'penalty'], type: 'draw_penalty' },
];

const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANK_NAMES = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

const RANK_NUM = { ace: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, jack: 11, queen: 12, king: 13 };

const SUIT_SETS_BOT = {
  any: ['spades', 'clubs', 'diamonds', 'hearts'],
  black: ['spades', 'clubs'],
  red: ['diamonds', 'hearts'],
  spades: ['spades'],
  clubs: ['clubs'],
  diamonds: ['diamonds'],
  hearts: ['hearts']
};

class BotController {
  constructor(game, io, lobbyCode) {
    this.game = game;
    this.io = io;
    this.lobbyCode = lobbyCode;
    this.usedNames = new Set();
    this.botPlayers = new Map();
    this.botMemory = new Map();

    for (const p of game.players) {
      this.usedNames.add(p.nickname.toLowerCase());
      if (p.isBot) {
        this.botPlayers.set(p.id, { level: p.botLevel || 'good' });
        this.botMemory.set(p.id, {
          level: p.botLevel || 'good',
          stats: BOT_LEVELS[p.botLevel || 'good'],
          knownRules: [],
          observedActions: [],
          cooldownUntil: 0
        });
      }
    }
  }

  addBot(level) {
    level = level || 'good';
    if (!BOT_LEVELS[level]) return null;

    var name = this.pickName();
    if (!name) return null;

    var botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    var playerObj = {
      id: botId,
      nickname: name,
      hand: [],
      isConnected: true,
      isBot: true,
      botLevel: level
    };

    this.game.players.push(playerObj);
    this.botPlayers.set(botId, { level: level });
    this.usedNames.add(name.toLowerCase());

    this.botMemory.set(botId, {
      level: level,
      stats: BOT_LEVELS[level],
      knownRules: [],
      observedActions: [],
      cooldownUntil: 0
    });

    return { id: botId, nickname: name, level: level };
  }

  removeBot(botId) {
    var idx = this.game.players.findIndex(function(p) { return p.id === botId; });
    if (idx === -1) return false;
    var p = this.game.players[idx];
    this.usedNames.delete(p.nickname.toLowerCase());
    this.game.players.splice(idx, 1);
    this.botPlayers.delete(botId);
    this.botMemory.delete(botId);
    return true;
  }

  setLevel(botId, level) {
    if (!BOT_LEVELS[level]) return false;
    var bp = this.botPlayers.get(botId);
    if (!bp) return false;
    bp.level = level;
    var mem = this.botMemory.get(botId);
    if (mem) {
      mem.level = level;
      mem.stats = BOT_LEVELS[level];
    }
    var p = this.game.players.find(function(p) { return p.id === botId; });
    if (p) p.botLevel = level;
    return true;
  }

  getBots() {
    var result = [];
    for (var i = 0; i < this.game.players.length; i++) {
      var p = this.game.players[i];
      if (p.isBot) {
        result.push({ id: p.id, nickname: p.nickname, level: p.botLevel || 'good' });
      }
    }
    return result;
  }

  pickName() {
    var shuffled = BOT_NAMES.slice().sort(function() { return Math.random() - 0.5; });
    for (var i = 0; i < shuffled.length; i++) {
      if (!this.usedNames.has(shuffled[i].toLowerCase())) return shuffled[i];
    }
    return 'Bot' + Math.floor(Math.random() * 1000);
  }

  isBotPlayer(playerId) {
    return this.botPlayers.has(playerId);
  }

  scheduleBotTurn(playerId, delay) {
    if (!delay) delay = 3000 + Math.random() * 1000;
    var self = this;
    setTimeout(function() {
      try {
        if (self.game.state !== 'playing') return;
        var mem = self.botMemory.get(playerId);
        if (!mem) return;
        if (Date.now() < mem.cooldownUntil) return;
        self.processBotTurn(playerId);
      } catch (e) {
        console.error('[Bot] Error in turn:', e);
        self.botEndTurn(playerId);
      }
    }, delay);
  }

  processBotTurn(playerId) {
    if (this.game.state !== 'playing') return;
    var current = this.game.getCurrentPlayer();
    if (!current || current.id !== playerId) return;
    var mem = this.botMemory.get(playerId);
    if (!mem) return;
    var stats = mem.stats;
    var player = this.game.getPlayer(playerId);
    if (!player || player.hand.length === 0) {
      this.botDraw(playerId);
      return;
    }

    var topCard = this.game.discardPile.length > 0 ? this.game.discardPile[this.game.discardPile.length - 1] : null;

    var playable = this.getPlayableCards(player, topCard, mem);
    var shouldMisplay = Math.random() < stats.misplayChance;

    if (playable.length > 0 && !shouldMisplay) {
      var cardIdx = this.pickBestCard(playable, player, stats);
      this.botPlayCard(playerId, cardIdx);
    } else if (shouldMisplay && player.hand.length > 0) {
      var randomIdx = Math.floor(Math.random() * player.hand.length);
      this.botPlayCard(playerId, randomIdx);
    } else {
      this.botDraw(playerId);
    }
  }

  getPlayableCards(player, topCard, mem) {
    if (!topCard) return player.hand.map(function(c, i) { return { card: c, index: i }; });

    var result = [];
    for (var i = 0; i < player.hand.length; i++) {
      var c = player.hand[i];
      if (c.suit === topCard.suit || c.rank === topCard.rank || c.rank === 'joker' || topCard.rank === 'joker') {
        if (!this.isCardBanned(c, mem)) {
          result.push({ card: c, index: i });
        }
      }
    }
    return result;
  }

  isCardBanned(card, mem) {
    for (var i = 0; i < mem.knownRules.length; i++) {
      var r = mem.knownRules[i];
      if ((r.type === 'cannot_play_suit' || r.type === 'ban_suit') && r.suit === card.suit) return true;
      if ((r.type === 'cannot_play_rank' || r.type === 'ban_rank') && r.rank === card.rank) return true;
    }
    return false;
  }

  pickBestCard(playable, player, stats) {
    var rankOrder = {};
    for (var i = 0; i < RANK_NAMES.length; i++) rankOrder[RANK_NAMES[i]] = i;
    playable.sort(function(a, b) {
      var ra = rankOrder[a.card.rank] !== undefined ? rankOrder[a.card.rank] : -1;
      var rb = rankOrder[b.card.rank] !== undefined ? rankOrder[b.card.rank] : -1;
      return rb - ra;
    });
    return playable[0].index;
  }

  botPlayCard(playerId, cardIndex) {
    var result = this.game.playCard(playerId, cardIndex);
    if (!result.success) {
      this.botDrawOrEnd(playerId);
      return;
    }

    var game = this.game;
    var io = this.io;
    var code = this.lobbyCode;

    this.observePlay(playerId, result.card);

    this.broadcastGameState();
    io.to(code).emit('card_played', { playerId: playerId, card: result.card });
    this.onCardPlayed(playerId, result.card);

    if (result.winner) {
      io.to(code).emit('round_won', {
        winnerId: result.winner.id,
        winnerNickname: result.winner.nickname,
        round: game.round
      });
    } else {
      io.to(code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
      var next = game.getCurrentPlayer();
      if (next && this.isBotPlayer(next.id)) {
        this.scheduleBotTurn(next.id);
      }
    }
  }

  botDraw(playerId) {
    var result = this.game.drawCard(playerId);
    if (!result.success) {
      this.botEndTurn(playerId);
      return;
    }

    var self = this;
    var player = this.game.getPlayer(playerId);
    var topCard = this.game.discardPile.length > 0 ? this.game.discardPile[this.game.discardPile.length - 1] : null;
    var mem = this.botMemory.get(playerId);

    this.io.to(this.lobbyCode).emit('card_drawn', { card: result.card, playerId: playerId, faceUp: false });
    this.broadcastGameState();

    var canPlay = false;
    for (var i = 0; i < player.hand.length; i++) {
      if (player.hand[i].rank === 'joker' || (topCard && (player.hand[i].suit === topCard.suit || player.hand[i].rank === topCard.rank))) {
        if (!this.isCardBanned(player.hand[i], mem)) {
          canPlay = true;
          break;
        }
      }
    }

    if (canPlay && Math.random() < 0.7) {
      var self2 = this;
      setTimeout(function() {
        self2.processBotTurn(playerId);
      }, 500);
    } else {
      this.botEndTurn(playerId);
    }
  }

  botDrawOrEnd(playerId) {
    var player = this.game.getPlayer(playerId);
    if (!player) return;
    if (this.game.deck.length > 0) {
      this.botDraw(playerId);
    } else {
      this.botEndTurn(playerId);
    }
  }

  botEndTurn(playerId) {
    var result = this.game.endTurn(playerId);
    if (!result.success) return;
    var game = this.game;
    var io = this.io;
    var code = this.lobbyCode;
    this.broadcastGameState();
    io.to(code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
    var next = game.getCurrentPlayer();
    if (next && this.isBotPlayer(next.id)) {
      this.scheduleBotTurn(next.id);
    }
  }

  _conditionsMatch(conditions, card) {
    if (!conditions || conditions.length === 0) return true;
    for (var j = 0; j < conditions.length; j++) {
      var c = conditions[j];
      if (c.type === 'specific_suit' && c.params.suit !== card.suit) return false;
      if (c.type === 'specific_rank' && c.params.rank !== card.rank) return false;
      if (c.type === 'red_black') {
        var isRed = card.suit === 'hearts' || card.suit === 'diamonds';
        if (c.params.color === 'black' && !(card.suit === 'clubs' || card.suit === 'spades')) return false;
        if (c.params.color === 'red' && !isRed) return false;
      }
    }
    return true;
  }

  _cardMatchesRule(rule, card) {
    if (rule.orConditions && rule.orConditions.length > 0) {
      for (var i = 0; i < rule.orConditions.length; i++) {
        if (this._conditionsMatch(rule.orConditions[i], card)) return true;
      }
      return false;
    }
    return this._conditionsMatch(rule.conditions, card);
  }

  _suitInSet(suit, setName) {
    var set = SUIT_SETS_BOT[setName];
    if (!set) return false;
    return set.indexOf(suit) !== -1;
  }

  _triggerMatches(rule, card, prevCard) {
    if (!rule.trigger) return this._cardMatchesRule(rule, card);
    if (rule.trigger.type === 'after_card_played' || rule.trigger.type === undefined) {
      return this._cardMatchesRule(rule, card);
    }
    if (rule.trigger.type === 'after_suit_change') {
      if (!prevCard) return false;
      var from = rule.trigger.params && rule.trigger.params.from;
      var to = rule.trigger.params && rule.trigger.params.to;
      if (!from || !to) return false;
      return this._suitInSet(prevCard.suit, from) && this._suitInSet(card.suit, to);
    }
    if (rule.trigger.type === 'numeric_offset') {
      if (!prevCard) return false;
      if (card.rank === 'joker' || prevCard.rank === 'joker') return false;
      var p = rule.trigger.params || {};
      var offset = p.offset || 1;
      var direction = p.direction || 'positive';
      var diff = (RANK_NUM[card.rank] || 0) - (RANK_NUM[prevCard.rank] || 0);
      var matchesOffset = false;
      if (direction === 'positive' || direction === 'both') {
        if (diff === offset) matchesOffset = true;
      }
      if (direction === 'negative' || direction === 'both') {
        if (diff === -offset) matchesOffset = true;
      }
      if (!matchesOffset) return false;
      var sc = p.suitConstraint || 'any';
      if (sc === 'same_suit') return card.suit === prevCard.suit;
      if (sc === 'same_color') {
        var cardRed = card.suit === 'hearts' || card.suit === 'diamonds';
        var prevRed = prevCard.suit === 'hearts' || prevCard.suit === 'diamonds';
        return cardRed === prevRed;
      }
      if (sc === 'diff_color') {
        var cardRed2 = card.suit === 'hearts' || card.suit === 'diamonds';
        var prevRed2 = prevCard.suit === 'hearts' || prevCard.suit === 'diamonds';
        return cardRed2 !== prevRed2;
      }
      if (sc === 'specific') {
        var suits = p.specificSuits || [];
        return suits.indexOf(card.suit) !== -1;
      }
      return true;
    }
    return this._cardMatchesRule(rule, card);
  }

  observePlay(playerId, card) {
    var rules = this.game.rules;
    var pile = this.game.discardPile;
    var prevCard = pile.length >= 2 ? pile[pile.length - 2] : null;
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (r.type !== 'block') continue;
      if (!this._triggerMatches(r, card, prevCard)) continue;
      for (var k = 0; k < this.game.players.length; k++) {
        var p = this.game.players[k];
        if (!p.isBot) continue;
        this.learnRule(p.id, r, card);
      }
    }
  }

  learnRule(botId, rule, card) {
    var mem = this.botMemory.get(botId);
    if (!mem) return;
    var stats = mem.stats;
    if (Math.random() > stats.detectChance) return;

    for (var i = 0; i < rule.actions.length; i++) {
      var a = rule.actions[i];
      var existing = null;
      for (var j = 0; j < mem.knownRules.length; j++) {
        if (mem.knownRules[j].actionType === a.type) {
          existing = mem.knownRules[j];
          break;
        }
      }

      if (existing) {
        existing.confidence = Math.min(1, existing.confidence + 0.2);
        existing.lastSeen = Date.now();
      } else {
        mem.knownRules.push({
          actionType: a.type,
          params: a.params,
          conditions: rule.conditions,
          confidence: 0.3,
          lastSeen: Date.now()
        });
      }
    }

    this.forgetOldRules(mem, stats);
  }

  forgetOldRules(mem, stats) {
    for (var i = mem.knownRules.length - 1; i >= 0; i--) {
      if (Math.random() < stats.forgetChance) {
        mem.knownRules[i].confidence -= 0.15;
        if (mem.knownRules[i].confidence <= 0) {
          mem.knownRules.splice(i, 1);
        }
      }
    }
  }

  getBotMemory(botId) {
    var mem = this.botMemory.get(botId);
    if (!mem) return { knownRules: [] };
    return {
      knownRules: mem.knownRules.map(function(r) {
        return { actionType: r.actionType, confidence: Math.round(r.confidence * 100) / 100 };
      })
    };
  }

  broadcastGameState() {
    for (var i = 0; i < this.game.players.length; i++) {
      var p = this.game.players[i];
      var fullState = this.game.getFullState(p.id);
      this.io.to(p.id).emit('game_state', fullState);
    }
  }

  triggerBotTurns() {
    var current = this.game.getCurrentPlayer();
    if (current && this.isBotPlayer(current.id)) {
      this.scheduleBotTurn(current.id, 500);
    }
  }

  onPunishmentRequest(data) {
    var self = this;
    setTimeout(function() {
      var botVoteCount = 0;
      for (var i = 0; i < self.game.players.length; i++) {
        var p = self.game.players[i];
        if (!p.isBot) continue;
        if (p.id === data.accuserId || p.id === data.targetId) continue;
        if (self.botVote(p.id, data.id)) botVoteCount++;
      }

      var punish = self.game.punishments.find(function(p) { return p.id === data.id && !p.resolved; });
      if (!punish) return;
      var remainingEligible = self.game.players.filter(function(pl) {
        if (pl.id === data.accuserId || pl.id === data.targetId) return false;
        return !punish.votes[pl.id];
      });
      var allBotsRemaining = remainingEligible.length > 0 && remainingEligible.every(function(pl) { return pl.isBot; });
      if (allBotsRemaining || remainingEligible.length === 0) {
        var resolved = self.game.resolvePunishment(data.id);
        if (resolved) {
          self.io.to(self.lobbyCode).emit('punishment_result', resolved);
          self.broadcastGameState();
        }
      }
    }, 1000 + Math.random() * 2000);
  }

  botVote(botId, punishmentId) {
    var mem = this.botMemory.get(botId);
    if (!mem) return false;
    var stats = mem.stats;
    var result = this.game.votePunishment(punishmentId, botId, Math.random() < stats.voteCorrect);
    if (!result.success) return false;

    var punish = this.game.punishments.find(function(p) { return p.id === punishmentId; });
    if (!punish) return false;
    var votesIn = Object.keys(punish.votes).length;
    var eligibleCount = this.game.players.filter(
      p => p.id !== punish.accuserId && p.id !== punish.targetId
    ).length;

    this.io.to(this.lobbyCode).emit('punishment_vote', {
      punishmentId: punishmentId,
      votesFor: Object.values(punish.votes).filter(v => v).length,
      votesAgainst: Object.values(punish.votes).filter(v => !v).length,
      totalVotes: votesIn,
      eligibleCount: eligibleCount
    });

    return true;
  }

  onRoundEnd() {
    var self = this;
    var round = self.game.round;
    setTimeout(function() {
      if (!self.game.lastWinner || !self.isBotPlayer(self.game.lastWinner.id)) return;
      if (self.game.round !== round) return;
      var rules = self.botPlayers.size;
      var botActions = ['skip_player', 'reverse', 'double_turn', 'change_suit', 'knock'];
      var botSuits = ['any', 'spades', 'clubs', 'diamonds', 'hearts'];
      var botRanks = ['any', 'king', 'queen', 'jack', 'ace', '7'];

      var action = botActions[Math.floor(Math.random() * botActions.length)];
      var suit = botSuits[Math.floor(Math.random() * botSuits.length)];
      var rank = botRanks[Math.floor(Math.random() * botRanks.length)];

      var orConditions = [];
      if (suit !== 'any') {
        var conds = [];
        if (suit === 'red suits') {
          conds.push({ type: 'red_black', params: { color: 'red' } });
        } else if (suit === 'black suits') {
          conds.push({ type: 'red_black', params: { color: 'black' } });
        } else {
          conds.push({ type: 'specific_suit', params: { suit: suit } });
        }
        orConditions.push(conds);
      }
      if (rank !== 'any') {
        var conds = [];
        conds.push({ type: 'specific_rank', params: { rank: rank } });
        orConditions.push(conds);
      }
      // If both suit and rank are specified, combine into one group
      if (suit !== 'any' && rank !== 'any' && orConditions.length === 2) {
        var combinedGroup = [];
        var suitCond = orConditions[0][0];
        var rankCond = orConditions[1][0];
        combinedGroup.push(suitCond);
        combinedGroup.push(rankCond);
        orConditions = [combinedGroup];
      }

      var simpleActions = {
        skip_player: { mapType: 'skip_turn', targets: ['next', 'prev', 'that'], timing: true },
        reverse: { mapType: 'reverse_direction', targets: [], timing: true },
        double_turn: { mapType: 'play_again', targets: ['that', 'next'], timing: true },
        change_suit: { mapType: 'change_active_suit', targets: ['that', 'next'], timing: true, params: { suit: ['clubs','diamonds','hearts','spades'][Math.floor(Math.random()*4)] } },
        knock: { mapType: 'knock_on_table', targets: ['that', 'next', 'prev'], timing: true, params: { count: Math.floor(Math.random() * self.game.players.length) + 1 } }
      };

      var sa = simpleActions[action];
      var actionObj = { type: sa.mapType, params: { target: sa.targets[0] || '', timing: sa.timing ? 'now' : '' } };
      if (sa.params) {
        for (var key in sa.params) actionObj.params[key] = sa.params[key];
      }

      // 15% chance for suit-change, 15% for numeric offset, 70% standard
      var triggerRand = Math.random();
      var trigger = { type: 'after_card_played', params: {} };

      if (triggerRand < 0.15) {
        // Suit change trigger
        var botSuitKeys = ['any', 'black', 'red', 'spades', 'clubs', 'diamonds', 'hearts'];
        var botSuitSets = {
          any: ['spades', 'clubs', 'diamonds', 'hearts'],
          black: ['spades', 'clubs'],
          red: ['diamonds', 'hearts'],
          spades: ['spades'],
          clubs: ['clubs'],
          diamonds: ['diamonds'],
          hearts: ['hearts']
        };
        var fromSuit = botSuitKeys[Math.floor(Math.random() * botSuitKeys.length)];
        var toSuit;
        do {
          toSuit = botSuitKeys[Math.floor(Math.random() * botSuitKeys.length)];
        } while (botSuitSets[fromSuit].some(function(s) { return botSuitSets[toSuit].indexOf(s) !== -1; }));
        trigger = { type: 'after_suit_change', params: { from: fromSuit, to: toSuit } };
      } else if (triggerRand < 0.3) {
        // Numeric offset trigger
        var botDirections = ['positive', 'negative', 'both'];
        var botSuits = ['any', 'same_suit', 'same_color', 'diff_color'];
        var offset = Math.floor(Math.random() * 5) + 1;
        var direction = botDirections[Math.floor(Math.random() * botDirections.length)];
        var suitConstraint = botSuits[Math.floor(Math.random() * botSuits.length)];
        trigger = {
          type: 'numeric_offset',
          params: {
            offset: offset,
            direction: direction,
            suitConstraint: suitConstraint,
            specificSuits: []
          }
        };
      }

      var name = 'Bot Rule ' + (self.game.rules.length + 1);
      var rule = {
        name: name,
        trigger: trigger,
        conditions: [],
        orConditions: orConditions.length > 0 ? orConditions : undefined,
        actions: [actionObj],
        type: 'block',
        createdBy: self.game.lastWinner.nickname,
        createdById: self.game.lastWinner.id,
        round: self.game.round,
        hidden: true
      };

      self.game.addRule(rule);
      self.broadcastGameState();
      self.io.to(self.lobbyCode).emit('rule_created_notification', {
        round: self.game.round,
        ruleCount: self.game.rules.length,
        creatorId: self.game.lastWinner.id
      });
    }, 2000 + Math.random() * 3000);
  }

  onCardPlayed(playerId, card) {
    this._punishingPlay = false;
    for (var i = 0; i < this.game.players.length; i++) {
      var p = this.game.players[i];
      if (!p.isBot) continue;
      this.learnFromPlay(p.id, playerId, card);
    }

    // Built-in base rule: card must match the previous top card's suit or rank
    // Only one bot punishes per violation (first detector)
    var pile = this.game.discardPile;
    if (pile.length >= 2) {
      var prevCard = pile[pile.length - 2];
      var matchesSuitOrRank = prevCard && (
        card.suit === prevCard.suit || card.rank === prevCard.rank ||
        card.rank === 'joker' || prevCard.rank === 'joker'
      );
      if (prevCard && !matchesSuitOrRank && !this._punishingPlay) {
        this._punishingPlay = true;
        var punisherId = null;
        for (var i = 0; i < this.game.players.length; i++) {
          var p = this.game.players[i];
          if (!p.isBot || p.id === playerId) continue;
          var mem = this.botMemory.get(p.id);
          if (!mem) continue;
          if (Math.random() < mem.stats.detectChance * 0.7) {
            punisherId = p.id;
            break;
          }
        }
        if (punisherId) {
          var self = this;
          var capturedTargetId = playerId;
          setTimeout(function() {
            self._punishingPlay = false;
            if (self.game.state !== 'playing') return;
            var result = self.game.badCardPunish(punisherId, capturedTargetId);
            if (result.success) {
              self.io.to(self.lobbyCode).emit('player_punished', result);
              self.broadcastGameState();
            }
          }, 500 + Math.random() * 1500);
        } else {
          this._punishingPlay = false;
        }
      }
    }
  }

  learnFromPlay(botId, playerId, card) {
    var mem = this.botMemory.get(botId);
    if (!mem) return;
    var stats = mem.stats;
    var pile = this.game.discardPile;
    var prevCard = pile.length >= 2 ? pile[pile.length - 2] : null;

    for (var i = 0; i < this.game.rules.length; i++) {
      var r = this.game.rules[i];
      if (r.type !== 'block') continue;
      if (!this._triggerMatches(r, card, prevCard)) continue;

      if (Math.random() > stats.detectChance) continue;

      var alreadyKnown = false;
      for (var k = 0; k < mem.knownRules.length; k++) {
        if (mem.knownRules[k].actionType === r.actions[0].type) {
          alreadyKnown = true;
          mem.knownRules[k].confidence = Math.min(1, mem.knownRules[k].confidence + 0.2);
          mem.knownRules[k].lastSeen = Date.now();
          break;
        }
      }
      if (!alreadyKnown) {
        mem.knownRules.push({
          actionType: r.actions[0].type,
          params: r.actions[0].params,
          conditions: r.conditions,
          confidence: 0.3,
          lastSeen: Date.now()
        });
      }

      if (playerId === botId) continue;
      if (this._punishingPlay) break;
      if (Math.random() > stats.detectChance * 0.7) continue;
      if (this.game.state !== 'playing') return;

      this._punishingPlay = true;
      var self = this;
      (function(botId, targetId) {
        setTimeout(function() {
          self._punishingPlay = false;
          if (self.game.state !== 'playing') return;
          var result = self.game.simplePunish(botId, targetId);
          if (result.success) {
            self.io.to(self.lobbyCode).emit('player_punished', result);
            self.broadcastGameState();
          }
        }, 500 + Math.random() * 1500);
      })(botId, playerId);
    }

    this.forgetOldRules(mem, stats);
  }
}

module.exports = { BotController };
