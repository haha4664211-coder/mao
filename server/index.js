const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { Lobby } = require('./lobby');
const { Game } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/cards', express.static(path.join(__dirname, '..', 'cards')));
app.use('/ui', express.static(path.join(__dirname, '..', 'ui')));
app.use(express.json());

let OPENROUTER_KEY = '';
try {
  const cfgPath = path.join(__dirname, '..', 'config.json');
  if (fs.existsSync(cfgPath)) {
    const config = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    OPENROUTER_KEY = Buffer.from(config.openrouter_key, 'base64').toString('utf-8');
    console.log('OpenRouter key loaded from config.json');
  }
} catch (e) {
  console.log('Failed to load config.json:', e.message);
}

const lobbies = new Map();

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (lobbies.has(code));
  return code;
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('create_lobby', ({ nickname }) => {
    const code = generateRoomCode();
    const lobby = new Lobby(code, socket.id, nickname);
    lobbies.set(code, lobby);

    socket.join(code);
    socket.emit('lobby_created', lobby.getPublicState());
    console.log(`Lobby ${code} created by ${nickname}`);
  });

  socket.on('join_lobby', ({ code, nickname }) => {
    const lobby = lobbies.get(code);
    if (!lobby) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (lobby.game) {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    if (lobby.players.length >= 8) {
      socket.emit('error', { message: 'Lobby is full' });
      return;
    }
    if (lobby.players.some(p => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      socket.emit('error', { message: 'Nickname already taken' });
      return;
    }

    lobby.addPlayer(socket.id, nickname);
    socket.join(code);
    socket.emit('lobby_joined', lobby.getPublicState());
    socket.to(code).emit('lobby_update', lobby.getPublicState());
    console.log(`${nickname} joined lobby ${code}`);
  });

  socket.on('toggle_ready', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || lobby.game) return;
    const player = lobby.getPlayer(socket.id);
    if (!player || player.isHost) return;
    lobby.setReady(socket.id, !player.isReady);
    io.to(lobby.code).emit('lobby_update', lobby.getPublicState());
  });

  socket.on('start_game', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby) return;
    if (lobby.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can start the game' });
      return;
    }
    if (lobby.players.length < 2) {
      socket.emit('error', { message: 'Need at least 2 players' });
      return;
    }

    const game = new Game(lobby);
    lobby.game = game;
    io.to(lobby.code).emit('game_started', game.getPublicState());
    for (const player of game.players) {
      const fullState = game.getFullState(player.id);
      io.to(player.id).emit('game_state', fullState);
    }
    io.to(lobby.code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
    console.log(`Game started in lobby ${lobby.code}`);
  });

  socket.on('play_card', ({ cardIndex }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const result = lobby.game.playCard(socket.id, cardIndex);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    broadcastGameState(game);
    io.to(lobby.code).emit('card_played', {
      playerId: socket.id,
      card: result.card
    });
    if (result.winner) {
      io.to(lobby.code).emit('round_won', {
        winnerId: result.winner.id,
        winnerNickname: result.winner.nickname,
        round: game.round
      });
    } else {
      io.to(lobby.code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
    }
  });

  socket.on('draw_card', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const result = lobby.game.drawCard(socket.id);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    socket.emit('card_drawn', { card: result.card });
    broadcastGameState(game);
  });

  socket.on('punish_player', ({ targetId }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    if (targetId === socket.id) {
      socket.emit('error', { message: 'Cannot punish yourself' });
      return;
    }
    const result = lobby.game.simplePunish(socket.id, targetId);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    io.to(lobby.code).emit('player_punished', result);
    broadcastGameState(game);
  });

  socket.on('punish_back', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const result = lobby.game.punishBack(socket.id);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    io.to(lobby.code).emit('punish_back_result', result);
    broadcastGameState(game);
  });

  socket.on('end_turn', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const result = lobby.game.endTurn(socket.id);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    broadcastGameState(game);
    io.to(lobby.code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
  });

  socket.on('submit_punishment', ({ targetId, reason, amount }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    if (targetId === socket.id) {
      socket.emit('error', { message: 'Cannot punish yourself' });
      return;
    }
    const target = lobby.game.getPlayer(targetId);
    if (!target) {
      socket.emit('error', { message: 'Target player not found' });
      return;
    }
    const punishment = lobby.game.createPunishment(
      socket.id, targetId, reason || 'No reason given', amount || 1
    );
    io.to(lobby.code).emit('punishment_request', {
      id: punishment.id,
      accuserId: socket.id,
      targetId,
      reason: punishment.reason,
      amount: punishment.amount,
      accuserNickname: lobby.game.getPlayer(socket.id).nickname,
      targetNickname: target.nickname
    });
  });

  socket.on('vote_punishment', ({ punishmentId, approve }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const result = lobby.game.votePunishment(punishmentId, socket.id, approve);
    if (!result.success) {
      socket.emit('error', { message: result.error });
      return;
    }
    const game = lobby.game;
    const punish = game.punishments.find(p => p.id === punishmentId);
    const eligibleCount = game.players.filter(
      p => p.id !== punish.accuserId && p.id !== punish.targetId
    ).length;
    const votesIn = Object.keys(punish.votes).length;

    io.to(lobby.code).emit('punishment_vote', {
      punishmentId,
      votesFor: Object.values(punish.votes).filter(v => v).length,
      votesAgainst: Object.values(punish.votes).filter(v => !v).length,
      totalVotes: votesIn,
      eligibleCount
    });

    if (votesIn >= eligibleCount && eligibleCount > 0) {
      const resolved = game.resolvePunishment(punishmentId);
      if (resolved) {
        io.to(lobby.code).emit('punishment_result', resolved);
        broadcastGameState(game);
      }
    } else if (eligibleCount === 0) {
      const resolved = game.resolvePunishment(punishmentId);
      if (resolved) {
        io.to(lobby.code).emit('punishment_result', resolved);
        broadcastGameState(game);
      }
    }
  });

  socket.on('send_chat', ({ message }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    if (!message || !message.trim()) return;
    lobby.game.addChat(socket.id, message.trim());
    io.to(lobby.code).emit('chat_message', lobby.game.chatHistory.slice(-1)[0]);
  });

  socket.on('knock', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const player = lobby.game.players.find(function(p) { return p.id === socket.id; });
    if (!player) return;
    io.to(lobby.code).emit('knock', { nickname: player.nickname });
  });

  socket.on('kick_player', ({ targetId }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby) return;
    if (lobby.hostId !== socket.id) {
      socket.emit('error', { message: 'Only host can kick players' });
      return;
    }
    const kicked = lobby.kickPlayer(targetId);
    if (kicked) {
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.leave(lobby.code);
        targetSocket.emit('kicked');
      }
      io.to(lobby.code).emit('lobby_update', lobby.getPublicState());
      io.to(lobby.code).emit('player_kicked', { playerId: targetId });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    handleDisconnect(socket.id);
  });

  socket.on('submit_rule', async ({ description }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    if (lobby.game.state !== 'round_end') return;
    if (!lobby.game.lastWinner || lobby.game.lastWinner.id !== socket.id) {
      socket.emit('error', { message: 'Only the winner can create a rule' });
      return;
    }
    io.to(lobby.code).emit('rule_under_review');
    if (!OPENROUTER_KEY) {
      socket.emit('rule_evaluated', { valid: false, error: 'OpenRouter API key not set in config.json' });
      return;
    }
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000'
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-120b:free',
          messages: [
            {
              role: 'system',
              content: 'You are a rules interpreter for the card game Mao. The winner of each round creates a new hidden rule that other players must follow. Players describe rules in plain English, and you need to determine if the rule is a valid, understandable game rule for Mao.\n\nRespond with JSON in this exact format:\n- If you understand the rule: {"valid": true, "summary": "short rule description", "interpretation": "how this rule works in game terms"}\n- If you don\'t understand: {"valid": false, "error": "sorry i don\'t understand that"}\n\nValid rules are things like: playing restrictions ("only spades"), verbal requirements ("must say please"), action effects ("reverse on hearts"), timing rules ("draw 2 if you hesitate"), etc.\n\nExamples:\nInput: "You can only play red cards"\nOutput: {"valid": true, "summary": "only red cards allowed", "interpretation": "Players may only play hearts or diamonds. Playing clubs or spades is not allowed."}\n\nInput: "You must say thank you after drawing a card"\nOutput: {"valid": true, "summary": "say thank you after drawing", "interpretation": "After drawing a card from the deck, the player must say thank you aloud before ending their actions."}\n\nInput: "Blue cards are banned"\nOutput: {"valid": false, "error": "sorry i don\'t understand that"}'
            },
            { role: 'user', content: description }
          ]
        })
      });
      const data = await response.json();
      if (data.error) {
        socket.emit('rule_evaluated', { valid: false, error: 'OpenRouter API error: ' + (data.error.message || JSON.stringify(data.error)) });
        return;
      }
      const content = data.choices?.[0]?.message?.content || '';
      let parsed;
      try {
        parsed = JSON.parse(content);
      } catch (e) {
        socket.emit('rule_evaluated', { valid: false, error: 'sorry i don\'t understand that' });
        return;
      }
      socket.emit('rule_evaluated', parsed);
    } catch (e) {
      socket.emit('rule_evaluated', { valid: false, error: 'Failed to reach AI: ' + e.message });
    }
  });

  socket.on('confirm_rule', ({ rule }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    if (rule.revealed === undefined) {
      rule.hidden = false;
    } else {
      rule.hidden = !rule.revealed;
    }
    rule.createdById = socket.id;
    lobby.game.addRule(rule);
    broadcastGameState(lobby.game);
    io.to(lobby.code).emit('rule_created', {
      rule,
      round: lobby.game.round
    });
  });

  socket.on('submit_block_rule', ({ rule }) => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    const game = lobby.game;
    if (game.state !== 'round_end') return;
    if (!game.lastWinner || game.lastWinner.id !== socket.id) {
      socket.emit('error', { message: 'Only the winner can create a rule' });
      return;
    }
    const validation = game.validateBlockRule(rule);
    if (!validation.valid) {
      socket.emit('error', { message: validation.error });
      return;
    }
    const fullRule = {
      ...rule,
      type: 'block',
      createdBy: game.lastWinner.nickname,
      createdById: socket.id,
      round: game.round,
      hidden: true
    };
    game.addRule(fullRule);
    broadcastGameState(game);
    io.to(lobby.code).emit('rule_created_notification', {
      round: game.round,
      ruleCount: game.rules.length,
      creatorId: socket.id
    });
    io.to(socket.id).emit('rule_created_detail', {
      rule: fullRule,
      round: game.round
    });
  });

  socket.on('start_new_round', () => {
    const lobby = findLobbyByPlayer(socket.id);
    if (!lobby || !lobby.game) return;
    lobby.game.newRound();
    broadcastGameState(lobby.game);
    io.to(lobby.code).emit('new_round', {
      round: lobby.game.round
    });
  });

  socket.on('reconnect_game', ({ code, nickname }) => {
    const lobby = lobbies.get(code);
    if (!lobby || !lobby.game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    const player = lobby.game.players.find(p =>
      p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (!player) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }
    player.id = socket.id;
    player.isConnected = true;
    socket.join(code);
    const lobbyPlayer = lobby.players.find(p =>
      p.nickname.toLowerCase() === nickname.toLowerCase()
    );
    if (lobbyPlayer) lobbyPlayer.id = socket.id;
    const fullState = lobby.game.getFullState(socket.id);
    socket.emit('game_state', fullState);
    broadcastGameState(lobby.game);
  });
});

