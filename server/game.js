const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

const SUIT_SETS = {
  any: new Set(['spades', 'clubs', 'diamonds', 'hearts']),
  black: new Set(['spades', 'clubs']),
  red: new Set(['diamonds', 'hearts']),
  spades: new Set(['spades']),
  clubs: new Set(['clubs']),
  diamonds: new Set(['diamonds']),
  hearts: new Set(['hearts'])
};

const TRIGGER_DEFS = [
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
  { type: 'after_suit_change', name: 'Suit changes', desc: 'suit changes from {from} to {to}', params: [
    { name: 'from', label: 'From', type: 'select', options: ['any', 'black', 'red', 'spades', 'clubs', 'diamonds', 'hearts'] },
    { name: 'to', label: 'To', type: 'select', options: ['any', 'black', 'red', 'spades', 'clubs', 'diamonds', 'hearts'] }
  ] },
  { type: 'numeric_offset', name: 'Numeric offset play', desc: 'offset play ±{offset} ({suitConstraint})', params: [
    { name: 'offset', label: 'Offset', type: 'number', min: 1, max: 13 },
    { name: 'direction', label: 'Direction', type: 'select', options: ['positive', 'negative', 'both'] },
    { name: 'suitConstraint', label: 'Suit', type: 'select', options: ['any', 'same_suit', 'same_color', 'diff_color', 'specific'] }
  ] },
];

