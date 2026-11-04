import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

interface PlayerConnection {
  ws: WebSocket;
  id: string;
  roomId: string;
  side: 'south' | 'north';
  name: string;
  customization?: Record<string, unknown>;
}

interface GameRoom {
  id: string;
  players: PlayerConnection[];
  matchMode: '1v1' | '2v2';
  ballState?: unknown;
  scoreState?: unknown;
  lastActive: number;
}

const rooms = new Map<string, GameRoom>();

// Clean up idle rooms every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [roomId, room] of rooms.entries()) {
    if (room.players.length === 0 && now - room.lastActive > 10 * 60 * 1000) {
      rooms.delete(roomId);
    }
  }
}, 60 * 1000);

wss.on('connection', (ws) => {
  let currentPlayer: PlayerConnection | null = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'join') {
        const roomId = (msg.roomId || 'court-1').toUpperCase().trim();
        let room = rooms.get(roomId);

        if (!room) {
          room = {
            id: roomId,
            players: [],
            matchMode: msg.matchMode === '1v1' ? '1v1' : '2v2',
            lastActive: Date.now(),
          };
          rooms.set(roomId, room);
        }

        if (room.players.length > 0 && room.matchMode !== (msg.matchMode === '1v1' ? '1v1' : '2v2')) {
          ws.send(JSON.stringify({ type: 'room_mode_mismatch', roomId, matchMode: room.matchMode }));
          return;
        }

        if (room.players.length >= (room.matchMode === '1v1' ? 2 : 2)) {
          ws.send(JSON.stringify({ type: 'room_full', roomId }));
          return;
        }

        // Determine side: first player is South (near), second is North (far)
        let side: 'south' | 'north' = 'south';
        if (room.players.length === 1) {
          side = room.players[0].side === 'south' ? 'north' : 'south';
        }

        currentPlayer = {
          ws,
          id: msg.playerId || Math.random().toString(36).substring(2, 9),
          roomId,
          side,
          name: msg.name || (side === 'south' ? 'Player 1' : 'Player 2'),
          customization: msg.customization,
        };

        room.players.push(currentPlayer);
        room.lastActive = Date.now();

        // Send confirmation to joining player
        ws.send(JSON.stringify({
          type: 'joined',
          roomId,
          playerId: currentPlayer.id,
          side,
          playerCount: room.players.length,
          players: room.players.map(p => ({ id: p.id, side: p.side, name: p.name, customization: p.customization })),
        }));

        // Notify other player in room
        const otherPlayers = room.players.filter(p => p.ws !== ws);
        otherPlayers.forEach(p => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
              type: 'player_joined',
              player: {
                id: currentPlayer!.id,
                side: currentPlayer!.side,
                name: currentPlayer!.name,
                customization: currentPlayer!.customization,
              },
              playerCount: room!.players.length,
            }));
          }
        });

        // If 2 players, notify room ready!
        if (room.players.length >= 2) {
          room.players.forEach(p => {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(JSON.stringify({
                type: 'room_ready',
                roomId,
                servingSide: 'south',
                matchMode: room.matchMode,
              }));
            }
          });
        }
        return;
      }

      if (!currentPlayer) return;
      const room = rooms.get(currentPlayer.roomId);
      if (!room) return;
      room.lastActive = Date.now();

      // Relay gameplay messages to other players in the room
      if (['player_state', 'ball_state', 'serve_trigger', 'point_scored'].includes(msg.type)) {
        room.players.forEach(p => {
          if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(msg));
          }
        });
      }
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  });

  ws.on('close', () => {
    if (currentPlayer) {
      const room = rooms.get(currentPlayer.roomId);
      if (room) {
        room.players = room.players.filter(p => p !== currentPlayer);
        // Inform remaining player
        room.players.forEach(p => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
              type: 'player_left',
              playerId: currentPlayer!.id,
              side: currentPlayer!.side,
            }));
          }
        });
      }
    }
  });
});

// REST API endpoint to check room status or server health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: rooms.size,
    totalConnections: wss.clients.size,
  });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT} (isProduction: ${isProduction})`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});
