import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  CallRecord,
  CallType,
  CallState,
  CallHistoryEntry,
  initiateCall,
  updateCallState,
  setCallOffer,
  setCallAnswer,
  addIceCandidate,
  subscribeToCall,
  subscribeToIncomingCall,
  subscribeToIceCandidates,
  writeCallHistory,
  getCallHistory,
  IceCandidate,
} from '@/lib/calls';
import {
  isWebRTCSupported,
  getLocalStream,
  stopStream,
  setAudioMuted,
  setVideoEnabled,
  switchCamera as doSwitchCamera,
  createPeerConnection,
  addLocalTracks,
  createOffer,
  createAnswer,
  applyAnswer,
  applyIceCandidate,
  closePeerConnection,
} from '@/lib/webrtc';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ActiveCall {
  callId: string;
  remoteUserId: string;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  state: CallState;
}

interface CallContextType {
  activeCall: ActiveCall | null;
  incomingCall: CallRecord | null;

  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeakerOn: boolean;

  startCall: (remoteUserId: string, type: CallType) => Promise<string>;
  answerCall: (callId: string, callerId: string, type: CallType) => Promise<void>;
  declineCall: (callId: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => void;
  toggleSpeaker: () => void;
  flipCamera: () => Promise<void>;

  listenForIceCandidates: (
    callId: string,
    localRole: 'caller' | 'callee',
    onCandidate: (c: IceCandidate) => void
  ) => () => void;

  callHistory: CallHistoryEntry[];
  loadCallHistory: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallRecord | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [callHistory, setCallHistory] = useState<CallHistoryEntry[]>([]);

  // Refs hold mutable values without causing stale closures in callbacks
  const activeCallIdRef = useRef<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceCandidateUnsubRef = useRef<(() => void) | null>(null);
  const callStateUnsubRef = useRef<(() => void) | null>(null);
  // ICE candidates that arrived before remote description was set
  const pendingCandidatesRef = useRef<IceCandidate[]>([]);
  const remoteDescSetRef = useRef(false);
  // Prevent processing the offer/answer more than once
  const offerProcessedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Sync localStreamRef whenever localStream state changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // ---------------------------------------------------------------------------
  // Core cleanup — all refs, no state captures
  // ---------------------------------------------------------------------------

  const cleanupMedia = useCallback(() => {
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  const cleanupCall = useCallback(() => {
    iceCandidateUnsubRef.current?.();
    iceCandidateUnsubRef.current = null;

    callStateUnsubRef.current?.();
    callStateUnsubRef.current = null;

    closePeerConnection(pcRef.current);
    pcRef.current = null;

    pendingCandidatesRef.current = [];
    remoteDescSetRef.current = false;
    offerProcessedRef.current = false;

    cleanupMedia();
  }, [cleanupMedia]);

  // ---------------------------------------------------------------------------
  // Write history + clear state
  // ---------------------------------------------------------------------------

  const finaliseCall = useCallback(
    async (call: CallRecord) => {
      const durationSeconds =
        call.startedAt && call.endedAt
          ? Math.round((call.endedAt.getTime() - call.startedAt.getTime()) / 1000)
          : null;

      writeCallHistory(
        call.id,
        call.callerId,
        call.calleeId,
        call.type,
        call.state,
        durationSeconds
      ).catch(() => {});

      activeCallIdRef.current = null;
      setActiveCall(null);
      setIncomingCall(null);
      cleanupCall();
    },
    [cleanupCall]
  );

  // ---------------------------------------------------------------------------
  // Incoming call subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!user) {
      setIncomingCall(null);
      return;
    }
    return subscribeToIncomingCall(user.uid, (call) => {
      // Ignore new ringing calls if already in one
      if (activeCallIdRef.current) return;
      setIncomingCall(call);
    });
  }, [user]);

  // ---------------------------------------------------------------------------
  // Active call state subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!activeCall) return;

    const { callId, direction } = activeCall;

    const unsub = subscribeToCall(callId, async (call) => {
      if (!call) return;

      setActiveCall((prev) => (prev ? { ...prev, state: call.state } : null));

      // ---- Callee: process offer (may arrive while state is still 'ringing') ----
      if (
        direction === 'incoming' &&
        call.offer &&
        pcRef.current &&
        !offerProcessedRef.current
      ) {
        offerProcessedRef.current = true;
        const pc = pcRef.current;
        const answer = await createAnswer(pc, call.offer);
        remoteDescSetRef.current = true;

        // Flush any ICE candidates that buffered before remote desc was set
        for (const c of pendingCandidatesRef.current) {
          await applyIceCandidate(pc, c);
        }
        pendingCandidatesRef.current = [];

        if (answer) {
          // setCallAnswer writes the answer + moves state → 'connecting'
          await setCallAnswer(callId, answer);
        }
      }

      // ---- Caller: apply remote answer ----
      if (
        direction === 'outgoing' &&
        call.answer &&
        pcRef.current &&
        !remoteDescSetRef.current
      ) {
        remoteDescSetRef.current = true;
        await applyAnswer(pcRef.current, call.answer);

        // Flush buffered candidates
        for (const c of pendingCandidatesRef.current) {
          await applyIceCandidate(pcRef.current, c);
        }
        pendingCandidatesRef.current = [];
      }

      // ---- Terminal states ----
      if (
        call.state === 'ended' ||
        call.state === 'declined' ||
        call.state === 'missed'
      ) {
        await finaliseCall(call);
      }
    });

