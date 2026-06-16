import {
  db,
  doc,
  setDoc,
  addDoc,
  collection,
  serverTimestamp,
  writeBatch,
} from '@/lib/firebase';

const SAMPLE_USERS = [
  { email: 'alice@example.com', username: 'alice', displayName: 'Alice Johnson', bio: 'Coffee lover and coding enthusiast' },
  { email: 'bob@example.com', username: 'bob', displayName: 'Bob Smith', bio: 'Photography and travel addict' },
  { email: 'carol@example.com', username: 'carol', displayName: 'Carol White', bio: 'Music is my life' },
  { email: 'david@example.com', username: 'david', displayName: 'David Brown', bio: 'Tech geek and gamer' },
  { email: 'eve@example.com', username: 'eve', displayName: 'Eve Davis', bio: 'Fitness and healthy living' },
  { email: 'frank@example.com', username: 'frank', displayName: 'Frank Miller', bio: 'Book worm and movie buff' },
  { email: 'grace@example.com', username: 'grace', displayName: 'Grace Lee', bio: 'Artist and dreamer' },
  { email: 'henry@example.com', username: 'henry', displayName: 'Henry Wilson', bio: 'Sports fan and foodie' },
];

const SAMPLE_ROOMS = [
  { name: 'General Chat', description: 'A place for casual conversations about anything and everything' },
  { name: 'Tech Talk', description: 'Discuss the latest in technology, programming, and gadgets' },
  { name: 'Photography', description: 'Share your photos and get tips from fellow photographers' },
  { name: 'Music Lovers', description: 'Talk about your favorite artists, albums, and concerts' },
  { name: 'Fitness & Health', description: 'Share workout tips, healthy recipes, and motivation' },
  { name: 'Gaming', description: 'Discuss the latest games, share tips, and find gaming buddies' },
];

const SAMPLE_MESSAGES = [
  { content: 'Hey everyone! How are you doing today?', delay: 0 },
  { content: 'Just finished reading an amazing book!', delay: 500 },
  { content: 'Anyone up for some gaming tonight?', delay: 1000 },
  { content: 'Check out this cool photo I took yesterday!', delay: 1500 },
  { content: 'What is everyone listening to right now?', delay: 2000 },
  { content: 'Just hit a new PR at the gym!', delay: 2500 },
  { content: 'Has anyone tried that new restaurant downtown?', delay: 3000 },
  { content: 'The weather is perfect for a hike this weekend!', delay: 3500 },
  { content: 'Anyone watching the game tonight?', delay: 4000 },
  { content: 'Just discovered this awesome new coffee shop!', delay: 4500 },
];

const SAMPLE_CONVERSATIONS = [
  [
    { from: 'other', content: 'Hey! Long time no see!' },
    { from: 'me', content: 'I know right! How have you been?' },
    { from: 'other', content: 'Pretty good! Just got back from a trip' },
    { from: 'me', content: 'Oh nice! Where did you go?' },
    { from: 'other', content: 'Went hiking in the mountains. It was beautiful!' },
    { from: 'me', content: 'That sounds amazing! I need to get out more 😅' },
  ],
  [
    { from: 'other', content: 'Did you see the new project requirements?' },
    { from: 'me', content: 'Yes! Looks like a lot of work' },
    { from: 'other', content: 'Tell me about it... but I think we can do it' },
    { from: 'me', content: 'Definitely! Want to pair program tomorrow?' },
    { from: 'other', content: 'That would be great! See you at 10?' },
    { from: 'me', content: "Perfect, I'll bring coffee ☕" },
  ],
  [
    { from: 'me', content: 'Happy birthday! 🎉' },
    { from: 'other', content: 'Thank you so much!! 😊' },
    { from: 'me', content: 'Any big plans for the day?' },
    { from: 'other', content: "Going out for dinner with friends tonight!" },
    { from: 'me', content: 'Have a great time! 🥳' },
  ],
  [
    { from: 'other', content: 'Can you send me the photos from last week?' },
    { from: 'me', content: 'Sure! Let me find them' },
    { from: 'me', content: 'Here they are!' },
    { from: 'other', content: 'These are perfect! Thanks!' },
    { from: 'me', content: 'No problem! 📸' },
  ],
];

