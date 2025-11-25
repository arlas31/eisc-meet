import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function initSocket() {
  if (socket) return socket;

  const url = String(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:9000");
  console.log("[socketManager] initSocket - url:", url);

  // No forzamos solo 'websocket' — permitimos polling como fallback
  socket = io(url, {
    autoConnect: false,
    // transports: ["polling", "websocket"], // polling first then upgrade
    // Opciones de reconexión útiles para dev
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 500,
    reconnectionDelayMax: 2000
  });

  socket.on("connect_error", (err) => {
    console.error("[socketManager] Socket connect_error:", err);
  });

  socket.on("connect", () => {
    console.log("[socketManager] Socket conectado:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[socketManager] Socket desconectado:", reason);
  });

  return socket;
}

export function connectToRoom(room: string, username?: string, token?: string) {
  const socketUrl = String(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:9000");
  console.log("[socketManager] connectToRoom: connecting to", socketUrl, "room:", room);

  const s = initSocket();
  if (!s) return null;

  s.auth = { token, username, room };

  s.connect();

  const handleConnect = () => {
    console.log("[socketManager] conectado, emitiendo webrtc:join ->", { room, username });
    s.emit("webrtc:join", { room, token, username });
    s.off("connect", handleConnect);
  };
  s.on("connect", handleConnect);

  return s;
}

export function getSocket() {
  return socket;
}

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};