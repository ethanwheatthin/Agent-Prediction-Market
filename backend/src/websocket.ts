import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] Client connected from ${ip}. Total: ${wss!.clients.size}`);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        // Ping/pong support
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
      } catch {
        // ignore
      }
    });

    ws.on('close', () => {
      console.log(`[WS] Client disconnected. Total: ${wss!.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[WS] Client error:', err.message);
    });

    // Send welcome event
    ws.send(JSON.stringify({ type: 'connected', data: { message: 'Welcome to AgentArena' } }));
  });

  console.log('[WS] WebSocket server initialized');
}

export function broadcast(type: string, data: unknown): void {
  if (!wss) return;

  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  let sent = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message, (err) => {
        if (err) console.error('[WS] Send error:', err.message);
      });
      sent++;
    }
  });

  if (sent > 0) {
    console.log(`[WS] Broadcast '${type}' to ${sent} clients`);
  }
}
