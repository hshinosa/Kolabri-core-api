import { IncomingMessage, Server as HttpServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import { JwtPayload } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

type AuthenticatedWebSocket = WebSocket & {
    user?: JwtPayload;
    isAlive?: boolean;
};

let adminWss: WebSocketServer | null = null;

function parseToken(request: IncomingMessage) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    return url.searchParams.get('token');
}

function authenticate(request: IncomingMessage) {
    const token = parseToken(request);
    const secret = process.env.JWT_SECRET;

    if (!token || !secret) {
        return null;
    }

    try {
        const payload = jwt.verify(token, secret) as JwtPayload;
        // H3 (F2): tolak token tanpa klaim identitas (mis. token berbagi analytics)
        if (typeof payload.userId !== 'string' || payload.userId.trim() === '') {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}

export function setupWebSocket(server: HttpServer) {
    adminWss = new WebSocketServer({ server, path: '/ws' });

    adminWss.on('connection', (ws: AuthenticatedWebSocket, request) => {
        const user = authenticate(request);

        if (!user) {
            ws.close(1008, 'Authentication required');
            return;
        }

        ws.user = user;
        ws.isAlive = true;
        logger.info(`Admin WebSocket connected: ${user.userId}`);

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.on('message', (message) => {
            try {
                const payload = JSON.parse(message.toString()) as { type?: string };

                if (payload.type === 'ping') {
                    ws.send(JSON.stringify({ event: 'system:pong', data: { timestamp: new Date().toISOString() } }));
                }
            } catch {
                ws.send(JSON.stringify({ event: 'system:error', data: { message: 'Invalid message payload' } }));
            }
        });

        ws.on('close', () => {
            logger.info(`Admin WebSocket disconnected: ${user.userId}`);
        });

        ws.send(JSON.stringify({ event: 'system:connected', data: { userId: user.userId } }));
    });

    const interval = setInterval(() => {
        adminWss?.clients.forEach((client) => {
            const socket = client as AuthenticatedWebSocket;

            if (!socket.isAlive) {
                socket.terminate();
                return;
            }

            socket.isAlive = false;
            socket.ping();
        });
    }, 30000);

    adminWss.on('close', () => clearInterval(interval));

    return adminWss;
}

export function getWebSocketServer() {
    return adminWss;
}

export function broadcast(wss: WebSocketServer | null, event: string, data: unknown) {
    if (!wss) {
        return;
    }

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ event, data }));
        }
    });
}

export function broadcastAdminEvent(event: string, data: unknown) {
    broadcast(adminWss, event, data);
}
