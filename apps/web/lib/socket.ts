import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function getGameSocket(token?: string | null): Socket {
  if (socket) {
    if (token && socket.auth && (socket.auth as { token?: string }).token !== token) {
      (socket.auth as { token?: string }).token = token;
      if (socket.connected) {
        socket.disconnect();
      }
      socket.connect();
    }
    return socket;
  }

  socket = io(`${WS_URL}/game`, {
    autoConnect: true,
    transports: ['websocket', 'polling'],
    auth: token ? { token } : {},
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 4000,
    timeout: 10000,
  });

  return socket;
}

export function disconnectGameSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function reconnectWithToken(token: string | null) {
  if (socket) {
    socket.auth = token ? { token } : {};
    if (!socket.connected) socket.connect();
    else {
      socket.disconnect();
      socket.connect();
    }
    return socket;
  }
  return getGameSocket(token);
}

export function forceResync() {
  if (socket?.connected) {
    // Server pushes state on connection; force reconnect cycle for full resync
    socket.emit('resync');
    socket.disconnect();
    socket.connect();
  }
}