// This would need to be called from a secure context (like a Cloud Function or admin panel)
export async function generateSampleData(adminUserId: string) {
  const batch = writeBatch(db);
  const userIds: string[] = [];

  // Create sample user profiles
  for (let i = 0; i < SAMPLE_USERS.length; i++) {
    const user = SAMPLE_USERS[i];
    const fakeId = `sample_user_${i + 1}`;
    userIds.push(fakeId);

    const userRef = doc(collection(db, 'users'), fakeId);
    batch.set(userRef, {
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName)}&background=2563EB&color=fff&size=200`,
      phone: '',
      isAdmin: false,
      isBanned: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  // Create sample chat rooms
  for (const room of SAMPLE_ROOMS) {
    const roomRef = await addDoc(collection(db, 'chatRooms'), {
      name: room.name,
      description: room.description,
      imageUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(room.name)}&background=10B981&color=fff&size=200`,
      ownerId: adminUserId,
      isPrivate: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Add owner as member
    await addDoc(collection(db, 'chatRoomMembers'), {
      roomId: roomRef.id,
      userId: adminUserId,
      joinedAt: serverTimestamp(),
    });

    // Add sample members
    for (let i = 0; i < 5; i++) {
      const memberIdx = Math.floor(Math.random() * userIds.length);
      await addDoc(collection(db, 'chatRoomMembers'), {
        roomId: roomRef.id,
        userId: userIds[memberIdx],
        joinedAt: serverTimestamp(),
      });
    }

    // Add sample messages to rooms
    for (let j = 0; j < 10; j++) {
      const randomUserIdx = Math.floor(Math.random() * userIds.length);
      const randomMsgIdx = Math.floor(Math.random() * SAMPLE_MESSAGES.length);
      await addDoc(collection(db, 'messages'), {
        chatId: null,
        roomId: roomRef.id,
        senderId: userIds[randomUserIdx],
        content: SAMPLE_MESSAGES[randomMsgIdx].content,
        messageType: 'text',
        mediaUrl: '',
        createdAt: serverTimestamp(),
        deletedAt: null,
        readBy: [userIds[randomUserIdx]],
      });
    }

    // Update room with recent message
    await updateDoc(doc(db, 'chatRooms', roomRef.id), {
      updatedAt: serverTimestamp(),
    });
  }

  // Create sample one-on-one chats with conversations
  for (let i = 0; i < Math.min(userIds.length, SAMPLE_CONVERSATIONS.length); i++) {
    const conversation = SAMPLE_CONVERSATIONS[i];
    const otherUserId = userIds[i];

    // Create chat
    const batch = writeBatch(db);
    const chatRef = doc(collection(db, 'chats'));
    batch.set(chatRef, {
      user1Id: adminUserId,
      user2Id: otherUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      unreadCount: { [adminUserId]: 2, [otherUserId]: 0 },
    });
    await batch.commit();

    // Add messages to the chat
    for (const msg of conversation) {
      const senderId = msg.from === 'me' ? adminUserId : otherUserId;
      await addDoc(collection(db, 'messages'), {
        chatId: chatRef.id,
        roomId: null,
        senderId: senderId,
        content: msg.content,
        messageType: 'text',
        mediaUrl: '',
        createdAt: serverTimestamp(),
        deletedAt: null,
        readBy: [senderId],
      });
    }

    // Update chat timestamp
    await updateDoc(doc(db, 'chats', chatRef.id), {
      updatedAt: serverTimestamp(),
    });
  }

  console.log('Sample data generated successfully!');
}

// Helper to update doc
import { updateDoc } from '@/lib/firebase';
