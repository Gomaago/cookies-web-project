import { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useCall } from '@/contexts/CallContext';
import { useAuth } from '@/contexts/AuthContext';
import { getUserProfile } from '@/lib/firestore';
import { UserProfile } from '@/contexts/AuthContext';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Camera,
  CameraOff,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Web-only video element
// ---------------------------------------------------------------------------

function VideoView({
  stream,
  muted = false,
  style,
}: {
  stream: MediaStream | null;
  muted?: boolean;
  style?: object;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    ref.current.srcObject = stream;
    if (stream) ref.current.play().catch(() => {});
  }, [stream]);

  if (Platform.OS !== 'web') return null;

  return (
    // @ts-ignore
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      style={{ width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#000', ...style }}
    />
  );
}

// Web-only hidden audio element for remote audio
function AudioOutput({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !ref.current) return;
    ref.current.srcObject = stream;
    if (stream) ref.current.play().catch(() => {});
  }, [stream]);

  if (Platform.OS !== 'web') return null;
  // @ts-ignore
  return <audio ref={ref} autoPlay playsInline style={{ display: 'none' }} />;
}

// ---------------------------------------------------------------------------
// Duration timer (starts from 0 when running=true)
// ---------------------------------------------------------------------------

function useDuration(running: boolean) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CallScreen() {
  const { id: callId } = useLocalSearchParams<{ id: string }>();
  const {
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    isMuted,
    isCameraOn,
    isSpeakerOn,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    toggleCamera,
    toggleSpeaker,
    flipCamera,
  } = useCall();
  const { user } = useAuth();
  const [remoteProfile, setRemoteProfile] = useState<UserProfile | null>(null);
  const didNavigateRef = useRef(false);

  // Determine which call this screen is showing
  const isActiveCall = activeCall?.callId === callId;
  const isIncomingRing = !isActiveCall && incomingCall?.id === callId;

  const callType = isActiveCall ? activeCall.type : (incomingCall?.type ?? 'voice');
  const callDirection = isActiveCall ? activeCall.direction : 'incoming';
  const callState = isActiveCall ? activeCall.state : (incomingCall?.state ?? 'ringing');
  const remoteUserId = isActiveCall
    ? activeCall.remoteUserId
    : (incomingCall?.callerId ?? '');

  const isActive = callState === 'active';
  const isConnecting = callState === 'connecting';
  const isRinging = callState === 'ringing';
  const isIncoming = callDirection === 'incoming';
  const isVideoCall = callType === 'video';

  const duration = useDuration(isActive);

  // Load remote user profile
  useEffect(() => {
    if (!remoteUserId) return;
    getUserProfile(remoteUserId).then((p) => { if (p) setRemoteProfile(p); });
  }, [remoteUserId]);

  // Navigate away when this call is no longer present in context
  useEffect(() => {
    const callStillPresent = isActiveCall || isIncomingRing;
    if (!callStillPresent && !didNavigateRef.current) {
      didNavigateRef.current = true;
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [isActiveCall, isIncomingRing]);

  const handleAnswer = useCallback(async () => {
    if (!incomingCall) return;
    await answerCall(incomingCall.id, incomingCall.callerId, incomingCall.type);
    // Stay on this screen — the call transitions to connecting/active
  }, [incomingCall, answerCall]);

  const handleEnd = useCallback(async () => {
    didNavigateRef.current = true;
    if (isIncomingRing) {
      // Callee declines a ringing call
      await declineCall(incomingCall!.id);
    } else {
      // Caller cancels ringing, or either side ends an active call
      await endCall();
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [isIncomingRing, incomingCall, declineCall, endCall]);

  const remoteName = remoteProfile?.displayName ?? remoteUserId;
  const remoteAvatar = remoteProfile?.avatarUrl
    ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(remoteName)}&background=374151&color=fff&size=120`;

  const statusText = isActive
    ? duration
    : isConnecting
    ? 'Connecting…'
    : isIncoming
    ? (isVideoCall ? 'Incoming video call' : 'Incoming voice call')
    : 'Ringing…';

  const showLocalVideo = isVideoCall && isCameraOn && !!localStream;
  const showRemoteVideo = isVideoCall && !!remoteStream;

  if (!isActiveCall && !isIncomingRing) {
    // Screen was opened but context doesn't know about this call — will navigate away
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      {/* Background: remote video or avatar */}
      {showRemoteVideo ? (
        <View style={StyleSheet.absoluteFill}>
          <VideoView stream={remoteStream} />
        </View>
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.avatarBg]}>
          {Platform.OS === 'web' ? (
            // @ts-ignore
            <img
              src={remoteAvatar}
              style={{ width: 120, height: 120, borderRadius: 60, objectFit: 'cover' }}
              alt={remoteName}
            />
          ) : null}
        </View>
      )}

      {/* Remote audio (always rendered, controls output stream) */}
      <AudioOutput stream={remoteStream} />

      {/* Dim overlay on video */}
      {showRemoteVideo && <View style={styles.videoOverlay} />}

      {/* Top: name + status */}
      <View style={styles.topInfo}>
        <Text style={styles.remoteName} numberOfLines={1}>{remoteName}</Text>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      {/* Local video PiP */}
      {showLocalVideo && (
        <View style={styles.localVideo}>
          <VideoView stream={localStream} muted />
        </View>
      )}

      {/* Controls panel */}
      <View style={styles.controls}>
        {/* Middle row: toggles */}
        <View style={styles.midRow}>
          <CtrlBtn
            onPress={toggleMute}
            active={isMuted}
            activeColor="#EF4444"
            Icon={isMuted ? MicOff : Mic}
            label={isMuted ? 'Unmute' : 'Mute'}
          />
          {isVideoCall && (
            <CtrlBtn
              onPress={toggleCamera}
              active={!isCameraOn}
              activeColor="#EF4444"
              Icon={isCameraOn ? Camera : CameraOff}
              label={isCameraOn ? 'Cam off' : 'Cam on'}
            />
          )}
          <CtrlBtn
            onPress={toggleSpeaker}
            active={!isSpeakerOn}
            activeColor="#6B7280"
            Icon={isSpeakerOn ? Volume2 : VolumeX}
            label="Speaker"
          />
          {isVideoCall && (
            <CtrlBtn
              onPress={flipCamera}
              active={false}
              activeColor="transparent"
              Icon={RotateCcw}
              label="Flip"
            />
          )}
        </View>

        {/* Bottom row: answer + end */}
        <View style={styles.bottomRow}>
          {isIncoming && isRinging && (
            <TouchableOpacity style={styles.answerBtn} onPress={handleAnswer}>
              <Phone size={28} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
            <PhoneOff size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Control button
// ---------------------------------------------------------------------------

function CtrlBtn({
  onPress,
  active,
  activeColor,
  Icon,
  label,
}: {
  onPress: () => void;
  active: boolean;
  activeColor: string;
  Icon: React.ComponentType<{ size: number; color: string }>;
  label: string;
}) {
  return (
    <TouchableOpacity style={styles.ctrlWrap} onPress={onPress}>
      <View style={[styles.ctrlCircle, active && { backgroundColor: activeColor }]}>
        <Icon size={22} color="#FFFFFF" />
      </View>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  avatarBg: {
    backgroundColor: '#1F2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topInfo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  remoteName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  statusText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  localVideo: {
    position: 'absolute',
    top: 140,
    right: 16,
    width: 100,
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: '#000',
  },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 20,
    paddingBottom: 48,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  midRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginBottom: 28,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
  },
  ctrlWrap: {
    alignItems: 'center',
    gap: 6,
  },
  ctrlCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctrlLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  answerBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  endBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
});
