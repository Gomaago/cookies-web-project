import {
  db,
  storage,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  writeBatch,
  serverTimestamp,
  increment,
  arrayUnion,
  collection,
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from '@/lib/firebase';
import { UserProfile } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

// Room categories
export type RoomCategory = 'general' | 'technology' | 'gaming' | 'business' | 'sports' | 'travel';

export const ROOM_CATEGORIES: { value: RoomCategory; label: string; icon: string }[] = [
  { value: 'general', label: 'General', icon: '💬' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'gaming', label: 'Gaming', icon: '🎮' },
  { value: 'business', label: 'Business', icon: '💼' },
  { value: 'sports', label: 'Sports', icon: '⚽' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
];

// Types
export interface Chat {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: Message;
  unreadCount?: { [userId: string]: number };
}

export interface Message {
  id: string;
  chatId: string | null;
  roomId: string | null;
  senderId: string;
  content: string;
  messageType: 'text' | 'image' | 'voice';
  mediaUrl: string;
  createdAt: Date;
  // "Delete for everyone": set by sender (or admin in rooms)
  deletedAt: Date | null;
  deletedBy: string | null;
  isDeletedForEveryone: boolean;
  // "Delete for me": array of user IDs who have hidden this message
  deletedFor: string[];
  readAt?: { [userId: string]: Date };
  readBy?: string[];
}

export interface ChatRoom {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  ownerId: string;
  isPrivate: boolean;
  category: RoomCategory;
  rules: string[];
  activeUsers: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  lastActiveAt: Date;
  user?: UserProfile;
}

export interface TypingIndicator {
  chatId: string;
  userId: string;
  isTyping: boolean;
  updatedAt: Date;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedUserId: string | null;
  reportedMessageId: string | null;
  reportedRoomId: string | null;
  reason: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

// User functions

/**
 * Converts a URI (blob:, data:, or file:) to a Blob with the correct MIME type.
 * On web, expo-image-picker returns a blob: or data: URI.
 */
async function uriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('data:')) {
    const [header, base64] = uri.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`Failed to read image (${response.status})`);
  const blob = await response.blob();
  if (!blob.type || blob.type === 'application/octet-stream') {
    return new Blob([blob], { type: 'image/jpeg' });
  }
  return blob;
}

export const uploadAvatar = async (
  userId: string,
  imageUri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  // WARNING: This function relies on the Supabase 'avatars' bucket being public due to mixed authentication systems.
  // For a secure implementation, consider unifying authentication to Supabase Auth or using Supabase Edge Functions
  // to generate signed URLs after Firebase authentication. See evaluation_report.md for details.

  console.log('[uploadAvatar] starting, uri prefix:', imageUri.slice(0, 40));

  onProgress?.(10);
  const blob = await uriToBlob(imageUri);
  console.log('[uploadAvatar] blob size:', blob.size, 'type:', blob.type);

  if (blob.size === 0) throw new Error('Selected image is empty. Please pick a different photo.');

  const path = `${userId}/profile.jpg`;
  const contentType = blob.type || 'image/jpeg';

  onProgress?.(30);
  console.log('[uploadAvatar] uploading to Supabase Storage, path:', path);

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, { contentType, upsert: true });

  if (uploadError) {
    console.error('[uploadAvatar] Supabase upload error:', uploadError);
    throw new Error(`Avatar upload failed: ${uploadError.message}`);
  }

  onProgress?.(80);
  console.log('[uploadAvatar] upload complete, getting public URL');

  const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
  const publicUrl = urlData.publicUrl;

  if (!publicUrl) throw new Error('Could not get avatar URL after upload.');

  console.log('[uploadAvatar] public URL:', publicUrl.slice(0, 80));
  onProgress?.(90);
  return publicUrl;
};

export const uploadChatImage = async (
  chatId: string,
  imageUri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  onProgress?.(10);
  const blob = await uriToBlob(imageUri);
  if (blob.size === 0) throw new Error('Selected image is empty.');

  const path = `${chatId}/${Date.now()}.jpg`;
  const contentType = blob.type || 'image/jpeg';

  onProgress?.(30);
  const { error } = await supabase.storage
    .from('chat-images')
    .upload(path, blob, { contentType, upsert: false });

  if (error) throw new Error(`Chat image upload failed: ${error.message}`);

  onProgress?.(90);
  const { data } = supabase.storage.from('chat-images').getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Could not get image URL after upload.');
  return data.publicUrl;
};

