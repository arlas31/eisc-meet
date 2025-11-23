import { useState, useRef, useEffect } from "react";
import { initWebRTC, shareScreen, stopScreenShare } from "../../../webrtc/webrtc.js";

export default function Interaction() {
  const [isMuted, setIsMuted] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    initWebRTC(localVideoRef, remoteVideoRef);
  }, []);

  const toggleMute = () => {
    setIsMuted(prev => {
      const newState = !prev;

      const stream = localVideoRef.current?.srcObject as MediaStream;
      if (stream) {
        stream.getAudioTracks().forEach(track => {
          track.enabled = !newState;
        });
      }

      return newState;
    });
  };

  return (
    <div className="flex flex-col gap-4">

      <div className="flex gap-4">
        {/* LOCAL VIDEO */}
        <video 
          ref={localVideoRef} 
          autoPlay 
          muted 
          playsInline 
          className="w-1/2 rounded-lg border"
        />

        {/* REMOTE VIDEO */}
        <video 
          ref={remoteVideoRef} 
          autoPlay 
          playsInline 
          className="w-1/2 rounded-lg border"
        />
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
