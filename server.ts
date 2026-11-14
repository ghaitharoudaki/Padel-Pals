import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket, RawData } from 'ws';

/**
 * Padel Pals game server.
 *
 * - Serves the built client (production) or the Vite dev middleware (development).
 * - Hosts a lightweight WebSocket room relay at /ws. The match host's browser stays
 *   authoritative; the server only forwards packets between the host and its clients.
 *   This works across any network (no NAT traversal / TURN needed), which makes online
 *   play far more reliable than peer-to-peer WebRTC.
 *
 * Relay protocol (JSON text frames):
 *   client -> server  { op: 'host', room, mode, isPublic }
 *   client -> server  { op: 'join', room, meta }
 *   client -> server  { op: 'msg', to?, data }        host: to a peer (or all); client: to host
 *   client -> server  { op: 'status', open }           host advertises whether quick match may join
 *   server -> client  { op: 'hosted', peer, room }
 *   server -> client  { op: 'joined', peer, room }
 *   server -> client  { op: 'peer_join', peer, meta }  (to host)
 *   server -> client  { op: 'peer_leave', peer }        (to host)
 *   server -> client  { op: 'host_left' }               (to clients)
 *   server -> client  { op: 'msg', from, data }
 *   server -> client  { op: 'error', code, message }
 * Binary frames are forwarded untouched: host -> every client, client -> host.
 */

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

// Route only /ws upgrades to the relay so other upgrade handlers (e.g. Vite HMR) keep working.
server.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  if (pathname !== '/ws') return;
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;
const MAX_CLIENTS_PER_ROOM = 3;

interface RelaySocket extends WebSocket {
  peerId: string;
  roomId: string | null;
  role: 'host' | 'client' | null;
  isAlive: boolean;
}

interface Room {
  id: string;
  host: RelaySocket;
  clients: Map<string, RelaySocket>;
  mode: '1v1' | '2v2';
  isPublic: boolean;
  open: boolean;
  createdAt: number;
}

const rooms = new Map<string, Room>();
let peerCounter = 0;

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendError(ws: WebSocket, code: string, message: string) {
  send(ws, { op: 'error', code, message });
}

function newPeerId() {
  peerCounter = (peerCounter + 1) % 1_000_000;
  return `r${Date.now().toString(36)}${peerCounter.toString(36)}`;
}

function capacityFor(mode: '1v1' | '2v2') {
  return mode === '1v1' ? 1 : MAX_CLIENTS_PER_ROOM;
}

function leaveRoom(ws: RelaySocket) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  ws.roomId = null;
  const role = ws.role;
  ws.role = null;
  if (!room) return;

  if (role === 'host' && room.host === ws) {
    rooms.delete(roomId);
    room.clients.forEach((client) => {
      send(client, { op: 'host_left' });
      client.roomId = null;
      client.role = null;
    });
    room.clients.clear();
  } else if (role === 'client') {
    room.clients.delete(ws.peerId);
    send(room.host, { op: 'peer_leave', peer: ws.peerId });
  }
}