export const uploadRoomImage = async (
  roomId: string,
  imageUri: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  onProgress?.(10);
  const blob = await uriToBlob(imageUri);
  if (blob.size === 0) throw new Error('Selected image is empty.');

  const path = `${roomId}/${Date.now()}.jpg`;
  const contentType = blob.type || 'image/jpeg';

  onProgress?.(30);
  const { error } = await supabase.storage
    .from('room-images')
    .upload(path, blob, { contentType, upsert: false });

  if (error) throw new Error(`Room image upload failed: ${error.message}`);

  onProgress?.(90);
  const { data } = supabase.storage.from('room-images').getPublicUrl(path);
  if (!data.publicUrl) throw new Error('Could not get image URL after upload.');
  return data.publicUrl;
};

export const getUserProfile = async (userId: string): Promise<UserProfile | null> => {
  const userDoc = await getDoc(doc(db, 'users', userId));
  if (!userDoc.exists()) return null;

  const data = userDoc.data() as any;
  return {
    id: userId,
    email: data.email || '',
    username: data.username || '',
    displayName: data.displayName || 'User',
    bio: data.bio || '',
    avatarUrl: data.avatarUrl || '',
    phone: data.phone || '',
    isAdmin: data.isAdmin || false,
    isBanned: data.isBanned || false,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  };
};

export const searchUsers = async (searchQuery: string, currentUserId: string): Promise<UserProfile[]> => {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  const users: UserProfile[] = [];
  const queryLower = searchQuery.toLowerCase();

  snapshot.forEach((docSnapshot) => {
    if (docSnapshot.id === currentUserId) return;
    const data = docSnapshot.data() as any;
    if (
      searchQuery === '' ||
      data.username?.toLowerCase().includes(queryLower) ||
      data.displayName?.toLowerCase().includes(queryLower)
    ) {
      users.push({
        id: docSnapshot.id,
        email: data.email || '',
        username: data.username || '',
        displayName: data.displayName || 'User',
        bio: data.bio || '',
        avatarUrl: data.avatarUrl || '',
        phone: data.phone || '',
        isAdmin: data.isAdmin || false,
        isBanned: data.isBanned || false,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      });
    }
  });

  return users;
};

// Chat functions with unread counts
export const getOrCreateChat = async (userId1: string, userId2: string): Promise<string> => {
  const chatsRef = collection(db, 'chats');

  // Check both orderings since we don't control which user is user1/user2
  const q1 = query(chatsRef, where('user1Id', '==', userId1), where('user2Id', '==', userId2));
  const q2 = query(chatsRef, where('user1Id', '==', userId2), where('user2Id', '==', userId1));

  const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

  if (!snap1.empty) return snap1.docs[0].id;
  if (!snap2.empty) return snap2.docs[0].id;

  const newChatRef = await addDoc(chatsRef, {
    user1Id: userId1,
    user2Id: userId2,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unreadCount: { [userId1]: 0, [userId2]: 0 },
  });

  return newChatRef.id;
};