function findLobbyByPlayer(socketId) {
  for (const lobby of lobbies.values()) {
    if (lobby.players.some(p => p.id === socketId)) return lobby;
  }
  return null;
}

function broadcastGameState(game) {
  for (const player of game.players) {
    const fullState = game.getFullState(player.id);
    io.to(player.id).emit('game_state', fullState);
  }
}

function handleDisconnect(socketId) {
  for (const [code, lobby] of lobbies) {
    const playerIdx = lobby.players.findIndex(p => p.id === socketId);
    if (playerIdx === -1) continue;

    if (lobby.game) {
      lobby.game.playerDisconnected(socketId);
      broadcastGameState(lobby.game);
      io.to(code).emit('player_disconnected', { playerId: socketId });
      if (lobby.hostId === socketId && lobby.players.length > 1) {
        const newIdx = playerIdx === 0 ? 1 : 0;
        lobby.hostId = lobby.players[newIdx].id;
        lobby.players[newIdx].isHost = true;
        io.to(code).emit('host_migration', { newHostId: lobby.hostId });
      }
    } else {
      if (lobby.hostId === socketId && lobby.players.length > 1) {
        lobby.removePlayer(socketId);
        io.to(code).emit('lobby_update', lobby.getPublicState());
        io.to(code).emit('host_migration', { newHostId: lobby.hostId });
      } else if (lobby.players.length <= 1) {
        lobbies.delete(code);
        io.to(code).emit('lobby_closed');
      } else {
        lobby.removePlayer(socketId);
        io.to(code).emit('lobby_update', lobby.getPublicState());
      }
    }
    break;
  }
}

server.listen(PORT, () => {
  console.log(`MAO server running on http://localhost:${PORT}`);
  console.log(`Serving client from: ${path.join(__dirname, '..', 'client')}`);
});