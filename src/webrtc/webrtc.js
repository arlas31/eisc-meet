import { getSocket } from "../sockets/socketManager";

let peerConnection = null;
const iceServers = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] }
  ]
};

function ensurePeerConnection() {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(iceServers);
  }
  return peerConnection;
}

export function initWebRTC(localRef, remoteRef) {
  const socket = getSocket();
  if (!socket) {
    console.warn("initWebRTC: no socket available. Call connectToRoom(...) first.");
    return;
  }

  const pc = ensurePeerConnection();

  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      // LOCAL VIDEO
      if (localRef.current) {
        localRef.current.srcObject = stream;
      }

      // añadir tracks al peer connection (si hay duplicados, browser los ignora)
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    })
    .catch(err => {
      console.error("Error getUserMedia:", err);
    });

  pc.ontrack = event => {
    if (remoteRef.current) {
      remoteRef.current.srcObject = event.streams[0];
    }
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("webrtc:candidate", { candidate: event.candidate, room: socket.auth?.room });
    }
  };

  socket.on("webrtc:offer", async ({ from, offer }) => {
    try {
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { answer, room: socket.auth?.room });
    } catch (err) {
      console.error("Error handling offer:", err);
    }
  });

  socket.on("webrtc:answer", async ({ from, answer }) => {
    try {
      await pc.setRemoteDescription(answer);
    } catch (err) {
      console.error("Error setting remote answer:", err);
    }
  });

  socket.on("webrtc:candidate", async ({ from, candidate }) => {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error adding ICE candidate", error);
    }
  });

  // Si otro peer indica que se mutearon
  socket.on("user:muted", ({ userId, muted }) => {
    console.log("user:muted", userId, muted);
    // UI manejada en el componente Interaction, solo log aquí si quieres
  });

  // avisar al servidor que estoy listo para negociar
  socket.emit("webrtc:join", { room: socket.auth?.room, token: socket.auth?.token, username: socket.auth?.username });
}

let cameraStream = null;

export async function shareScreen(localRef) {
  const pc = ensurePeerConnection();

  if (!cameraStream && localRef.current?.srcObject instanceof MediaStream) {
    cameraStream = localRef.current.srcObject;
  }

  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false
  });

  if (localRef.current) {
    localRef.current.srcObject = screenStream;
  }

  const screenTrack = screenStream.getVideoTracks()[0];
  const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) sender.replaceTrack(screenTrack);
  else pc.addTrack(screenTrack, screenStream);

  screenTrack.onended = () => {
    stopScreenShare(localRef);
  };
}

export async function stopScreenShare(localRef) {
  if (!cameraStream) return;

  if (localRef.current) {
    localRef.current.srcObject = cameraStream;
  }

  const cameraTrack = cameraStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) sender.replaceTrack(cameraTrack);
}