const CONDITION_DEFS = [
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
  { type: 'consecutive_cards', name: 'Consecutive cards played', desc: 'at least {count} cards are played in a row', params: [
    { name: 'count', label: 'Count', type: 'number', min: 2, max: 10 }
  ]},
  { type: 'repeated_actions', name: 'Same action repeated', desc: 'same action is repeated {count} times', params: [
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

const ACTION_DEFS = [
  { type: 'force_draw_cards', name: 'Force draw cards', desc: 'force them to draw {count} cards', params: [
    { name: 'count', label: 'Cards to draw', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'skip_turn', name: 'Skip their turn', desc: 'skip their next turn', params: [] },
  { type: 'reverse_direction', name: 'Reverse turn order', desc: 'reverse turn order', params: [] },
  { type: 'must_say_phrase', name: 'Make them say...', desc: 'make them say "{phrase}"', params: [
    { name: 'phrase', label: 'Required phrase', type: 'string' }
  ]},
  { type: 'cannot_say_phrase', name: 'Forbid a word', desc: 'forbid saying "{phrase}"', params: [
    { name: 'phrase', label: 'Forbidden phrase', type: 'string' }
  ]},
  { type: 'punish_player', name: 'Give penalty cards', desc: 'give them {count} penalty card(s)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'punish_everyone', name: 'Punish everyone', desc: 'give everyone {count} penalty card(s)', params: [
    { name: 'count', label: 'Cards to give', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'reveal_card', name: 'Reveal their card', desc: 'reveal a random card from their hand', params: [] },
  { type: 'mute_player', name: 'Mute for some turns', desc: 'mute them for {turns} turn(s)', params: [
    { name: 'turns', label: 'Number of turns', type: 'number', min: 1, max: 10 }
  ]},
  { type: 'change_active_suit', name: 'Change suit to...', desc: 'change active suit to {suit}', params: [
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
  { type: 'knock_on_table', name: 'Knock on table', desc: 'knock on the table {count} times', params: [
    { name: 'count', label: 'Times', type: 'number', min: 1, max: 10 }
  ] },
];

class Game {
  constructor(lobby, options) {
    options = options || {};
    this.deckCount = options.deckCount || 2;
    this.lobby = lobby;
    this.players = lobby.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      hand: [],
      isConnected: true,
      isBot: p.isBot || false,
      botLevel: p.botLevel || null
    }));
    this.deck = [];
    this.discardPile = [];
    this.currentTurnIndex = 0;
    this.turnDirection = 1;
    this.state = 'playing';
    this.punishments = [];
    this.punishmentIdCounter = 0;
    this.chatHistory = [];
    this.rules = [];
    this.round = 1;
    this.lastWinner = null;
    this.lastPlayedAt = {};
    this.lastSimplePunish = {};
    this.lastPlayedById = null;
    this.initDeck();
    this.dealCards();
  }

  initDeck() {
    this.deck = [];
    for (let d = 0; d < this.deckCount; d++) {
      for (const suit of SUITS) {
        for (const rank of RANKS) {
          this.deck.push({ rank, suit });
        }
      }
      this.deck.push({ rank: 'joker', color: 'black' });
      this.deck.push({ rank: 'joker', color: 'red' });
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  dealCards() {
    for (let i = 0; i < 5; i++) {
      for (const player of this.players) {
        if (this.deck.length > 0) {
          player.hand.push(this.deck.pop());
        }
      }
    }
    if (this.deck.length > 0) {
      this.discardPile.push(this.deck.pop());
    }
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId);
  }

  getCurrentPlayer() {
    return this.players[this.currentTurnIndex];
  }

  playCard(playerId, cardIndex) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };
    if (cardIndex < 0 || cardIndex >= player.hand.length) return { success: false, error: 'Invalid card index' };

    const now = Date.now();
    const last = this.lastPlayedAt[playerId] || 0;
    if (now - last < 500) return { success: false, error: 'Wait before playing again' };
    this.lastPlayedAt[playerId] = now;

    const card = player.hand.splice(cardIndex, 1)[0];
    this.discardPile.push(card);
    this.lastPlayedById = player.id;

    let winner = null;
    if (player.hand.length === 0) {
      winner = { id: player.id, nickname: player.nickname };
      this.lastWinner = player;
      this.state = 'round_end';
    }

    this.advanceTurn();
    return { success: true, card, winner };
  }

  drawCard(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    if (this.deck.length === 0) {
      if (this.discardPile.length <= 1) return { success: false, error: 'Deck is empty' };
      const topCard = this.discardPile.pop();
      this.deck = this.discardPile;
      this.discardPile = [topCard];
      this.shuffle();
    }

    const card = this.deck.pop();
    player.hand.push(card);
    return { success: true, card };
  }

  endTurn(playerId) {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };
    this.advanceTurn();
    return { success: true };
  }

  advanceTurn() {
    this.currentTurnIndex = (
      this.currentTurnIndex + this.turnDirection + this.players.length
    ) % this.players.length;
  }

  addPlayer(playerId, nickname, isBot = false, botLevel = null) {
    const hand = [];
    for (let i = 0; i < 5; i++) {
      if (this.deck.length === 0) {
        if (this.discardPile.length <= 1) break;
        const topCard = this.discardPile.pop();
        this.deck = this.discardPile;
        this.discardPile = [topCard];
        this.shuffle();
      }
      hand.push(this.deck.pop());
    }
    const player = { id: playerId, nickname, hand, isConnected: true, isBot, botLevel };
    this.players.push(player);
    return player;
  }

  addRule(rule) {
    rule.hidden = rule.hidden !== false;
    this.rules.push(rule);
  }

  validateBlockRule(rule) {
    if (!rule || !rule.name || rule.name.trim().length === 0) return { valid: false, error: 'Rule must have a name' };
    if (rule.name.length > 60) return { valid: false, error: 'Rule name too long' };

    const triggerDef = TRIGGER_DEFS.find(t => t.type === rule.trigger?.type);
    if (!triggerDef) return { valid: false, error: 'Invalid trigger type' };

    if (rule.trigger.type === 'after_suit_change') {
      const from = rule.trigger.params?.from;
      const to = rule.trigger.params?.to;
      if (!from || !to) return { valid: false, error: 'Suit change must specify from and to' };
      if (!SUIT_SETS[from] || !SUIT_SETS[to]) return { valid: false, error: 'Invalid suit value' };
      const intersection = [...SUIT_SETS[from]].filter(s => SUIT_SETS[to].has(s));
      if (intersection.length > 0) return { valid: false, error: 'From and to suits cannot overlap' };
    }

    if (rule.trigger.type === 'numeric_offset') {
      const p = rule.trigger.params || {};
      if (typeof p.offset !== 'number' || p.offset < 1 || p.offset > 13) return { valid: false, error: 'Offset must be between 1 and 13' };
      if (!['positive', 'negative', 'both'].includes(p.direction)) return { valid: false, error: 'Invalid direction' };
      if (!['any', 'same_suit', 'same_color', 'diff_color', 'specific'].includes(p.suitConstraint)) return { valid: false, error: 'Invalid suit constraint' };
      if (p.suitConstraint === 'specific') {
        if (!Array.isArray(p.specificSuits) || p.specificSuits.length === 0) return { valid: false, error: 'Must specify at least one suit' };
        for (const s of p.specificSuits) {
          if (!SUITS.includes(s)) return { valid: false, error: 'Invalid specific suit' };
        }
      }
    }

    if (!rule.actions || rule.actions.length === 0) return { valid: false, error: 'At least one action is required' };
    if (rule.actions.length > 5) return { valid: false, error: 'Too many actions (max 5)' };

    for (const action of rule.actions) {
      const def = ACTION_DEFS.find(a => a.type === action.type);
      if (!def) return { valid: false, error: `Invalid action type: ${action.type}` };

      if (action.type === 'knock_on_table') {
        const count = action.params?.count;
        if (typeof count !== 'number' || count < 1 || count > this.players.length) {
          return { valid: false, error: `Knock count must be between 1 and ${this.players.length}` };
        }
      }
    }

    if (rule.conditions) {
      if (rule.conditions.length > 5) return { valid: false, error: 'Too many conditions (max 5)' };
      for (const cond of rule.conditions) {
        const def = CONDITION_DEFS.find(c => c.type === cond.type);
        if (!def) return { valid: false, error: `Invalid condition type: ${cond.type}` };
      }
    }
    if (rule.orConditions) {
      if (rule.orConditions.length > 10) return { valid: false, error: 'Too many trigger groups (max 10)' };
      for (const group of rule.orConditions) {
        if (!Array.isArray(group)) return { valid: false, error: 'Invalid trigger group' };
        if (group.length > 5) return { valid: false, error: 'Too many conditions in a group (max 5)' };
        for (const cond of group) {
          const def = CONDITION_DEFS.find(c => c.type === cond.type);
          if (!def) return { valid: false, error: `Invalid condition type: ${cond.type}` };
        }
      }
    }

    return { valid: true };
  }

  newRound() {
    const allCards = [];
    for (const p of this.players) {
      allCards.push(...p.hand);
      p.hand = [];
    }
    allCards.push(...this.discardPile);
    allCards.push(...this.deck);
    this.discardPile = [];
    this.deck = allCards;
    this.shuffle();
    this.dealCards();
    this.currentTurnIndex = 0;
    this.state = 'playing';
    this.punishments = [];
    this.punishmentIdCounter = 0;
    this.lastSimplePunish = {};
    this.round++;
  }

  createPunishment(accuserId, targetId, reason, amount) {
    this.punishmentIdCounter++;
    const punishment = {
      id: `punish-${this.punishmentIdCounter}`,
      accuserId,
      targetId,
      reason,
      amount: Math.max(1, Math.min(amount, 10)),
      votes: {},
      resolved: false,
      approved: false,
      result: null
    };
    this.punishments.push(punishment);
    return punishment;
  }

  votePunishment(punishmentId, voterId, approve) {
    const punishment = this.punishments.find(p => p.id === punishmentId && !p.resolved);
    if (!punishment) return { success: false, error: 'Punishment not found or already resolved' };
    if (voterId === punishment.accuserId || voterId === punishment.targetId) {
      return { success: false, error: 'Accuser and target cannot vote' };
    }
    if (punishment.votes[voterId] !== undefined) {
      return { success: false, error: 'Already voted' };
    }
    punishment.votes[voterId] = approve;
    return { success: true, punishment };
  }

  resolvePunishment(punishmentId) {
    const punishment = this.punishments.find(p => p.id === punishmentId && !p.resolved);
    if (!punishment) return null;

    const eligibleVoters = this.players.filter(p =>
      p.id !== punishment.accuserId && p.id !== punishment.targetId
    );
    const totalEligible = eligibleVoters.length;
    const votesFor = Object.values(punishment.votes).filter(v => v === true).length;
    const votesAgainst = Object.values(punishment.votes).filter(v => v === false).length;

    if (totalEligible === 0) {
      punishment.approved = true;
    } else {
      punishment.approved = votesFor > votesAgainst;
    }

    punishment.resolved = true;

    let targetPlayer;
    const drawn = [];
    if (punishment.approved) {
      targetPlayer = this.getPlayer(punishment.targetId);
      for (let i = 0; i < punishment.amount && this.deck.length > 0; i++) {
        const card = this.deck.pop();
        targetPlayer.hand.push(card);
        drawn.push(card);
      }
      punishment.result = {
        approved: true,
        targetId: punishment.targetId,
        amount: punishment.amount,
        drawn
      };
    } else {
      targetPlayer = this.getPlayer(punishment.accuserId);
      for (let i = 0; i < punishment.amount && this.deck.length > 0; i++) {
        const card = this.deck.pop();
        targetPlayer.hand.push(card);
        drawn.push(card);
      }
      punishment.result = {
        approved: false,
        targetId: punishment.accuserId,
        amount: punishment.amount,
        drawn
      };
    }
    return punishment.result;
  }

  checkPunishmentReady(punishmentId) {
    const punishment = this.punishments.find(p => p.id === punishmentId && !p.resolved);
    if (!punishment) return null;

    const eligibleVoters = this.players.filter(p =>
      p.id !== punishment.accuserId && p.id !== punishment.targetId
    );
    return Object.keys(punishment.votes).length >= eligibleVoters.length;
  }

  _cardMatchesAnyRule(card) {
    for (const r of this.rules) {
      if (r.type !== 'block') continue;
      if (r.trigger && r.trigger.type !== 'after_card_played') continue;
      const groups = r.orConditions && r.orConditions.length > 0 ? r.orConditions : (r.conditions ? [r.conditions] : []);
      for (const group of groups) {
        let match = true;
        for (const c of group) {
          if (c.type === 'specific_suit' && c.params.suit !== card.suit) { match = false; break; }
          if (c.type === 'specific_rank' && c.params.rank !== card.rank) { match = false; break; }
          if (c.type === 'red_black') {
            const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
            if (c.params.color === 'black' && isRed) { match = false; break; }
            if (c.params.color === 'red' && !isRed) { match = false; break; }
          }
        }
        if (match) return true;
      }
    }
    return false;
  }

  confusedPunish(accuserId) {
    if (this.state !== 'playing') return { success: false, error: 'Game is not in play' };
    const results = [];
    for (const p of this.players) {
      if (p.id === accuserId) continue;
      for (const card of p.hand) {
        if (this._cardMatchesAnyRule(card)) {
          if (this.deck.length === 0) break;
          const res = this.simplePunish(accuserId, p.id);
          if (res.success) results.push({ targetId: p.id, card: res.card });
          break;
        }
      }
    }
    return { success: true, results };
  }

  simplePunish(accuserId, targetId) {
    const accuser = this.getPlayer(accuserId);
    const target = this.getPlayer(targetId);
    if (!accuser || !target) return { success: false, error: 'Player not found' };
    if (this.deck.length === 0) return { success: false, error: 'Deck is empty' };

    const card = this.deck.pop();
    target.hand.push(card);

    this.lastSimplePunish[targetId] = {
      punisherId: accuserId,
      card: card,
      timestamp: Date.now()
    };

    return { success: true, card, targetId, punisherId: accuserId };
  }

  badCardPunish(accuserId, targetId) {
    if (!targetId) targetId = this.lastPlayedById;
    if (!targetId) return { success: false, error: 'No card has been played yet' };
    if (accuserId === targetId) return { success: false, error: 'Cannot punish yourself' };
    if (this.discardPile.length === 0) return { success: false, error: 'Discard pile is empty' };

    const target = this.getPlayer(targetId);
    const accuser = this.getPlayer(accuserId);
    if (!target || !accuser) return { success: false, error: 'Player not found' };
    if (this.deck.length === 0) return { success: false, error: 'Deck is empty' };

    // Return the played card from discard pile to target's hand
    const playedCard = this.discardPile.pop();
    target.hand.push(playedCard);

    // Draw a penalty card from deck
    const penaltyCard = this.deck.pop();
    target.hand.push(penaltyCard);

    // Set up punish back chain on the penalty card
    this.lastSimplePunish[targetId] = {
      punisherId: accuserId,
      card: penaltyCard,
      timestamp: Date.now()
    };

    return {
      success: true,
      type: 'bad_card',
      playedCard,
      penaltyCard,
      targetId,
      punisherId: accuserId
    };
  }

  backToDeck(playerId) {
    const punishData = this.lastSimplePunish[playerId];
    if (!punishData) return { success: false, error: 'No punishment to reverse' };

    const player = this.getPlayer(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const cardIndex = player.hand.length - 1;
    if (cardIndex < 0) {
      delete this.lastSimplePunish[playerId];
      return { success: false, error: 'Card no longer in hand' };
    }

    const card = player.hand.splice(cardIndex, 1)[0];

    // Insert at random position in deck, not on top
    const insertIndex = Math.floor(Math.random() * (this.deck.length + 1));
    this.deck.splice(insertIndex, 0, card);

    delete this.lastSimplePunish[playerId];

    return { success: true, card, playerId };
  }

  punishBack(victimId) {
    const punishData = this.lastSimplePunish[victimId];
    if (!punishData) return { success: false, error: 'No punishment to reverse' };

    const victim = this.getPlayer(victimId);
    const punisher = this.getPlayer(punishData.punisherId);
    if (!victim || !punisher) return { success: false, error: 'Player not found' };

    const cardIndex = victim.hand.length - 1;
    if (cardIndex < 0) {
      delete this.lastSimplePunish[victimId];
      return { success: false, error: 'Card no longer in hand' };
    }

    const card = victim.hand.splice(cardIndex, 1)[0];
    punisher.hand.push(card);

    // Set up reverse: original punisher can now punish back the original victim
    this.lastSimplePunish[punishData.punisherId] = {
      punisherId: victimId,
      card: card,
      timestamp: Date.now()
    };

    delete this.lastSimplePunish[victimId];

    return { success: true, card, victimId, punisherId: punishData.punisherId };
  }

  addChat(playerId, message) {
    const player = this.getPlayer(playerId);
    if (!player) return;
    this.chatHistory.push({
      playerId,
      nickname: player.nickname,
      message: message.substring(0, 200),
      timestamp: Date.now()
    });
    if (this.chatHistory.length > 100) {
      this.chatHistory.shift();
    }
  }

  getPublicState(forPlayerId) {
    return {
      players: this.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        handSize: p.hand.length,
        isConnected: p.isConnected,
        isCurrentTurn: this.getCurrentPlayer().id === p.id
      })),
      currentTurn: this.getCurrentPlayer().id,
      turnDirection: this.turnDirection,
      deckSize: this.deck.length,
      discardTop: this.discardPile.length > 0
        ? this.discardPile[this.discardPile.length - 1] : null,
      state: this.state,
      round: this.round,
      rules: forPlayerId
        ? this.rules.map(r => {
            if (!r.hidden) return r;
            if (r.createdById === forPlayerId) return r;
            return { hidden: true, round: r.round, name: '???' };
          })
        : this.rules,
      punishments: this.punishments.filter(p => !p.resolved).map(p => ({
        id: p.id,
        accuserId: p.accuserId,
        targetId: p.targetId,
        reason: p.reason,
        amount: p.amount,
        voteCount: Object.keys(p.votes).length,
        eligibleCount: this.players.filter(
          pl => pl.id !== p.accuserId && pl.id !== p.targetId
        ).length
      })),
      chat: this.chatHistory.slice(-20)
    };
  }

  getFullState(forPlayerId) {
    const state = this.getPublicState(forPlayerId);
    const player = this.getPlayer(forPlayerId);
    if (player) {
      state.yourHand = player.hand;
    }
    state.discardPile = this.discardPile;
    return state;
  }

  playerDisconnected(playerId) {
    const player = this.getPlayer(playerId);
    if (player) player.isConnected = false;
  }

  playerReconnected(playerId) {
    const player = this.getPlayer(playerId);
    if (player) player.isConnected = true;
  }
}

module.exports = { Game, TRIGGER_DEFS, CONDITION_DEFS, ACTION_DEFS };