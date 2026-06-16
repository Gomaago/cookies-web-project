import {
  db,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  addDoc,
  updateDoc,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from '@/lib/firebase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlockRecord {
  blockerId: string;
  blockedId: string;
  createdAt: Date;
}

export type MuteTarget = 'chat' | 'room';

export interface MuteRecord {
  userId: string;
  targetId: string;
  targetType: MuteTarget;
  createdAt: Date;
}

export type LastSeenVisibility = 'everyone' | 'friends' | 'nobody';
export type ProfilePhotoVisibility = 'everyone' | 'friends' | 'nobody';

export interface PrivacySettings {
  userId: string;
  lastSeenVisibility: LastSeenVisibility;
  profilePhotoVisibility: ProfilePhotoVisibility;
  updatedAt: Date;
}

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate_speech'
  | 'inappropriate_content'
  | 'impersonation'
  | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'inappropriate_content', label: 'Inappropriate Content' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Blocking  (collection: `blocks/{blockerId_blockedId}`)
// ---------------------------------------------------------------------------

function blockDocId(blockerId: string, blockedId: string): string {
  return `${blockerId}_${blockedId}`;
}

export async function blockUser(blockerId: string, blockedId: string): Promise<void> {
  await setDoc(doc(db, 'blocks', blockDocId(blockerId, blockedId)), {
    blockerId,
    blockedId,
    createdAt: serverTimestamp(),
  });
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<void> {
  await deleteDoc(doc(db, 'blocks', blockDocId(blockerId, blockedId)));
}

export async function isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'blocks', blockDocId(blockerId, blockedId)));
  return snap.exists();
}

/** Returns ids of users blocked by `userId`. */
export async function getBlockedUsers(userId: string): Promise<string[]> {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data().blockedId as string);
}

/** Subscribe to the current user's block list. Returns unsubscribe fn. */
export function subscribeToBlockedUsers(
  userId: string,
  callback: (blockedIds: string[]) => void
): () => void {
  const q = query(collection(db, 'blocks'), where('blockerId', '==', userId));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => d.data().blockedId as string));
  });
}

// ---------------------------------------------------------------------------
// Reporting  (reuses existing `reports` collection in firestore.ts)
// ---------------------------------------------------------------------------

export async function reportUser(
  reporterId: string,
  reportedUserId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId,
    reportedUserId,
    reportedMessageId: null,
    reportedRoomId: null,
    reason,
    details: details ?? '',
    status: 'pending',
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });
}

export async function reportMessage(
  reporterId: string,
  messageId: string,
  reportedUserId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId,
    reportedUserId,
    reportedMessageId: messageId,
    reportedRoomId: null,
    reason,
    details: details ?? '',
    status: 'pending',
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });
}

export async function reportRoom(
  reporterId: string,
  roomId: string,
  reason: ReportReason,
  details?: string
): Promise<void> {
  await addDoc(collection(db, 'reports'), {
    reporterId,
    reportedUserId: null,
    reportedMessageId: null,
    reportedRoomId: roomId,
    reason,
    details: details ?? '',
    status: 'pending',
    createdAt: serverTimestamp(),
    resolvedAt: null,
    resolvedBy: null,
  });
}

// ---------------------------------------------------------------------------
// Muting  (collection: `mutes/{userId_targetId}`)
// ---------------------------------------------------------------------------

function muteDocId(userId: string, targetId: string): string {
  return `${userId}_${targetId}`;
}

export async function muteTarget(
  userId: string,
  targetId: string,
  targetType: MuteTarget
): Promise<void> {
  await setDoc(doc(db, 'mutes', muteDocId(userId, targetId)), {
    userId,
    targetId,
    targetType,
    createdAt: serverTimestamp(),
  });
}

export async function unmuteTarget(userId: string, targetId: string): Promise<void> {
  await deleteDoc(doc(db, 'mutes', muteDocId(userId, targetId)));
}

export async function isMuted(userId: string, targetId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'mutes', muteDocId(userId, targetId)));
  return snap.exists();
}

/** Subscribe to the current user's mute list. Returns unsubscribe fn. */
export function subscribeToMutes(
  userId: string,
  callback: (muteRecords: MuteRecord[]) => void
): () => void {
  const q = query(collection(db, 'mutes'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          userId: data.userId as string,
          targetId: data.targetId as string,
          targetType: data.targetType as MuteTarget,
          createdAt: data.createdAt?.toDate() ?? new Date(),
        };
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Privacy settings  (collection: `privacySettings/{userId}`)
// ---------------------------------------------------------------------------

const DEFAULT_PRIVACY: Omit<PrivacySettings, 'userId' | 'updatedAt'> = {
  lastSeenVisibility: 'everyone',
  profilePhotoVisibility: 'everyone',
};

export async function getPrivacySettings(userId: string): Promise<PrivacySettings> {
  const snap = await getDoc(doc(db, 'privacySettings', userId));
  if (snap.exists()) {
    const data = snap.data();
    return {
      userId,
      lastSeenVisibility: data.lastSeenVisibility ?? DEFAULT_PRIVACY.lastSeenVisibility,
      profilePhotoVisibility:
        data.profilePhotoVisibility ?? DEFAULT_PRIVACY.profilePhotoVisibility,
      updatedAt: data.updatedAt?.toDate() ?? new Date(),
    };
  }
  return {
    userId,
    ...DEFAULT_PRIVACY,
    updatedAt: new Date(),
  };
}

export async function updatePrivacySettings(
  userId: string,
  updates: Partial<Omit<PrivacySettings, 'userId' | 'updatedAt'>>
): Promise<void> {
  await setDoc(
    doc(db, 'privacySettings', userId),
    { ...updates, userId, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export function subscribeToPrivacySettings(
  userId: string,
  callback: (settings: PrivacySettings) => void
): () => void {
  return onSnapshot(doc(db, 'privacySettings', userId), (snap) => {
    if (snap.exists()) {
      const data = snap.data();
      callback({
        userId,
        lastSeenVisibility: data.lastSeenVisibility ?? DEFAULT_PRIVACY.lastSeenVisibility,
        profilePhotoVisibility:
          data.profilePhotoVisibility ?? DEFAULT_PRIVACY.profilePhotoVisibility,
        updatedAt: data.updatedAt?.toDate() ?? new Date(),
      });
    } else {
      callback({ userId, ...DEFAULT_PRIVACY, updatedAt: new Date() });
    }
  });
}
