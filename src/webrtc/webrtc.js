import { getSocket } from "../sockets/socketManager";

let peerConnection = null;
let makingOffer = false;
const iceServers = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] }
  ]
};

function ensurePeerConnection() {
  if (!peerConnection) {
    peerConnection = new RTCPeerConnection(iceServers);

    peerConnection.ontrack = (event) => {
      console.log("[webrtc] ontrack, streams:", event.streams);
      // El código que usa initWebRTC se encargará de asignar remoteRef.srcObject
    };

    peerConnection.onicecandidate = (event) => {
      const socket = getSocket();
      if (event.candidate && socket) {
        console.log("[webrtc] Enviando ICE candidate", event.candidate);
        socket.emit("webrtc:candidate", { candidate: event.candidate, room: socket.auth?.room });
      }
    };

    // Opcional: onnegotiationneeded fallback (iniciador)
    peerConnection.onnegotiationneeded = async () => {
      const socket = getSocket();
      if (!socket) return;
      try {
        makingOffer = true;
        console.log("[webrtc] onnegotiationneeded -> creando oferta");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("webrtc:offer", { offer: peerConnection.localDescription, room: socket.auth?.room });
        console.log("[webrtc] Oferta enviada por onnegotiationneeded");
      } catch (err) {
        console.error("[webrtc] Error en onnegotiationneeded", err);
      } finally {
        makingOffer = false;
      }
    };
  }
  return peerConnection;
}

export async function initWebRTC(localRef, remoteRef) {
  const socket = getSocket();
  if (!socket) {
    console.warn("initWebRTC: no socket available. Call connectToRoom(...) first.");
    return;
  }

  const pc = ensurePeerConnection();

  // Obtener y publicar la cámara/voz local
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log("[webrtc] getUserMedia OK, tracks:", stream.getTracks());
    // Mostrar preview local
    if (localRef?.current) {
      localRef.current.srcObject = stream;
    }
    // Añadir tracks al PeerConnection (si ya existen serán ignorados por el browser)
    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });
  } catch (err) {
    console.error("[webrtc] Error getUserMedia:", err);
    return;
  }

  // Cuando llegue un offer desde el servidor
  socket.off("webrtc:offer");
  socket.on("webrtc:offer", async ({ from, offer }) => {
    try {
      console.log("[webrtc] Oferta recibida desde", from);
      // Si estamos en proceso de hacer una oferta, podemos esperar o aplicar simple polite logic.
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc:answer", { answer: pc.localDescription, room: socket.auth?.room });
      console.log("[webrtc] Respuesta (answer) creada y enviada");
    } catch (err) {
      console.error("[webrtc] Error handling offer:", err);
    }
  });

  socket.off("webrtc:answer");
  socket.on("webrtc:answer", async ({ from, answer }) => {
    try {
      console.log("[webrtc] Answer recibido desde", from);
      await pc.setRemoteDescription(answer);
    } catch (err) {
      console.error("[webrtc] Error setting remote answer:", err);
    }
  });

  socket.off("webrtc:candidate");
  socket.on("webrtc:candidate", async ({ from, candidate }) => {
    try {
      if (!candidate) return;
      console.log("[webrtc] Candidate recibido desde", from, candidate);
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.error("[webrtc] Error adding ICE candidate", error);
    }
  });

  // Cuando el servidor indique que otro peer está listo -> crear oferta
  socket.off("webrtc:ready");
  socket.on("webrtc:ready", async ({ from, username }) => {
    try {
      console.log("[webrtc] webrtc:ready recibido de", from, "=> vamos a crear oferta");
      // Asegurar que la pc existe y que tenemos tracks añadidos antes de crear la oferta
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { offer: pc.localDescription, room: socket.auth?.room });
      console.log("[webrtc] Oferta creada y enviada a la sala");
    } catch (err) {
      console.error("[webrtc] Error creando oferta en ready:", err);
    }
  });

  // Actualizar el elemento <video> remoto cuando llegue track
  pc.ontrack = (event) => {
    console.log("[webrtc] ontrack event:", event.streams);
    if (remoteRef?.current) {
      remoteRef.current.srcObject = event.streams[0];
    }
  };

  // NOTA: no emitimos webrtc:join aquí; connectToRoom se encargó de emitir al conectar.
}

let cameraStream = null;

export async function shareScreen(localRef) {
  const pc = ensurePeerConnection();

  if (!cameraStream && localRef.current?.srcObject instanceof MediaStream) {
    cameraStream = localRef.current.srcObject;
  }

  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    if (localRef.current) {
      localRef.current.srcObject = screenStream;
    }

    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = pc.getSenders().find(s => s.track && s.track.kind === "video");
    if (sender) {
      await sender.replaceTrack(screenTrack);
      console.log("[webrtc] Sender reemplazado por track de pantalla");
    } else {
      pc.addTrack(screenTrack, screenStream);
      console.log("[webrtc] Track de pantalla añadido (no había sender previo)");
    }

    screenTrack.onended = () => {
      stopScreenShare(localRef);
    };
  } catch (err) {
    console.error("[webrtc] Error shareScreen:", err);
  }
}

export async function stopScreenShare(localRef) {
  if (!cameraStream) return;

  if (localRef.current) {
    localRef.current.srcObject = cameraStream;
  }

  const cameraTrack = cameraStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) {
    await sender.replaceTrack(cameraTrack);
    console.log("[webrtc] Restaurada la cámara al sender");
  }
}