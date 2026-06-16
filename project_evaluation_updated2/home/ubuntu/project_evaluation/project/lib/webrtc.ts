import { Platform } from 'react-native';
import { IceCandidate } from '@/lib/calls';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ---------------------------------------------------------------------------
// Platform guard
// WebRTC is only available on web in this Expo project.
// On native platforms, peer connections are not created (no react-native-webrtc).
// ---------------------------------------------------------------------------

export function isWebRTCSupported(): boolean {
  return Platform.OS === 'web' && typeof RTCPeerConnection !== 'undefined';
}

// ---------------------------------------------------------------------------
// Media permissions & stream acquisition
// ---------------------------------------------------------------------------

export type MediaKind = 'audio' | 'video';

export async function getLocalStream(withVideo: boolean): Promise<MediaStream | null> {
  if (!isWebRTCSupported()) return null;
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: withVideo
        ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        : false,
    });
  } catch (error) {
    console.error("[WebRTC] getLocalStream error:", error);
    return null;
  }
}

export async function switchCamera(stream: MediaStream): Promise<MediaStream | null> {
  if (!isWebRTCSupported()) return null;
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) return null;

  const currentFacing = (videoTrack.getSettings() as MediaTrackSettings & { facingMode?: string })
    .facingMode ?? 'user';
  const nextFacing = currentFacing === 'user' ? 'environment' : 'user';

  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: nextFacing },
    });
    return newStream;
  } catch (error) {
    console.error("[WebRTC] switchCamera error:", error);
    return null;
  }
}

export function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((t) => t.stop());
}

export function setAudioMuted(stream: MediaStream | null, muted: boolean): void {
  if (!stream) return;
  stream.getAudioTracks().forEach((t) => {
    t.enabled = !muted;
  });
}

export function setVideoEnabled(stream: MediaStream | null, enabled: boolean): void {
  if (!stream) return;
  stream.getVideoTracks().forEach((t) => {
    t.enabled = enabled;
  });
}

// ---------------------------------------------------------------------------
// RTCPeerConnection factory & helpers
// ---------------------------------------------------------------------------

export function createPeerConnection(): RTCPeerConnection | null {
  if (!isWebRTCSupported()) return null;
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

export function addLocalTracks(
  pc: RTCPeerConnection,
  stream: MediaStream
): void {
  stream.getTracks().forEach((track) => {
    pc.addTrack(track, stream);
  });
}

/** Build an offer, set it as local description, return it. */
export async function createOffer(
  pc: RTCPeerConnection
): Promise<RTCSessionDescriptionInit | null> {
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  } catch (error) {
    console.error("[WebRTC] createOffer error:", error);
    return null;
  }
}

/** Apply the remote offer, build an answer, set local description, return it. */
export async function createAnswer(
  pc: RTCPeerConnection,
  offer: RTCSessionDescriptionInit
): Promise<RTCSessionDescriptionInit | null> {
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  } catch (error) {
    console.error("[WebRTC] createAnswer error:", error);
    return null;
  }
}

/** Apply the remote answer. */
export async function applyAnswer(
  pc: RTCPeerConnection,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  try {
    if (pc.signalingState === 'have-local-offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (error) {
    console.error("[WebRTC] applyAnswer error:", error);
  }
}

/** Add a remote ICE candidate. Silently ignores failures. */
export async function applyIceCandidate(
  pc: RTCPeerConnection,
  candidate: IceCandidate
): Promise<void> {
  try {
    await pc.addIceCandidate(
      new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
        sdpMid: candidate.sdpMid ?? undefined,
      })
    );
  } catch (error) {
    console.error("[WebRTC] applyIceCandidate error:", error);
  }
}

export function closePeerConnection(pc: RTCPeerConnection | null): void {
  if (!pc) return;
  try {
    pc.close();
  } catch (error) {
    console.error("[WebRTC] closePeerConnection error:", error);
  }
}
