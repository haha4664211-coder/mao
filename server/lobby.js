class Lobby {
  constructor(code, hostId, hostNickname) {
    this.code = code;
    this.hostId = hostId;
    this.players = [];
    this.game = null;
    this.addPlayer(hostId, hostNickname);
  }

  addPlayer(socketId, nickname) {
    const player = {
      id: socketId,
      nickname,
      isReady: false,
      isHost: this.players.length === 0
    };
    this.players.push(player);
    return player;
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.id === socketId);
    if (idx === -1) return null;
    const removed = this.players.splice(idx, 1)[0];
    if (this.hostId === socketId && this.players.length > 0) {
      this.hostId = this.players[0].id;
      this.players[0].isHost = true;
    }
    return removed;
  }

  getPlayer(socketId) {
    return this.players.find(p => p.id === socketId);
  }

  setReady(socketId, ready) {
    const player = this.getPlayer(socketId);
    if (player) player.isReady = ready;
  }

  allReady() {
    return this.players.length >= 2 && this.players.every(p => p.isReady);
  }

  getPublicState() {
    return {
      code: this.code,
      hostId: this.hostId,
      players: this.players.map(p => ({
        id: p.id,
        nickname: p.nickname,
        isReady: p.isReady,
        isHost: p.isHost
      }))
    };
  }

  kickPlayer(targetId) {
    return this.removePlayer(targetId);
  }
}

module.exports = { Lobby };