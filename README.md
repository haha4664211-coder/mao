# MAO — Multiplayer Online Card Game

A private, friend-group implementation of the card game Mao where **rules are hidden** and **punishments are manual**. No bots, no matchmaking, no accounts — just a lobby code and your friends.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Enter a nickname, host a party, share the 6-digit code with friends.

## Project Structure

```
├── server/
│   ├── index.js       # Express + Socket.IO server, room/event handling
│   ├── lobby.js       # Lobby class (players, ready, host, kick)
│   └── game.js        # Game state (deck, turns, punishments, chat)
├── client/
│   ├── index.html     # Single-page app (menu, lobby, game screens)
│   ├── css/
│   │   └── style.css  # Dark card-table theme, glow effects, responsive
│   └── js/
│       ├── main.js       # Screen switching, init
│       ├── menu.js       # Host/join lobby UI
│       ├── lobby.js      # Player list, ready, kick, copy code
│       ├── game.js       # Game table, cards, punishment votes, sounds
│       ├── socket.js     # Socket.IO client, reconnection, toasts
│       └── particles.js  # Canvas particle system
├── cards/             # 54 playing card PNGs (loaded automatically)
├── ui/                # UI assets (background image)
└── package.json
```

## How to Play

### 1. Lobby
- **Host**: Enter a nickname → click HOST PARTY → share the 6-digit code
- **Join**: Enter a nickname → click JOIN PARTY → enter the code
- Host can **kick** players and **start** the game when everyone is ready
- Max 8 players per lobby

### 2. Gameplay
- Each player is dealt **5 cards**
- A turn order is shown visually, but **the game enforces no rules** — anyone can draw, play cards, or end the turn at any time
- The turn indicator and glow are purely informational
- **Click a card** in your hand to select it, **click again** to play it to the pile
- Click the **draw pile** or **DRAW button** to draw a card
- **END TURN** advances the visual turn indicator

### 3. Rules & Punishment (The Core Mechanic)
Since Mao is a game of **hidden rules**, there is no automatic rule enforcement. Players enforce rules themselves:

1. Press the **CONFUSED!** button when you believe someone broke a rule
2. Select the **accused player**, write the **reason**, and set the **penalty** (default 1 card)
3. All other players vote **GUILTY** or **INNOCENT**
4. If majority votes **GUILTY** → the accused draws penalty cards
5. If majority votes **INNOCENT** → the accuser draws penalty cards instead

This is how the group defines and enforces the meta-rules of your specific Mao variant.

### 4. Chat
A simple chat is available at the bottom of the game screen for discussing rules, arguing about infractions, or trash talk.

## Features

- **No rule enforcement** — the game never rejects any action. Players decide what's legal
- **Server-authoritative** — all game state is managed server-side
- **Reconnection** — refresh the page and auto-rejoin your game (stored in localStorage)
- **Host migration** — if the host disconnects, a new host is elected
- **Sound effects** — card play/draw, turn change, and punishment sounds via Web Audio API
- **Fullscreen** — click the fullscreen button in-game
- **Responsive** — works on desktop and mobile browsers
- **Background particles** — subtle floating particle effects

## Extending

The code is designed to be easy to extend:

- **New rules/mechanics**: Add new socket events in `server/index.js`, add handlers in `server/game.js`
- **New UI screens**: Add a `<div class="screen">` in `index.html`, add `showScreen('name')` in `main.js`
- **Custom card decks**: Replace the PNGs in `/cards` following the naming convention `<rank>_of_<suit>.png`

### Card File Naming

Cards are auto-loaded from `/cards/` using the pattern:
- Regular: `<rank>_of_<suit>.png` (e.g. `ace_of_spades.png`, `10_of_hearts.png`)
- Jokers: `<color>_joker.png` (e.g. `black_joker.png`, `red_joker.png`)

Ranks: `ace`, `2`–`10`, `jack`, `queen`, `king`
Suits: `clubs`, `diamonds`, `hearts`, `spades`

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Node.js, Express
- **Realtime**: Socket.IO
- **Assets**: PNG card images, PNG background