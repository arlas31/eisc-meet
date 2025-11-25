/* contents of file */
import { useState, useRef, useEffect } from "react";
import { initWebRTC, shareScreen, stopScreenShare } from "../../../webrtc/webrtc.js";
import { connectToRoom, getSocket, disconnectSocket } from "../../../sockets/socketManager";

export default function Interaction() {
  const [isMuted, setIsMuted] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [remotePlayBlocked, setRemotePlayBlocked] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const usernameRef = useRef(`user-${Math.random().toString(36).slice(2, 8)}`);
  const ROOM_NAME = "sala-1";

  useEffect(() => {
    const token = import.meta.env.VITE_VIDEO_TOKEN ?? undefined;
    const socket = connectToRoom(ROOM_NAME, usernameRef.current, token);

    // inicializa WebRTC pasando callbacks para eventos de play remoto
    initWebRTC(localVideoRef, remoteVideoRef, {
      onRemotePlayBlocked: () => {
        console.log("[Interaction] remote play blocked callback");
        setRemotePlayBlocked(true);
      },
      onRemotePlayStarted: () => {
        console.log("[Interaction] remote play started callback");
        setRemotePlayBlocked(false);
      }
    });

    const onJoined = (payload: any) => {
      console.log("Joined room payload:", payload);
    };
    socket?.on("webrtc:joined", onJoined);

    return () => {
      socket?.off("webrtc:joined", onJoined);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    setIsMuted(prev => {
      const newState = !prev;
      const stream = localVideoRef.current?.srcObject as MediaStream | undefined;
      if (stream) stream.getAudioTracks().forEach(t => (t.enabled = !newState));
      const socket = getSocket();
      if (socket && socket.connected) socket.emit("user:muted", { room: socket.auth?.room, userId: socket.id, muted: newState });
      return newState;
    });
  };

  const handleEnableRemoteAudio = async () => {
    const v = remoteVideoRef.current;
    if (!v) return;
    try {
      // Desmutear y reproducir (el usuario hizo la interacción necesaria)
      v.muted = false;
      await v.play();
      setRemotePlayBlocked(false);
    } catch (err) {
      console.warn("No se pudo reproducir/desmutear remote:", err);
    }
  };

  const handleShare = async () => {
    try {
      await shareScreen(localVideoRef);
      setIsSharing(true);
    } catch {
      setIsSharing(false);
    }
  };

  const handleStopShare = async () => {
    await stopScreenShare(localVideoRef);
    setIsSharing(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        <div className="w-1/2">
          <video ref={localVideoRef} autoPlay muted playsInline className="w-full rounded-lg border" />
        </div>

        <div className="w-1/2 relative">
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full rounded-lg border" />
          {remotePlayBlocked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <button onClick={handleEnableRemoteAudio} className="px-4 py-2 bg-violet-600 text-white rounded">
                Activar audio / Play
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <button onClick={toggleMute} className="px-4 py-2 bg-purple-600 text-white rounded">{isMuted ? "Encender mic" : "Mutear"}</button>
        {!isSharing ? (
          <button onClick={handleShare} className="px-4 py-2 bg-blue-600 text-white rounded">Compartir pantalla</button>
        ) : (
          <button onClick={handleStopShare} className="px-4 py-2 bg-red-600 text-white rounded">Dejar de compartir</button>
        )}
        <button onClick={() => { disconnectSocket(); window.location.reload(); }} className="px-4 py-2 bg-gray-200 rounded">Salir</button>
      </div>
    </div>
  );
}