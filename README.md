# MAO — Multiplayer Online Card Game

A private, friend-group implementation of the card game Mao where **rules are hidden**, **punishments are voted on**, and **nobody knows what's legal until someone breaks a rule and gets caught**.

No matchmaking, no accounts — just a lobby code, your friends, and a slowly growing pile of secret rules that only the round winner knows.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000` in your browser. Enter a nickname, host a party, share the 6-digit code with friends.

## The Short Version

Mao is a card game where the winner of each round invents a new rule that nobody else knows. Every round adds another secret rule. Players discover rules by watching each other and calling out suspected infractions. If the group agrees you broke a hidden rule, you draw penalty cards. If they don't, the accuser draws instead.

There's no automatic enforcement — the game never tells you what's legal. Everything is social deduction, memory, and bluffing.

## Project Structure

```
├── server/
│   ├── index.js       # Express + Socket.IO server, room/event handling
│   ├── lobby.js       # Lobby class (players, ready, host, kick)
│   ├── game.js        # Game state (deck, turns, punishments, chat)
│   └── bot.js         # Bot AI (turn logic, rule learning, punishment voting)
├── client/
│   ├── index.html     # Single-page app (menu, lobby, game screens)
│   ├── css/
│   │   └── style.css  # Dark card-table theme, glow effects, responsive
│   └── js/
│       ├── main.js       # Screen switching, init
│       ├── menu.js       # Host/join lobby UI
│       ├── lobby.js      # Player list, ready, kick, copy code, bot config
│       ├── game.js       # Game table, cards, punishment votes, rule creator, animations
│       ├── socket.js     # Socket.IO client, reconnection, toasts
│       └── particles.js  # Canvas particle system
├── cards/             # 54+ playing card PNGs (loaded automatically)
├── ui/                # UI assets (background image)
└── package.json
```

## Feature Overview

### Lobby & Multiplayer
- Host/join via 6-digit room code (always visible in top bar during game)
- Player list with ready states, host badge, kick button
- Copy room code to clipboard
- In-game chat as a floating minimizable panel (top-right)
- Host migration when host disconnects
- Reconnection on page refresh (localStorage)
- **Mid-game joining** — players can join even after rounds have been played; dealt a fresh hand from the deck and can play immediately

### Bot Opponents
- Add/remove bots mid-lobby or mid-game (host only)
- 5 difficulty levels: Bad, Medium, Good, Pro, Impossible
- Bot AI: automatic turn-taking with delay, plays matching cards, draws when no play
- Rule learning: bots observe card plays and detect rules via pattern matching (rate scales with difficulty)
- Rule forgetting: bots forget rules over time (rate scales with difficulty)
- Misplay chance: lower-difficulty bots occasionally play illegal cards
- Social: bots vote on punishments, can accuse/punish other players for rule violations
- Bot rule creation: winning bots create random hidden rules
- **Single punishment per offense** — only one bot punishes per violation (first detector), not all 4
- **Base matching enforcement** — bots enforce suit/rank matching as a built-in rule, no hidden rule required

### Gameplay
- Standard 54-card deck (52 + 2 jokers), 1 or 2 decks selectable
- Auto-reshuffle when deck runs out (discard pile shuffled back, top card stays)
- 5 cards dealt per player, 1 starts the discard pile
- Turn-based: play a card matching the top card's suit or rank, draw, or end turn
- **Bad Card punish** — a red "BAD CARD" button always punishes the last player who played; their card is returned to hand + they draw a penalty card from the deck. The penalty card can be **punished back** like any other punishment.
- **Back to Deck** — next to the "PUNISH BACK!" button, a "BACK TO DECK" button removes the penalty card from your hand and inserts it at a random position in the deck (never on top).
- Bots enforce suit/rank matching as a built-in rule — they will punish players who play off-suit/rank even if no hidden rule covers it (gated by bot difficulty and detect chance). Bots use the **Bad Card** punish (card returned + penalty) for base rule violations, and the standard **simple punish** (penalty only) for hidden rule violations.
- **Punish back** — if you are punished (given a card), you can "punish back" to return it. Chain is infinite: punish → punish back → punish back → ... indefinitely (each swap triggers a new "PUNISH BACK!" button on the other side)
- Drawing auto-ends the turn and passes to next player
- Punishment system: accuse a player → group vote → majority decides penalty
- Per-player cooldown (500ms) prevents rapid double-plays
- Knock on table button (👊) for when rules demand it

### Hidden Rule Creator
Opens when you win a round. Block-based builder:
- **Triggers when…** — dropdown for trigger type (currently "A card is played", space for future triggers)
- **Multiple trigger rows** — add multiple suit/rank combos via "+ Add trigger"; rows are OR'd (e.g. "black 7 OR black 8 OR red 9")
- **What happens** — pick action (Skip, Reverse direction, Double turn, Change suit to…, Must say…, Knock on table)
- **Who & When (⚙)** — advanced target/timing config for Skip and Reverse
- **Rule summary** — live preview builds as you configure
- Actions map to server action types for self-policing

### Animations & Visuals
- Card play animation: card flies from hand to discard pile with gold glow and bounce (3s keyframe)
- Card draw animation: card slides from draw pile to the drawing player's avatar with purple glow and flip-in effect
- Other players see card back when someone draws; drawer sees the face
- Sound effects via Web Audio API: card play, card draw, punish
- Dark card-table theme with neon glow effects
- Responsive layout: 3-zone flex on mobile, cards scaled at 14vw with overlap
- Canvas particle background
- Toast notifications for game events

### Server Features
- All game state is server-authoritative
- Socket-based real-time communication
- Error handling with try-catch in bot scheduling (prevents crashes)
- Player disconnect handled gracefully during active game
- Discard pile reshuffle on empty deck

## Technical Details

### Card File Naming
Cards auto-loaded from `/cards/`:
- Regular: `<rank>_of_<suit>.png` (e.g. `ace_of_spades.png`, `10_of_hearts.png`)
- Jokers: `<color>_joker.png` (e.g. `black_joker.png`, `red_joker.png`)
- Back: `back.png`

Ranks: `ace`, `2`–`10`, `jack`, `queen`, `king`
Suits: `clubs`, `diamonds`, `hearts`, `spades`

### Bot Levels

| Level      | Detect | Forget | Misplay | Vote Correct |
|------------|--------|--------|---------|-------------|
| Bad        | 25%    | 40%    | 30%     | 30%         |
| Medium     | 50%    | 20%    | 10%     | 60%         |
| Good       | 75%    | 5%     | 2%      | 85%         |
| Pro        | 92%    | 1%     | 0%      | 95%         |
| Impossible | 100%   | 0%     | 0%      | 100%        |

### Socket Events
- `join_lobby` / `create_lobby` — room management (join works mid-game)
- `toggle_ready` / `start_game` — lobby state
- `play_card` / `draw_card` / `end_turn` — turn actions
- `punish_player` / `bad_card_punish` / `punish_back` / `back_to_deck` / `vote_punishment` — punishment events
- `add_bot` / `remove_bot` / `set_bot_level` — bot management (host only)
- `submit_block_rule` / `confirm_rule` — rule creation
- `chat_message`, `knock_on_table`, `log` — social events
- `reconnect_game` — reconnection

## Extending

- **New rules/mechanics**: Add socket events in `server/index.js`, handlers in `server/game.js`
- **New UI screens**: Add `<div class="screen">` in `index.html`, use `showScreen('name')` in `main.js`
- **Custom card decks**: Replace PNGs in `/cards`
- **New bot behaviors**: Add methods to `BotController` in `server/bot.js`

## Tech Stack

- **Frontend**: HTML, CSS, vanilla JavaScript
- **Backend**: Node.js, Express
- **Realtime**: Socket.IO
- **Assets**: PNG card images, PNG background
