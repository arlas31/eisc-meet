import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function initSocket() {
  if (socket) return socket;
  const url = String(import.meta.env.VITE_SOCKET_URL ?? "http://localhost:9000");
  socket = io(url, {
    autoConnect: false,
    transports: ["websocket"]
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connect_error:", err);
  });

  socket.on("connect", () => {
    console.log("Socket conectado:", socket?.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("Socket desconectado:", reason);
  });

  return socket;
}

/**
 * Conecta al socket y se une a una sala.
 * @param room nombre de sala
 * @param username identificador del usuario
 * @param token token opcional si el servidor lo requiere
 */
export function connectToRoom(room: string, username?: string, token?: string) {
  const s = initSocket();
  if (!s) return null;

  // auth opcional (solo metadata local, server debe validar en webrtc:join)
  s.auth = { token, username, room };

  // Conectar y emitir join payload que usa el server
  s.connect();
  s.emit("webrtc:join", { room, token, username });

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