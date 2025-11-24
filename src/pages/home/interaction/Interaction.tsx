import { useState, useRef, useEffect } from "react";
import { initWebRTC, shareScreen, stopScreenShare } from "../../../webrtc/webrtc.js";
import { connectToRoom, getSocket, disconnectSocket } from "../../../sockets/socketManager";

export default function Interaction() {
  const [isMuted, setIsMuted] = useState(false);
  const [remoteMuted, setRemoteMuted] = useState<Record<string, boolean>>({});
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  // username random para demo
  const usernameRef = useRef(`user-${Math.random().toString(36).slice(2, 8)}`);
  const ROOM_NAME = "sala-1";

  useEffect(() => {
    // Conectar al socket y unirnos a la sala antes de inicializar WebRTC
    const token = import.meta.env.VITE_VIDEO_TOKEN ?? undefined;
    const socket = connectToRoom(ROOM_NAME, usernameRef.current, token);

    // Al recibir confirmación de unión, inicializamos WebRTC
    const onJoined = (payload: any) => {
      console.log("Joined room payload:", payload);
      initWebRTC(localVideoRef, remoteVideoRef);
    };

    socket?.on("webrtc:joined", onJoined);

    // Escuchar evento de mute de otros peers y actualizar estado local
    const handleRemoteMute = ({ userId, muted }: { userId: string; muted: boolean }) => {
      setRemoteMuted(prev => ({ ...prev, [userId]: muted }));
    };
    socket?.on("user:muted", handleRemoteMute);

    return () => {
      socket?.off("webrtc:joined", onJoined);
      socket?.off("user:muted", handleRemoteMute);
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    setIsMuted(prev => {
      const newState = !prev;

      const stream = localVideoRef.current?.srcObject as MediaStream | undefined;
      if (stream) {
        stream.getAudioTracks().forEach(track => {
          track.enabled = !newState;
        });
      }

      // Notificar al otro peer vía socket que me muteé/desmuteé
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit("user:muted", {
          room: socket.auth?.room,
          userId: socket.id,
          muted: newState
        });
      }

      return newState;
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-4">
        {/* LOCAL VIDEO */}
        <div className="w-1/2">
          <video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline 
            className="w-full rounded-lg border" 
          />
        </div>

        {/* REMOTE VIDEO */}
        <div className="w-1/2">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full rounded-lg border"
          />
          {/* indicador de si el remote está muteado (simple) */}
          <div className="mt-2 text-sm text-gray-600">
            {Object.keys(remoteMuted).length === 0 ? (
              <span>Estado remoto desconocido</span>
            ) : (
              Object.entries(remoteMuted).map(([id, muted]) => (
                <div key={id}>
                  {id === getSocket()?.id ? "Tu" : id}: {muted ? "🔇 mutedo" : "🎙️ activo"}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <button 
        onClick={toggleMute} 
        className="px-4 py-2 bg-purple-600 text-white rounded"
      >
        {isMuted ? "Encender Micrófono" : "Mutear"}
      </button>

      <div className="flex gap-4 mt-2">
        <button
          onClick={() => shareScreen(localVideoRef)}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Compartir pantalla
        </button>

        <button
          onClick={() => stopScreenShare(localVideoRef)}
          className="px-4 py-2 bg-red-600 text-white rounded"
        >
          Dejar de compartir
        </button>
      </div>
    </div>
  );
}