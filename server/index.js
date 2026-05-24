const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
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
    io.to(lobby.code).emit('turn_change', { playerId: game.getCurrentPlayer().id });
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
    }

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
    break;
  }
}

server.listen(PORT, () => {
  console.log(`MAO server running on http://localhost:${PORT}`);
  console.log(`Serving client from: ${path.join(__dirname, '..', 'client')}`);
});