wss.on('connection', (rawWs) => {
  const ws = rawWs as RelaySocket;
  ws.peerId = newPeerId();
  ws.roomId = null;
  ws.role = null;
  ws.isAlive = true;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (data: RawData, isBinary: boolean) => {
    ws.isAlive = true;

    if (isBinary) {
      const room = ws.roomId ? rooms.get(ws.roomId) : undefined;
      if (!room) return;
      if (ws.role === 'host') {
        room.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) client.send(data, { binary: true });
        });
      } else if (ws.role === 'client' && room.host.readyState === WebSocket.OPEN) {
        room.host.send(data, { binary: true });
      }
      return;
    }

    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.op !== 'string') return;

    switch (msg.op) {
      case 'host': {
        const roomId = String(msg.room || '').toUpperCase().trim();
        if (!ROOM_CODE_RE.test(roomId)) {
          sendError(ws, 'invalid_room', 'Room codes must be 4-8 letters or numbers.');
          return;
        }
        leaveRoom(ws);
        const existing = rooms.get(roomId);
        if (existing && existing.host.readyState === WebSocket.OPEN) {
          sendError(ws, 'room_taken', `Room code "${roomId}" is already in use.`);
          return;
        }
        const room: Room = {
          id: roomId,
          host: ws,
          clients: new Map(),
          mode: msg.mode === '1v1' ? '1v1' : '2v2',
          isPublic: !!msg.isPublic,
          open: true,
          createdAt: Date.now(),
        };
        rooms.set(roomId, room);
        ws.roomId = roomId;
        ws.role = 'host';
        send(ws, { op: 'hosted', peer: ws.peerId, room: roomId });
        return;
      }

      case 'join': {
        const roomId = String(msg.room || '').toUpperCase().trim();
        const room = rooms.get(roomId);
        if (!room || room.host.readyState !== WebSocket.OPEN) {
          sendError(ws, 'room_not_found', `Room "${roomId}" was not found. Check the code with the host.`);
          return;
        }
        if (room.host === ws) {
          sendError(ws, 'invalid_room', 'You are already hosting this room.');
          return;
        }
        if (room.clients.size >= capacityFor(room.mode)) {
          sendError(ws, 'room_full', `Room "${roomId}" is full.`);
          return;
        }
        leaveRoom(ws);
        room.clients.set(ws.peerId, ws);
        ws.roomId = roomId;
        ws.role = 'client';
        send(ws, { op: 'joined', peer: ws.peerId, room: roomId });
        send(room.host, { op: 'peer_join', peer: ws.peerId, meta: msg.meta ?? null });
        return;
      }

      case 'status': {
        const room = ws.roomId ? rooms.get(ws.roomId) : undefined;
        if (room && room.host === ws) {
          room.open = !!msg.open;
          if (msg.mode === '1v1' || msg.mode === '2v2') room.mode = msg.mode;
        }
        return;
      }

      case 'msg': {
        const room = ws.roomId ? rooms.get(ws.roomId) : undefined;
        if (!room) return;
        const envelope = JSON.stringify({ op: 'msg', from: ws.peerId, data: msg.data });
        if (ws.role === 'host') {
          if (typeof msg.to === 'string') {
            const target = room.clients.get(msg.to);
            if (target?.readyState === WebSocket.OPEN) target.send(envelope);
          } else {
            room.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) client.send(envelope);
            });
          }
        } else if (ws.role === 'client' && room.host.readyState === WebSocket.OPEN) {
          room.host.send(envelope);
        }
        return;
      }

      case 'leave': {
        leaveRoom(ws);
        return;
      }

      case 'ping': {
        send(ws, { op: 'pong', t: msg.t });
        return;
      }
    }
  });

  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

// Drop dead sockets (and keep proxies such as Render's from idling the connection out).
const heartbeat = setInterval(() => {
  wss.clients.forEach((rawWs) => {
    const ws = rawWs as RelaySocket;
    if (!ws.isAlive) {
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  });
}, 20000);
wss.on('close', () => clearInterval(heartbeat));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeRooms: rooms.size,
    totalConnections: wss.clients.size,
  });
});

// Quick match: find a public room that is still accepting players for this mode.
app.get('/api/quickmatch', (req, res) => {
  const mode = req.query.mode === '1v1' ? '1v1' : '2v2';
  let best: Room | null = null;
  for (const room of rooms.values()) {
    if (!room.isPublic || !room.open || room.mode !== mode) continue;
    if (room.host.readyState !== WebSocket.OPEN) continue;
    if (room.clients.size >= capacityFor(room.mode)) continue;
    if (!best || room.clients.size > best.clients.size) best = room;
  }
  res.json({ roomId: best ? best.id : null });
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
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(
      express.static(distDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      })
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(PORT, () => {
    console.log(`Padel Pals server listening on port ${PORT} (production: ${isProduction})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
