import socketIOClient from "socket.io-client";

export const socket = socketIOClient(import.meta.env.VITE_SOCKET_URL);

export const disconnectSocket = () => {
    socket.disconnect();
}

socket.on("webrtc:join", () => {});
socket.on("webrtc:offer", () => {});
socket.on("webrtc:answer", () => {});
socket.on("webrtc:candidate", () => {});
