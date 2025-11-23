import { socket } from "../sockets/socketManager";

let peerConnection;
const iceServers = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302"] }
  ]
};

export function initWebRTC(localRef, remoteRef) {
  peerConnection = new RTCPeerConnection(iceServers);

  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      // LOCAL VIDEO
      if (localRef.current) {
        localRef.current.srcObject = stream;
      }

      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });
    });

  peerConnection.ontrack = event => {
    if (remoteRef.current) {
      remoteRef.current.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("webrtc:candidate", event.candidate);
    }
  };

  socket.on("webrtc:offer", async offer => {
    await peerConnection.setRemoteDescription(offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("webrtc:answer", answer);
  });

  socket.on("webrtc:answer", async answer => {
    await peerConnection.setRemoteDescription(answer);
  });

  socket.on("webrtc:candidate", async candidate => {
    try {
      await peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.error("Error adding ICE candidate", error);
    }
  });

  socket.emit("webrtc:join");

  socket.on("webrtc:ready", async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    socket.emit("webrtc:offer", offer);
  });
}

let cameraStream = null;

export async function shareScreen(localRef) {
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
  const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
  if (sender) sender.replaceTrack(screenTrack);

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
  const sender = peerConnection.getSenders().find(s => s.track.kind === "video");
  if (sender) sender.replaceTrack(cameraTrack);
}
