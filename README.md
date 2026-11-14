# Padel Pals

Arcade 3D padel for 1v1 and 2v2, against bots or online with friends. Built with React, Three.js and a small Node server.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload at http://localhost:3000 |
| `npm run build` | Builds the client (`dist/`) and bundles the server (`dist-server/`) |
| `npm start` | Runs the production server (serves the client + online relay) |
| `npm test` | Runs the test suite in `tests/` |
| `npm run lint` | Type-checks the project |

## Project structure

```
server.ts                 Express server: serves the app, WebSocket room relay (/ws), quick match API
src/
  main.tsx, App.tsx       App entry; App wires the 3D scene, game loop, menus and online play
  index.css               Global styles and animation utilities
  components/             React UI: menus, HUD, lobby, pause/match-over, settings, locker
  game/
    types.ts              Shared types and court dimensions
    audio.ts              Procedural sound effects and music
    engine/               Game rules and simulation (no rendering)
      physics.ts            Ball flight, bounces, walls, net, shot trajectories
      rules.ts              Scoring, serves, faults, match formats
      serve.ts              Player placement for each serve
      player.ts, bot.ts     Player movement and bot AI
      ball.ts               Bajada (wall rebound) helpers
      input.ts              Keyboard, mouse and touch input
      loop.ts               Fixed 60 Hz game loop
    scene/                Three.js visuals
      court.ts, crowd.ts, avatar.ts, camera.ts
    net/                  Online multiplayer
      multiplayer.ts        Rooms, lobby, host-authoritative netcode (relay or WebRTC)
      netcodeBinary.ts      Compact binary snapshot/input encoding
tests/                    Tests grouped the same way (engine/, scene/, net/, ui/)
```

## Online play

The host's browser runs the match; the server only relays packets between players in a room, so it works across any network. When no server is reachable (for example a static-only deploy), the game falls back to PeerJS peer-to-peer WebRTC.

## Debugging

- `F3` gameplay debug overlay, `F4` network stats overlay.
- Add `?debug=1` to the URL to expose live game state on `window.__padelDebug`.
