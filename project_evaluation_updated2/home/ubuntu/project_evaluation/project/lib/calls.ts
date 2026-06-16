import {
  db,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  orderBy,
  limit,
  deleteDoc,
} from '@/lib/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CallType = 'voice' | 'video';

export type CallState =
  | 'idle'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'ended'
  | 'missed'
  | 'declined';

export interface CallRecord {
  id: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  state: CallState;
  offer: RTCSessionDescriptionInit | null;
  answer: RTCSessionDescriptionInit | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  createdAt: Date;
}

export interface IceCandidate {
  candidate: string;
  sdpMLineIndex: number | null;
  sdpMid: string | null;
}

export interface SignalingData {
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
}

// ---------------------------------------------------------------------------
// Call CRUD  (collection: `calls/{callId}`)
// ---------------------------------------------------------------------------

export async function initiateCall(
  callerId: string,
  calleeId: string,
  type: CallType
): Promise<string> {
  const ref = await addDoc(collection(db, 'calls'), {
    callerId,
    calleeId,
    type,
    state: 'ringing' as CallState,
    offer: null,
    answer: null,
    startedAt: null,
    endedAt: null,
    durationSeconds: null,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCallState(callId: string, state: CallState): Promise<void> {
  const updates: Record<string, unknown> = { state };
  if (state === 'active') updates.startedAt = serverTimestamp();
  if (state === 'ended' || state === 'declined' || state === 'missed') {
    updates.endedAt = serverTimestamp();
  }
  await updateDoc(doc(db, 'calls', callId), updates);
}

export async function setCallOffer(
  callId: string,
  offer: RTCSessionDescriptionInit
): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), { offer });
}

export async function setCallAnswer(
  callId: string,
  answer: RTCSessionDescriptionInit
): Promise<void> {
  await updateDoc(doc(db, 'calls', callId), {
    answer,
    state: 'connecting' as CallState,
  });
}

export async function addIceCandidate(
  callId: string,
  role: 'caller' | 'callee',
  candidate: IceCandidate
): Promise<void> {
  await addDoc(
    collection(db, 'calls', callId, role === 'caller' ? 'callerCandidates' : 'calleeCandidates'),
    { ...candidate, createdAt: serverTimestamp() }
  );
}

export function subscribeToCall(
  callId: string,
  callback: (call: CallRecord | null) => void
): () => void {
  return onSnapshot(doc(db, 'calls', callId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data();
    callback({
      id: snap.id,
      callerId: data.callerId as string,
      calleeId: data.calleeId as string,
      type: data.type as CallType,
      state: data.state as CallState,
      offer: data.offer ?? null,
      answer: data.answer ?? null,
      startedAt: data.startedAt?.toDate() ?? null,
      endedAt: data.endedAt?.toDate() ?? null,
      durationSeconds: data.durationSeconds ?? null,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    });
  });
}

/**
 * Subscribe to ICE candidates emitted by the REMOTE peer.
 * Pass your own role — the function subscribes to the other side's subcollection.
 * Caller subscribes to calleeCandidates; callee subscribes to callerCandidates.
 */
export function subscribeToIceCandidates(
  callId: string,
  localRole: 'caller' | 'callee',
  callback: (candidate: IceCandidate) => void
): () => void {
  const subColl = localRole === 'caller' ? 'calleeCandidates' : 'callerCandidates';
  return onSnapshot(collection(db, 'calls', callId, subColl), (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        callback({
          candidate: data.candidate as string,
          sdpMLineIndex: data.sdpMLineIndex ?? null,
          sdpMid: data.sdpMid ?? null,
        });
      }
    });
  });
}

/** Subscribe to incoming ringing calls for a user. */
export function subscribeToIncomingCall(
  userId: string,
  callback: (call: CallRecord | null) => void
): () => void {
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', userId),
    where('state', '==', 'ringing')
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
      return;
    }
    const d = snap.docs[0].data();
    callback({
      id: snap.docs[0].id,
      callerId: d.callerId as string,
      calleeId: d.calleeId as string,
      type: d.type as CallType,
      state: d.state as CallState,
      offer: d.offer ?? null,
      answer: d.answer ?? null,
      startedAt: d.startedAt?.toDate() ?? null,
      endedAt: d.endedAt?.toDate() ?? null,
      durationSeconds: d.durationSeconds ?? null,
      createdAt: d.createdAt?.toDate() ?? new Date(),
    });
  });
}

// ---------------------------------------------------------------------------
// Call History  (collection: `callHistory/{userId_callId}`)
// ---------------------------------------------------------------------------

export interface CallHistoryEntry {
  id: string;
  callId: string;
  userId: string;
  remoteUserId: string;
  type: CallType;
  direction: 'incoming' | 'outgoing';
  state: CallState;
  durationSeconds: number | null;
  createdAt: Date;
}

export async function writeCallHistory(
  callId: string,
  callerId: string,
  calleeId: string,
  type: CallType,
  state: CallState,
  durationSeconds: number | null
): Promise<void> {
  const entries = [
    {
      docId: `${callerId}_${callId}`,
      data: {
        callId,
        userId: callerId,
        remoteUserId: calleeId,
        type,
        direction: 'outgoing',
        state,
        durationSeconds,
        createdAt: serverTimestamp(),
      },
    },
    {
      docId: `${calleeId}_${callId}`,
      data: {
        callId,
        userId: calleeId,
        remoteUserId: callerId,
        type,
        direction: 'incoming',
        state,
        durationSeconds,
        createdAt: serverTimestamp(),
      },
    },
  ];

  await Promise.all(
    entries.map(({ docId, data }) =>
      setDoc(doc(db, 'callHistory', docId), data)
    )
  );
}

export async function getCallHistory(
  userId: string,
  pageLimit = 30
): Promise<CallHistoryEntry[]> {
  const q = query(
    collection(db, 'callHistory'),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(pageLimit)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      callId: data.callId as string,
      userId: data.userId as string,
      remoteUserId: data.remoteUserId as string,
      type: data.type as CallType,
      direction: data.direction as 'incoming' | 'outgoing',
      state: data.state as CallState,
      durationSeconds: data.durationSeconds ?? null,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });
}