export const getUserChats = async (userId: string): Promise<((Chat & { otherUser: UserProfile; lastMessage?: Message }))[]> => {
  const chatsRef = collection(db, 'chats');

  const [snap1, snap2] = await Promise.all([
    getDocs(query(chatsRef, where('user1Id', '==', userId))),
    getDocs(query(chatsRef, where('user2Id', '==', userId))),
  ]);

  const allDocs = [...snap1.docs, ...snap2.docs];
  const userChats: (Chat & { otherUser: UserProfile; lastMessage?: Message })[] = [];

  for (const docSnapshot of allDocs) {
    const data = docSnapshot.data() as any;
    const otherUserId = data.user1Id === userId ? data.user2Id : data.user1Id;
    const otherUser = await getUserProfile(otherUserId);

    if (otherUser) {
      let lastMessage: Message | undefined;
      if (data.lastMessage) {
        lastMessage = {
          id: docSnapshot.id, // Use chat ID as message ID for simplicity, or generate a new one if needed
          chatId: docSnapshot.id,
          roomId: null,
          senderId: data.lastMessage.senderId,
          content: data.lastMessage.content,
          messageType: data.lastMessage.messageType || 'text',
          mediaUrl: data.lastMessage.mediaUrl || '',
          createdAt: data.lastMessage.createdAt?.toDate() || new Date(),
          deletedAt: null,
          deletedBy: null,
          isDeletedForEveryone: false,
          deletedFor: [],
          readBy: [],
        };
      }

      userChats.push({
        id: docSnapshot.id,
        user1Id: data.user1Id,
        user2Id: data.user2Id,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        otherUser,
        lastMessage,
        unreadCount: data.unreadCount || { [userId]: 0 },
      });
    }
  }

  return userChats.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

// Real-time chat subscription
export const subscribeToUserChats = (
  userId: string,
  callback: (chats: (Chat & { otherUser: UserProfile; lastMessage?: Message })[]) => void
): (() => void) => {
  const chatsRef = collection(db, 'chats');

  // Subscribe to chats where current user is user1
  const q1 = query(chatsRef, where('user1Id', '==', userId));
  // Subscribe to chats where current user is user2
  const q2 = query(chatsRef, where('user2Id', '==', userId));

  let chatsAsUser1: (Chat & { otherUser: UserProfile; lastMessage?: Message })[] = [];
  let chatsAsUser2: (Chat & { otherUser: UserProfile; lastMessage?: Message })[] = [];

  const mergeAndCallback = () => {
    const merged = [...chatsAsUser1, ...chatsAsUser2];
    merged.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    callback(merged);
  };

  const buildChatList = async (
    snapshot: any,
    store: (chats: (Chat & { otherUser: UserProfile; lastMessage?: Message })[]) => void
  ) => {
    const result: (Chat & { otherUser: UserProfile; lastMessage?: Message })[] = [];

    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data() as any;
      const otherUserId = data.user1Id === userId ? data.user2Id : data.user1Id;
      const otherUser = await getUserProfile(otherUserId);

      if (otherUser) {
        let lastMessage: Message | undefined;
        if (data.lastMessage) {
          lastMessage = {
            id: docSnapshot.id, // Use chat ID as message ID for simplicity, or generate a new one if needed
            chatId: docSnapshot.id,
            roomId: null,
            senderId: data.lastMessage.senderId,
            content: data.lastMessage.content,
            messageType: data.lastMessage.messageType || 'text',
            mediaUrl: data.lastMessage.mediaUrl || '',
            createdAt: data.lastMessage.createdAt?.toDate() || new Date(),
            deletedAt: null,
            deletedBy: null,
            isDeletedForEveryone: false,
            deletedFor: [],
            readBy: [],
          };
        }

        result.push({
          id: docSnapshot.id,
          user1Id: data.user1Id,
          user2Id: data.user2Id,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
          otherUser,
          lastMessage,
          unreadCount: data.unreadCount || { [userId]: 0 },
        });
      }
    }

    store(result);
    mergeAndCallback();
  };

  const unsub1 = onSnapshot(q1, (snap) => buildChatList(snap, (c) => { chatsAsUser1 = c; }));
  const unsub2 = onSnapshot(q2, (snap) => buildChatList(snap, (c) => { chatsAsUser2 = c; }));

  return () => {
    unsub1();
    unsub2();
  };
};

// Message functions with read status

