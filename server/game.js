const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];

class Game {
  constructor(lobby) {
    this.lobby = lobby;
    this.players = lobby.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      hand: [],
      isConnected: true
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
    this.initDeck();
    this.dealCards();
  }

  initDeck() {
    this.deck = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.deck.push({ rank, suit });
      }
    }
    this.deck.push({ rank: 'joker', color: 'black' });
    this.deck.push({ rank: 'joker', color: 'red' });
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
    if (now - last < 3000) return { success: false, error: 'Wait before playing again' };
    this.lastPlayedAt[playerId] = now;

    const card = player.hand.splice(cardIndex, 1)[0];
    this.discardPile.push(card);

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
    if (this.deck.length === 0) return { success: false, error: 'Deck is empty' };

    const now = Date.now();
    const last = this.lastPlayedAt[playerId] || 0;
    if (now - last < 3000) return { success: false, error: 'Wait before drawing' };

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

  addRule(rule) {
    this.rules.push(rule);
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

  simplePunish(accuserId, targetId) {
    const accuser = this.getPlayer(accuserId);
    const target = this.getPlayer(targetId);
    if (!accuser || !target) return { success: false, error: 'Player not found' };
    if (this.deck.length === 0) return { success: false, error: 'Deck is empty' };

    const card = this.deck.pop();
    target.hand.push(card);

    this.lastSimplePunish = this.lastSimplePunish || {};
    this.lastSimplePunish[targetId] = {
      punisherId: accuserId,
      card: card,
      timestamp: Date.now()
    };

    return { success: true, card, targetId, punisherId: accuserId };
  }

  punishBack(victimId) {
    this.lastSimplePunish = this.lastSimplePunish || {};
    const punishData = this.lastSimplePunish[victimId];
    if (!punishData) return { success: false, error: 'No punishment to reverse' };

    const victim = this.getPlayer(victimId);
    const punisher = this.getPlayer(punishData.punisherId);
    if (!victim || !punisher) return { success: false, error: 'Player not found' };

    // The punishment card was pushed to the end of the hand
    const cardIndex = victim.hand.length - 1;
    if (cardIndex < 0) {
      delete this.lastSimplePunish[victimId];
      return { success: false, error: 'Card no longer in hand' };
    }

    const card = victim.hand.splice(cardIndex, 1)[0];
    punisher.hand.push(card);

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
      rules: this.rules,
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

module.exports = { Game };