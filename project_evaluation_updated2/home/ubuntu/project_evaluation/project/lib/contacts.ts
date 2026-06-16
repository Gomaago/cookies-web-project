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

export type ContactStatus = 'accepted';

export interface Contact {
  id: string;          // document id = `${userId}_${contactId}`
  userId: string;
  contactId: string;
  createdAt: Date;
}

export type RequestStatus = 'pending' | 'accepted' | 'rejected';

export interface ContactRequest {
  id: string;
  senderId: string;
  receiverId: string;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Contacts  (collection: `contacts/{userId_contactId}`)
// ---------------------------------------------------------------------------

function contactDocId(userId: string, contactId: string): string {
  return `${userId}_${contactId}`;
}

export async function addContact(userId: string, contactId: string): Promise<void> {
  const batch = [
    setDoc(doc(db, 'contacts', contactDocId(userId, contactId)), {
      userId,
      contactId,
      createdAt: serverTimestamp(),
    }),
    setDoc(doc(db, 'contacts', contactDocId(contactId, userId)), {
      userId: contactId,
      contactId: userId,
      createdAt: serverTimestamp(),
    }),
  ];
  await Promise.all(batch);
}

export async function removeContact(userId: string, contactId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db, 'contacts', contactDocId(userId, contactId))),
    deleteDoc(doc(db, 'contacts', contactDocId(contactId, userId))),
  ]);
}

export async function isContact(userId: string, contactId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'contacts', contactDocId(userId, contactId)));
  return snap.exists();
}

export async function getContacts(userId: string): Promise<Contact[]> {
  const q = query(collection(db, 'contacts'), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: data.userId as string,
      contactId: data.contactId as string,
      createdAt: data.createdAt?.toDate() ?? new Date(),
    };
  });
}

export function subscribeToContacts(
  userId: string,
  callback: (contacts: Contact[]) => void
): () => void {
  const q = query(collection(db, 'contacts'), where('userId', '==', userId));
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          userId: data.userId as string,
          contactId: data.contactId as string,
          createdAt: data.createdAt?.toDate() ?? new Date(),
        };
      })
    );
  });
}

// ---------------------------------------------------------------------------
// Contact Requests  (collection: `contactRequests/{requestId}`)
// ---------------------------------------------------------------------------

export async function sendContactRequest(
  senderId: string,
  receiverId: string
): Promise<string> {
  // Prevent duplicate pending requests
  const existing = query(
    collection(db, 'contactRequests'),
    where('senderId', '==', senderId),
    where('receiverId', '==', receiverId),
    where('status', '==', 'pending')
  );
  const existingSnap = await getDocs(existing);
  if (!existingSnap.empty) return existingSnap.docs[0].id;

  const ref = await addDoc(collection(db, 'contactRequests'), {
    senderId,
    receiverId,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function acceptContactRequest(requestId: string): Promise<void> {
  const reqRef = doc(db, 'contactRequests', requestId);
  const reqSnap = await getDoc(reqRef);
  if (!reqSnap.exists()) return;

  const { senderId, receiverId } = reqSnap.data() as { senderId: string; receiverId: string };

  await Promise.all([
    updateDoc(reqRef, { status: 'accepted', updatedAt: serverTimestamp() }),
    addContact(senderId, receiverId),
  ]);
}

export async function rejectContactRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, 'contactRequests', requestId), {
    status: 'rejected',
    updatedAt: serverTimestamp(),
  });
}

/** Subscribe to incoming pending requests for a user. */
export function subscribeToIncomingRequests(
  userId: string,
  callback: (requests: ContactRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'contactRequests'),
    where('receiverId', '==', userId),
    where('status', '==', 'pending')
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId as string,
          receiverId: data.receiverId as string,
          status: data.status as RequestStatus,
          createdAt: data.createdAt?.toDate() ?? new Date(),
          updatedAt: data.updatedAt?.toDate() ?? new Date(),
        };
      })
    );
  });
}

/** Subscribe to outgoing requests sent by a user (any status). */
export function subscribeToOutgoingRequests(
  userId: string,
  callback: (requests: ContactRequest[]) => void
): () => void {
  const q = query(
    collection(db, 'contactRequests'),
    where('senderId', '==', userId)
  );
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          senderId: data.senderId as string,
          receiverId: data.receiverId as string,
          status: data.status as RequestStatus,
          createdAt: data.createdAt?.toDate() ?? new Date(),
          updatedAt: data.updatedAt?.toDate() ?? new Date(),
        };
      })
    );
  });
}