// Extract Supabase bucket + path from a public Supabase Storage URL.
// URL format: https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>
function supabasePathFromUrl(url: string): { bucket: string; path: string } | null {
  try {
    const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)/);
    if (!match) return null;
    return { bucket: match[1], path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

// Soft-delete: marks deletedAt so all clients show "[Message deleted]".
// "Delete for me": hides the message only for the calling user by adding their ID
// to the deletedFor array. Other participants still see the message.
export const deleteForMe = async (messageId: string, userId: string): Promise<void> => {
  console.log('[firestore] deleteForMe START, id:', messageId, 'userId:', userId);
  if (!messageId) throw new Error('deleteForMe: messageId is empty');
  const ref = doc(db, 'messages', messageId);
  // arrayUnion is idempotent — safe to call multiple times
  await updateDoc(ref, { deletedFor: arrayUnion(userId) });
  console.log('[firestore] deleteForMe DONE');
};

// "Delete for everyone": soft-deletes the message for all participants.
// Replaces content display with "This message was deleted".
// Also removes associated storage file if present.
export const deleteForEveryone = async (
  messageId: string,
  deletedBy: string,
  mediaUrl?: string
): Promise<void> => {
  console.log('[firestore] deleteForEveryone START, id:', messageId, 'by:', deletedBy);
  if (!messageId) throw new Error('deleteForEveryone: messageId is empty');
  if (mediaUrl) {
    const info = supabasePathFromUrl(mediaUrl);
    console.log('[firestore] deleteForEveryone storage info:', info);
    if (info) {
      const { error } = await supabase.storage.from(info.bucket).remove([info.path]);
      if (error) console.error('[firestore] deleteForEveryone storage removal error:', error);
      else console.log('[firestore] deleteForEveryone storage file removed');
    }
  }
  const ref = doc(db, 'messages', messageId);
  await updateDoc(ref, {
    deletedAt: serverTimestamp(),
    deletedBy,
    isDeletedForEveryone: true,
    // Clear media so it can't be accessed after deletion
    mediaUrl: '',
  });
  console.log('[firestore] deleteForEveryone DONE');
};

export const sendChatMessage = async (
  chatId: string,
  senderId: string,
  receiverId: string,
  content: string,
  messageType: 'text' | 'image' | 'voice' = 'text',
  mediaUrl: string = ''
): Promise<string> => {
  const batch = writeBatch(db);

  const messagesRef = doc(collection(db, 'messages'));
  batch.set(messagesRef, {
    chatId,
    roomId: null,
    senderId,
    content,
    messageType,
    mediaUrl,
    createdAt: serverTimestamp(),
    deletedAt: null,
    deletedBy: null,
    isDeletedForEveryone: false,
    deletedFor: [],
    readBy: [senderId],
  });

  const chatRef = doc(db, 'chats', chatId);
  batch.update(chatRef, {
    updatedAt: serverTimestamp(),
    [`unreadCount.${receiverId}`]: increment(1),
    lastMessage: {
      content: content,
      senderId: senderId,
      createdAt: serverTimestamp(),
      messageType: messageType,
      mediaUrl: mediaUrl || null,
    },
  });

  await batch.commit();
  return messagesRef.id;
};

export const markMessagesAsRead = async (chatId: string, userId: string): Promise<void> => {
  const messagesRef = collection(db, 'messages');
  const allMessagesQ = query(messagesRef, where('chatId', '==', chatId));
  const allMessagesSnapshot = await getDocs(allMessagesQ);

  const batch = writeBatch(db);
  let hasUpdates = false;

  allMessagesSnapshot.docs.forEach((docSnapshot) => {
    const data = docSnapshot.data() as any;
    if (!data.readBy?.includes(userId)) {
      batch.update(docSnapshot.ref, {
        readBy: [...(data.readBy || []), userId],
      });
      hasUpdates = true;
    }
  });

  const chatRef = doc(db, 'chats', chatId);
  batch.update(chatRef, {
    [`unreadCount.${userId}`]: 0,
  });

  await batch.commit();
};

export const subscribeToChatMessages = (
  chatId: string,
  callback: (messages: Message[], currentUserId: string) => void,
  currentUserId: string
): (() => void) => {
  const messagesRef = collection(db, 'messages');
  // No orderBy — avoids composite index requirement. Results sorted client-side.
  const q = query(messagesRef, where('chatId', '==', chatId));
  console.log('[subscribeToChatMessages] query: messages WHERE chatId ==', chatId);

  return onSnapshot(q, (snapshot) => {
    const messages: Message[] = snapshot.docs
      .map((docSnapshot) => {
        const data = docSnapshot.data() as any;
        return {
          id: docSnapshot.id,
          chatId: data.chatId,
          roomId: data.roomId,
          senderId: data.senderId,
          content: data.content,
          messageType: data.messageType,
          mediaUrl: data.mediaUrl || '',
          createdAt: data.createdAt?.toDate() || new Date(),
          deletedAt: data.deletedAt?.toDate() || null,
          deletedBy: data.deletedBy || null,
          isDeletedForEveryone: data.isDeletedForEveryone || false,
          deletedFor: data.deletedFor || [],
          readBy: data.readBy || [],
        };
      })
      // Filter out messages the current user has hidden with "Delete for me"
      .filter((m) => !m.deletedFor.includes(currentUserId))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    callback(messages, currentUserId);
  });
};

// Typing indicators
export const setTypingIndicator = async (chatId: string, userId: string, isTyping: boolean): Promise<void> => {
  const typingRef = doc(db, 'typing', `${chatId}_${userId}`);
  if (isTyping) {
    await setDoc(typingRef, {
      chatId,
      userId,
      isTyping: true,
      updatedAt: serverTimestamp(),
    });
  } else {
    await deleteDoc(typingRef);
  }
};

export const subscribeToTypingIndicator = (
  chatId: string,
  userId: string,
  callback: (isTyping: boolean) => void
): (() => void) => {
  const typingRef = collection(db, 'typing');
  const q = query(typingRef, where('chatId', '==', chatId));

  return onSnapshot(q, (snapshot) => {
    let otherUserTyping = false;
    snapshot.docs.forEach((docSnapshot) => {
      const data = docSnapshot.data() as any;
      if (data.userId !== userId && data.isTyping) {
        otherUserTyping = true;
      }
    });
    callback(otherUserTyping);
  });
};

// Media upload functions
export const uploadImage = async (
  uri: string,
  chatId: string,
  senderId: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const filename = `chats/${chatId}/${senderId}/${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);

  const uploadTask = uploadBytesResumable(storageRef, blob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadUrl);
      }
    );
  });
};

export const uploadVoiceMessage = async (
  uri: string,
  chatId: string,
  senderId: string,
  onProgress?: (progress: number) => void
): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  const filename = `chats/${chatId}/${senderId}/${Date.now()}.m4a`;
  const storageRef = ref(storage, filename);

  const uploadTask = uploadBytesResumable(storageRef, blob);

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        onProgress?.(progress);
      },
      (error) => reject(error),
      async () => {
        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
        resolve(downloadUrl);
      }
    );
  });
};

// Chat Room functions
export const getChatRooms = async (
  category?: RoomCategory,
  includePrivate: boolean = false
): Promise<(ChatRoom & { memberCount: number; lastMessage?: Message; isInRoom?: boolean })[]> => {
  const roomsRef = collection(db, 'chatRooms');
  let q = query(roomsRef, orderBy('updatedAt', 'desc'));

  const snapshot = await getDocs(q);
  const rooms: (ChatRoom & { memberCount: number; lastMessage?: Message })[] = [];

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data() as any;

    // Filter by category if specified
    if (category && data.category !== category) continue;

    // Filter private rooms if not including
    if (!includePrivate && data.isPrivate) continue;

    const membersRef = collection(db, 'chatRoomMembers');
    const membersQ = query(membersRef, where('roomId', '==', docSnapshot.id));
    const membersSnapshot = await getDocs(membersQ);

    const messagesRef = collection(db, 'messages');
    const messagesQ = query(messagesRef, where('roomId', '==', docSnapshot.id));
    const messagesSnapshot = await getDocs(messagesQ);
    let lastMessage: Message | undefined;
    if (!messagesSnapshot.empty) {
      const sorted = messagesSnapshot.docs.sort((a, b) => {
        const aTime = (a.data().createdAt?.toDate() as Date | null)?.getTime() ?? 0;
        const bTime = (b.data().createdAt?.toDate() as Date | null)?.getTime() ?? 0;
        return bTime - aTime;
      });
      const msgData = sorted[0].data() as any;
      lastMessage = {
        id: sorted[0].id,
        chatId: msgData.chatId,
        roomId: msgData.roomId,
        senderId: msgData.senderId,
        content: msgData.content,
        messageType: msgData.messageType,
        mediaUrl: msgData.mediaUrl || '',
        createdAt: msgData.createdAt?.toDate() || new Date(),
        deletedAt: msgData.deletedAt?.toDate() || null,
        deletedBy: msgData.deletedBy || null,
        isDeletedForEveryone: msgData.isDeletedForEveryone || false,
        deletedFor: msgData.deletedFor || [],
        readBy: msgData.readBy || [],
      };
    }

    rooms.push({
      id: docSnapshot.id,
      name: data.name,
      description: data.description || '',
      imageUrl: data.imageUrl || '',
      ownerId: data.ownerId,
      isPrivate: data.isPrivate,
      category: data.category || 'general',
      rules: data.rules || [],
      activeUsers: data.activeUsers || 0,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
      memberCount: membersSnapshot.size,
      lastMessage,
    });
  }

  return rooms;
};

export const createChatRoom = async (
  name: string,
  ownerId: string,
  description: string = '',
  isPrivate: boolean = false,
  category: RoomCategory = 'general',
  rules: string[] = [],
  imageUrl: string = ''
): Promise<string> => {
  const batch = writeBatch(db);

  const roomRef = doc(collection(db, 'chatRooms'));
  batch.set(roomRef, {
    name,
    description,
    imageUrl,
    ownerId,
    isPrivate,
    category,
    rules,
    activeUsers: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const memberRef = doc(collection(db, 'chatRoomMembers'));
  batch.set(memberRef, {
    roomId: roomRef.id,
    userId: ownerId,
    role: 'owner',
    joinedAt: serverTimestamp(),
    lastActiveAt: serverTimestamp(),
  });

  await batch.commit();
  return roomRef.id;
};

export const updateChatRoom = async (
  roomId: string,
  updates: Partial<ChatRoom>
): Promise<void> => {
  await updateDoc(doc(db, 'chatRooms', roomId), {
    ...updates,
    updatedAt: serverTimestamp(),
  });
};

export const deleteChatRoomById = async (roomId: string): Promise<void> => {
  // Delete all members
  const membersRef = collection(db, 'chatRoomMembers');
  const membersQ = query(membersRef, where('roomId', '==', roomId));
  const membersSnapshot = await getDocs(membersQ);

  const batch = writeBatch(db);
  membersSnapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  // Delete all messages
  const messagesRef = collection(db, 'messages');
  const messagesQ = query(messagesRef, where('roomId', '==', roomId));
  const messagesSnapshot = await getDocs(messagesQ);
  messagesSnapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });

  // Delete the room
  batch.delete(doc(db, 'chatRooms', roomId));

  await batch.commit();
};

export const joinChatRoom = async (roomId: string, userId: string): Promise<void> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const existingQ = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const existing = await getDocs(existingQ);

  if (existing.empty) {
    const batch = writeBatch(db);
    const memberRef = doc(collection(db, 'chatRoomMembers'));
    batch.set(memberRef, {
      roomId,
      userId,
      role: 'member',
      joinedAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
    });
    batch.update(doc(db, 'chatRooms', roomId), {
      activeUsers: increment(1),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  }
};

export const leaveChatRoom = async (roomId: string, userId: string): Promise<void> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });
  batch.update(doc(db, 'chatRooms', roomId), {
    activeUsers: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
};

export const isRoomMember = async (roomId: string, userId: string): Promise<boolean> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const getRoomMembers = async (roomId: string): Promise<RoomMember[]> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId));
  const snapshot = await getDocs(q);

  const members: RoomMember[] = [];
  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data() as any;
    const user = await getUserProfile(data.userId);
    members.push({
      id: docSnapshot.id,
      roomId: data.roomId,
      userId: data.userId,
      role: data.role || 'member',
      joinedAt: data.joinedAt?.toDate() || new Date(),
      lastActiveAt: data.lastActiveAt?.toDate() || new Date(),
      user: user || undefined,
    });
  }
  members.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());

  return members;
};

export const updateRoomMemberRole = async (
  roomId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<void> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    await updateDoc(snapshot.docs[0].ref, { role });
  }
};

export const removeRoomMember = async (roomId: string, userId: string): Promise<void> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const snapshot = await getDocs(q);

  const batch = writeBatch(db);
  snapshot.docs.forEach((docSnapshot) => {
    batch.delete(docSnapshot.ref);
  });
  batch.update(doc(db, 'chatRooms', roomId), {
    activeUsers: increment(-1),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
};

export const updateMemberLastActive = async (roomId: string, userId: string): Promise<void> => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId), where('userId', '==', userId));
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    await updateDoc(snapshot.docs[0].ref, {
      lastActiveAt: serverTimestamp(),
    });
  }
};

export const subscribeToRoomMessages = (
  roomId: string,
  callback: (messages: (Message & { sender: UserProfile })[]) => void,
  currentUserId: string
): (() => void) => {
  const messagesRef = collection(db, 'messages');
  // No orderBy — avoids composite index requirement. Results sorted client-side.
  const q = query(messagesRef, where('roomId', '==', roomId));
  console.log('[subscribeToRoomMessages] query: messages WHERE roomId ==', roomId);

  return onSnapshot(q, async (snapshot) => {
    const messages: (Message & { sender: UserProfile })[] = [];
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data() as any;
      // Skip messages the current user has hidden with "Delete for me"
      const deletedFor: string[] = data.deletedFor || [];
      if (deletedFor.includes(currentUserId)) continue;

      const sender = await getUserProfile(data.senderId);
      if (sender) {
        messages.push({
          id: docSnapshot.id,
          chatId: data.chatId,
          roomId: data.roomId,
          senderId: data.senderId,
          content: data.content,
          messageType: data.messageType,
          mediaUrl: data.mediaUrl || '',
          createdAt: data.createdAt?.toDate() || new Date(),
          deletedAt: data.deletedAt?.toDate() || null,
          deletedBy: data.deletedBy || null,
          isDeletedForEveryone: data.isDeletedForEveryone || false,
          deletedFor,
          sender,
          readBy: data.readBy || [],
        });
      }
    }
    messages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    callback(messages);
  });
};

export const subscribeToRoomMembers = (
  roomId: string,
  callback: (members: RoomMember[]) => void
): (() => void) => {
  const membersRef = collection(db, 'chatRoomMembers');
  const q = query(membersRef, where('roomId', '==', roomId));

  return onSnapshot(q, async (snapshot) => {
    const members: RoomMember[] = [];
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data() as any;
      const user = await getUserProfile(data.userId);
      members.push({
        id: docSnapshot.id,
        roomId: data.roomId,
        userId: data.userId,
        role: data.role || 'member',
        joinedAt: data.joinedAt?.toDate() || new Date(),
        lastActiveAt: data.lastActiveAt?.toDate() || new Date(),
        user: user || undefined,
      });
    }
    callback(members);
  });
};

export const sendRoomMessage = async (
  roomId: string,
  senderId: string,
  content: string,
  messageType: 'text' | 'image' | 'voice' = 'text',
  mediaUrl: string = ''
): Promise<string> => {
  const messagesRef = collection(db, 'messages');
  const msgRef = await addDoc(messagesRef, {
    chatId: null,
    roomId,
    senderId,
    content,
    messageType,
    mediaUrl,
    createdAt: serverTimestamp(),
    deletedAt: null,
    deletedBy: null,
    isDeletedForEveryone: false,
    deletedFor: [],
    readBy: [senderId],
  });

  await updateDoc(doc(db, 'chatRooms', roomId), {
    updatedAt: serverTimestamp(),
  });

  await updateMemberLastActive(roomId, senderId);

  return msgRef.id;
};

export const getFriends = async (userId: string): Promise<UserProfile[]> => {
  const chats = await getUserChats(userId);
  const friends: UserProfile[] = [];
  const addedIds = new Set<string>();

  chats.forEach((chat) => {
    if (!addedIds.has(chat.otherUser.id)) {
      friends.push(chat.otherUser);
      addedIds.add(chat.otherUser.id);
    }
  });

  return friends;
};

// Admin functions
export const getAllUsers = async (): Promise<UserProfile[]> => {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as any;
    return {
      id: docSnapshot.id,
      email: data.email || '',
      username: data.username || '',
      displayName: data.displayName || 'User',
      bio: data.bio || '',
      avatarUrl: data.avatarUrl || '',
      phone: data.phone || '',
      isAdmin: data.isAdmin || false,
      isBanned: data.isBanned || false,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  });
};

export const banUser = async (userId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), { isBanned: true, updatedAt: serverTimestamp() });
};

export const unbanUser = async (userId: string): Promise<void> => {
  await updateDoc(doc(db, 'users', userId), { isBanned: false, updatedAt: serverTimestamp() });
};

export const deleteChatRoom = async (roomId: string): Promise<void> => {
  await deleteDoc(doc(db, 'chatRooms', roomId));
};

export const getAllReports = async (): Promise<Report[]> => {
  const reportsRef = collection(db, 'reports');
  const q = query(reportsRef, where('status', '==', 'pending'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data() as any;
    return {
      id: docSnapshot.id,
      reporterId: data.reporterId,
      reportedUserId: data.reportedUserId,
      reportedMessageId: data.reportedMessageId,
      reportedRoomId: data.reportedRoomId,
      reason: data.reason,
      status: data.status,
      createdAt: data.createdAt?.toDate() || new Date(),
      resolvedAt: data.resolvedAt?.toDate() || null,
      resolvedBy: data.resolvedBy,
    };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const resolveReport = async (reportId: string, resolvedBy: string, action: 'resolved' | 'dismissed'): Promise<void> => {
  await updateDoc(doc(db, 'reports', reportId), {
    status: action,
    resolvedAt: serverTimestamp(),
    resolvedBy,
  });
};

export const getStats = async (): Promise<{ users: number; rooms: number; messages: number }> => {
  const usersSnapshot = await getDocs(collection(db, 'users'));
  const roomsSnapshot = await getDocs(collection(db, 'chatRooms'));
  const messagesSnapshot = await getDocs(collection(db, 'messages'));

  return {
    users: usersSnapshot.size,
    rooms: roomsSnapshot.size,
    messages: messagesSnapshot.size,
  };
};

// Search chats
export const searchChats = async (userId: string, searchQuery: string): Promise<(Chat & { otherUser: UserProfile; lastMessage?: Message })[]> => {
  const allChats = await getUserChats(userId);
  const queryLower = searchQuery.toLowerCase();

  return allChats.filter((chat) => {
    const matchesOtherUser =
      chat.otherUser.displayName.toLowerCase().includes(queryLower) ||
      chat.otherUser.username.toLowerCase().includes(queryLower);
    const matchesLastMessage = chat.lastMessage?.content.toLowerCase().includes(queryLower);
    return matchesOtherUser || matchesLastMessage;
  });
};

// Search rooms
export const searchRooms = async (searchQuery: string): Promise<(ChatRoom & { memberCount: number })[]> => {
  const roomsRef = collection(db, 'chatRooms');
  const snapshot = await getDocs(roomsRef);
  const queryLower = searchQuery.toLowerCase();

  const rooms: (ChatRoom & { memberCount: number })[] = [];

  for (const docSnapshot of snapshot.docs) {
    const data = docSnapshot.data() as any;

    if (
      data.name?.toLowerCase().includes(queryLower) ||
      data.description?.toLowerCase().includes(queryLower) ||
      data.category?.toLowerCase().includes(queryLower)
    ) {
      const membersRef = collection(db, 'chatRoomMembers');
      const membersQ = query(membersRef, where('roomId', '==', docSnapshot.id));
      const membersSnapshot = await getDocs(membersQ);

      rooms.push({
        id: docSnapshot.id,
        name: data.name,
        description: data.description || '',
        imageUrl: data.imageUrl || '',
        ownerId: data.ownerId,
        isPrivate: data.isPrivate,
        category: data.category || 'general',
        rules: data.rules || [],
        activeUsers: data.activeUsers || 0,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        memberCount: membersSnapshot.size,
      });
    }
  }

  return rooms;
};
