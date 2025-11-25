/* contents of file */
import { getSocket } from "../sockets/socketManager";

let peerConnection = null;
let makingOffer = false;
let localStream = null;
let pendingOfferRequested = false;

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
    };

    peerConnection.onicecandidate = (event) => {
      const socket = getSocket();
      if (event.candidate && socket) {
        console.log("[webrtc] Enviando ICE candidate", event.candidate);
        socket.emit("webrtc:candidate", { candidate: event.candidate, room: socket.auth?.room });
      }
    };

    peerConnection.onnegotiationneeded = async () => {
      const socket = getSocket();
      if (!socket) return;
      if (makingOffer) return;
      try {
        makingOffer = true;
        console.log("[webrtc] onnegotiationneeded -> creando oferta (fallback)");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("webrtc:offer", { offer: peerConnection.localDescription, room: socket.auth?.room });
        console.log("[webrtc] Oferta enviada por onnegotiationneeded (fallback)");
      } catch (err) {
        console.error("[webrtc] Error en onnegotiationneeded", err);
      } finally {
        makingOffer = false;
      }
    };
  }
  return peerConnection;
}

/**
 * initWebRTC(localRef, remoteRef, options?)
 * options: { onRemotePlayBlocked?: () => void, onRemotePlayStarted?: () => void }
 */
export async function initWebRTC(localRef, remoteRef, options = {}) {
  const socket = getSocket();
  if (!socket) {
    console.warn("initWebRTC: no socket available. Call connectToRoom(...) first.");
    return;
  }

  const pc = ensurePeerConnection();

  // Handlers de señalización (offer/answer/candidate/ready)
  socket.off("webrtc:offer");
  socket.on("webrtc:offer", async ({ from, offer }) => {
    try {
      console.log("[webrtc] Oferta recibida desde", from);
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

  socket.off("webrtc:ready");
  socket.on("webrtc:ready", async ({ from, username }) => {
    try {
      console.log("[webrtc] webrtc:ready recibido de", from);
      if (!localStream) {
        console.log("[webrtc] aún no hay localStream -> marcar pendingOfferRequested");
        pendingOfferRequested = true;
        return;
      }
      if (makingOffer) {
        console.log("[webrtc] ya se está creando una oferta, ignorando ready");
        return;
      }
      makingOffer = true;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc:offer", { offer: pc.localDescription, room: socket.auth?.room });
      console.log("[webrtc] Oferta creada y enviada en respuesta a ready");
    } catch (err) {
      console.error("[webrtc] Error creando oferta en ready:", err);
    } finally {
      makingOffer = false;
      pendingOfferRequested = false;
    }
  });

  // getUserMedia y añadir tracks
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log("[webrtc] getUserMedia OK, tracks:", stream.getTracks());
    localStream = stream;

    if (localRef?.current) {
      localRef.current.srcObject = stream;
      localRef.current.muted = true;
      localRef.current.play().catch(err => console.warn("[webrtc] local play() falló:", err));
    }

    stream.getTracks().forEach(track => {
      pc.addTrack(track, stream);
    });

    if (pendingOfferRequested) {
      const socket2 = getSocket();
      if (!socket2) return;
      if (makingOffer) return;
      try {
        makingOffer = true;
        console.log("[webrtc] pendingOfferRequested -> crear oferta ahora");
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket2.emit("webrtc:offer", { offer: pc.localDescription, room: socket2.auth?.room });
        console.log("[webrtc] Oferta enviada (pending)");
      } catch (err) {
        console.error("[webrtc] Error creando oferta por pendingOfferRequested", err);
      } finally {
        makingOffer = false;
        pendingOfferRequested = false;
      }
    }
  } catch (err) {
    console.error("[webrtc] Error getUserMedia:", err);
    return;
  }

  // Dedup stream id
  let lastRemoteStreamId = null;

  pc.ontrack = (event) => {
    console.log("[webrtc] ontrack event:", event.streams);
    const stream = event.streams && event.streams[0];
    if (!stream) return;
    try {
      if (!remoteRef?.current) {
        console.warn("[webrtc] ontrack: remoteRef no está definido");
        return;
      }

      if (stream.id === lastRemoteStreamId) {
        console.log("[webrtc] ontrack: misma stream ya asignada, ignorando reasignación (streamId)", stream.id);
        return;
      }

      lastRemoteStreamId = stream.id;
      remoteRef.current.srcObject = stream;

      // Para permitir autoplay, lo dejamos inicialmente silenciado (muted = true)
      // El usuario podrá activar audio posteriormente desde la UI.
      remoteRef.current.muted = true;
      remoteRef.current.play()
        .then(() => {
          console.log("[webrtc] remote video reproducción iniciada correctamente (play())");
          if (options.onRemotePlayStarted) options.onRemotePlayStarted();
        })
        .catch(err => {
          console.warn("[webrtc] remote play() falló (autoplay bloqueado). Debe hacer click para permitir audio/video:", err);
          if (options.onRemotePlayBlocked) options.onRemotePlayBlocked();
        });

      console.log("[webrtc] remote stream asignada id:", stream.id, "tracks:", stream.getTracks());
    } catch (e) {
      console.error("[webrtc] Error en ontrack handler:", e);
    }
  };
}

export async function shareScreen(localRef) {
  const pc = ensurePeerConnection();

  if (!localStream && localRef.current?.srcObject instanceof MediaStream) {
    localStream = localRef.current.srcObject;
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
  if (!localStream) return;

  if (localRef.current) {
    localRef.current.srcObject = localStream;
  }

  const cameraTrack = localStream.getVideoTracks()[0];
  const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === "video");
  if (sender) {
    await sender.replaceTrack(cameraTrack);
    console.log("[webrtc] Restaurada la cámara al sender");
  }
}