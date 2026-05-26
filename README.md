# MAO — Multiplayer Online Card Game

A private, friend-group implementation of the card game Mao where **rules are hidden**, **punishments are voted on**, and **nobody knows what's legal until someone breaks a rule and gets caught**.

No bots, no matchmaking, no accounts — just a lobby code, your friends, and a slowly growing pile of secret rules that only the round winner knows.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Enter a nickname, host a party, share the 6-digit code with friends.

## The Short Version

Mao is a card game where the winner of each round invents a new rule that nobody else knows. Every round adds another secret rule. Players discover rules by watching each other and calling out suspected infractions. If the group agrees you broke a hidden rule, you draw penalty cards. If they don't, the accuser draws instead.

There's no automatic enforcement — the game never tells you what's legal. Everything is social deduction, memory, and bluffing.

The app gives you a visual block-based rule creator (pick triggers like "when a king is played" and actions like "skip the next player") or a free-text AI interpreter if you prefer describing rules in plain English.

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

## Features

- **Hidden rule system** — create rules with a visual block builder (card triggers + actions) that only the creator sees
- **Social punishment** — players call out suspected rule breaks and the group votes
- **No rule enforcement** — the game never rejects any action. Players decide what's legal
- **Server-authoritative** — all game state is managed server-side
- **Reconnection** — refresh the page and auto-rejoin your game (stored in localStorage)
- **Host migration** — if the host disconnects, a new host is elected
- **AI rule validation** — describe a rule in plain English and let an LLM validate it
- **Knock on table** — a dedicated button for when the rules demand a knock
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