    // Store unsub so cleanupCall() can cancel it too
    callStateUnsubRef.current = unsub;
    return () => {
      // Only unsubscribe here; cleanupCall is called explicitly on endCall/finalise
      unsub();
      callStateUnsubRef.current = null;
    };
  }, [activeCall?.callId, activeCall?.direction]);

  // ---------------------------------------------------------------------------
  // Setup RTCPeerConnection
  // ---------------------------------------------------------------------------

  const setupPeerConnection = useCallback(
    async (callId: string, type: CallType, role: 'caller' | 'callee'): Promise<RTCPeerConnection | null> => {
      if (!isWebRTCSupported()) return null;

      const stream = await getLocalStream(type === 'video');
      if (stream) {
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsCameraOn(type === 'video');
        setIsMuted(false);
      }

      const pc = createPeerConnection();
      if (!pc) return null;
      pcRef.current = pc;

      if (stream) addLocalTracks(pc, stream);

      // Accumulate remote tracks into a single MediaStream
      const remoteMs = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => {
          if (!remoteMs.getTrackById(t.id)) remoteMs.addTrack(t);
        });
        // Force re-render by passing a fresh reference
        setRemoteStream(new MediaStream(remoteMs.getTracks()));
      };

      // Transition to 'active' once ICE connection is established
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected' && activeCallIdRef.current) {
          updateCallState(activeCallIdRef.current, 'active').catch(() => {});
        }
        if (
          pc.connectionState === 'failed' ||
          pc.connectionState === 'disconnected'
        ) {
          if (activeCallIdRef.current) {
            updateCallState(activeCallIdRef.current, 'ended').catch(() => {});
          }
        }
      };

      // Forward local ICE candidates to Firestore under our role's subcollection
      pc.onicecandidate = ({ candidate }) => {
        if (!candidate) return;
        addIceCandidate(callId, role, {
          candidate: candidate.candidate,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          sdpMid: candidate.sdpMid ?? null,
        }).catch(() => {});
      };

      // Subscribe to the REMOTE peer's ICE candidates
      iceCandidateUnsubRef.current = subscribeToIceCandidates(
        callId,
        role,
        async (c) => {
          if (!pcRef.current) return;
          if (!remoteDescSetRef.current) {
            pendingCandidatesRef.current.push(c);
          } else {
            await applyIceCandidate(pcRef.current, c);
          }
        }
      );

      return pc;
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Public actions
  // ---------------------------------------------------------------------------

  const startCall = useCallback(
    async (remoteUserId: string, type: CallType): Promise<string> => {
      if (!user) return '';
      if (activeCallIdRef.current) return activeCallIdRef.current;

      const callId = await initiateCall(user.uid, remoteUserId, type);
      activeCallIdRef.current = callId;
      setActiveCall({ callId, remoteUserId, type, direction: 'outgoing', state: 'ringing' });

      const pc = await setupPeerConnection(callId, type, 'caller');
      if (pc) {
        const offer = await createOffer(pc);
        if (offer) await setCallOffer(callId, offer);
      }

      return callId;
    },
    [user, setupPeerConnection]
  );

  const answerCall = useCallback(
    async (callId: string, callerId: string, type: CallType) => {
      if (!user) return;
      if (activeCallIdRef.current) return;

      activeCallIdRef.current = callId;
      setIncomingCall(null);
      setActiveCall({ callId, remoteUserId: callerId, type, direction: 'incoming', state: 'connecting' });

      // Setup PC — the offer arrives via the call doc subscription which will
      // call createAnswer + setCallAnswer (which also sets state → 'connecting').
      await setupPeerConnection(callId, type, 'callee');
    },
    [user, setupPeerConnection]
  );

  const declineCall = useCallback(async (callId: string) => {
    await updateCallState(callId, 'declined');
    setIncomingCall(null);
  }, []);

  const endCall = useCallback(async () => {
    const callId = activeCallIdRef.current;
    if (!callId) return;
    await updateCallState(callId, 'ended');
    // finaliseCall will be triggered by the subscription, but pre-clear refs
    // so the subscription ignores this call going forward
    activeCallIdRef.current = null;
    setActiveCall(null);
    cleanupCall();
  }, [cleanupCall]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      setAudioMuted(localStreamRef.current, next);
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    setIsCameraOn((prev) => {
      const next = !prev;
      setVideoEnabled(localStreamRef.current, next);
      return next;
    });
  }, []);

  const toggleSpeaker = useCallback(() => {
    setIsSpeakerOn((prev) => !prev);
  }, []);

  const flipCamera = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newStream = await doSwitchCamera(stream);
    if (!newStream || !pcRef.current) return;

    const newVideoTrack = newStream.getVideoTracks()[0];
    if (newVideoTrack) {
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
    }

    // Stop old video tracks only, keep audio
    stream.getVideoTracks().forEach((t) => t.stop());
    const combined = new MediaStream([
      ...stream.getAudioTracks(),
      ...newStream.getVideoTracks(),
    ]);
    localStreamRef.current = combined;
    setLocalStream(combined);
  }, []);

  const listenForIceCandidates = useCallback(
    (callId: string, localRole: 'caller' | 'callee', onCandidate: (c: IceCandidate) => void) =>
      subscribeToIceCandidates(callId, localRole, onCandidate),
    []
  );

  const loadCallHistory = useCallback(async () => {
    if (!user) return;
    setCallHistory(await getCallHistory(user.uid));
  }, [user]);

  return (
    <CallContext.Provider
      value={{
        activeCall,
        incomingCall,
        localStream,
        remoteStream,
        isMuted,
        isCameraOn,
        isSpeakerOn,
        startCall,
        answerCall,
        declineCall,
        endCall,
        toggleMute,
        toggleCamera,
        toggleSpeaker,
        flipCamera,
        listenForIceCandidates,
        callHistory,
        loadCallHistory,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall(): CallContextType {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used within CallProvider');
  return ctx;
}
