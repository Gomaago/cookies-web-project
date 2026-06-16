import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Animated,
  Alert,
  Modal,
  ImageStyle,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { usePresence } from '@/contexts/PresenceContext';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { useCall } from '@/contexts/CallContext';
import { REPORT_REASONS, ReportReason } from '@/lib/privacy';
import { setTypingPresence, subscribeToTypingPresence } from '@/lib/presence';
import { SUPPORTED_LANGUAGES } from '@/lib/translation';
import {
  sendChatMessage,
  subscribeToChatMessages,
  Message,
  getUserProfile,
  markMessagesAsRead,
  uploadChatImage,
  uploadVoiceMessage,
  deleteForMe,
  deleteForEveryone,
} from '@/lib/firestore';
import { moderateImage, MODERATION_BLOCK_MESSAGE } from '@/lib/moderation';
import { UserProfile } from '@/contexts/AuthContext';
import { doc, getDoc, db } from '@/lib/firebase';
import { ArrowLeft, Send, Image as ImageIcon, Camera, Mic, Check, CheckCheck, X, Trash2, Languages, MoreVertical, VolumeX, Volume2, Ban, Flag, Phone, Video } from 'lucide-react-native';

interface ChatData {
  user1Id: string;
  user2Id: string;
}

type Style = ViewStyle | TextStyle | ImageStyle;

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { setActiveConversation } = useNotifications();
  const { subscribeToPresence } = usePresence();
  const {
    isUserBlocked,
    blockUser,
    unblockUser,
    isMuted,
    muteChat,
    unmuteChat,
    reportUserById,
  } = usePrivacy();
  const { startCall, activeCall } = useCall();
  const {
    autoTranslate,
    preferredLanguage,
    showOriginalByDefault,
    translateMessage,
    batchTranslateMessages,
    getTranslation,
    getSourceLanguage,
    translatingIds,
    isChatTranslationEnabled,
    toggleChatTranslation,
  } = useTranslation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [otherUserOnline, setOtherUserOnline] = useState(false);
  const [otherUserLastSeen, setOtherUserLastSeen] = useState<Date | null>(null);
  const [recording, setRecording] = useState<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [deleteFlow, setDeleteFlow] = useState<
    | null
    | { step: 'options'; message: Message }
    | { step: 'confirm'; message: Message; type: 'me' | 'everyone' }
  >(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  // Per-message "show original" toggle (true = showing original, false = showing translation)
  const [showOriginalSet, setShowOriginalSet] = useState<Set<string>>(new Set());
  const [showPrivacyMenu, setShowPrivacyMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Mark this chat as the active conversation so notifications are suppressed while open
  useEffect(() => {
    if (!id) return;
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id, setActiveConversation]);

  // Subscribe to the other user's online/offline presence once we know who they are
  useEffect(() => {
    if (!otherUser) return;
    return subscribeToPresence(otherUser.id, ({ status, lastSeen }) => {
      setOtherUserOnline(status === 'online');
      setOtherUserLastSeen(lastSeen);
    });
  }, [otherUser, subscribeToPresence]);

  // Subscribe to typing indicator using the unified presence service
  useEffect(() => {
    if (!id || !user) return;
    return subscribeToTypingPresence(id, user.uid, (typingIds) => {
      const typing = typingIds.length > 0;
      setIsTyping(typing);
      Animated.timing(fadeAnim, {
        toValue: typing ? 1 : 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    });
  }, [id, user, fadeAnim]);

  useEffect(() => {
    if (!id || !user) return;

    const fetchChatData = async () => {
      try {
        const chatDoc = await getDoc(doc(db, 'chats', id));

        if (chatDoc.exists()) {
          const chatData = chatDoc.data() as ChatData;
          const otherUserId = chatData.user1Id === user.uid ? chatData.user2Id : chatData.user1Id;
          const otherUserData = await getUserProfile(otherUserId);
          setOtherUser(otherUserData);

          await markMessagesAsRead(id, user.uid);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching chat:', error);
        setLoading(false);
      }
    };

    fetchChatData();
  }, [id, user]);

  useEffect(() => {
    if (!id || !user) return;

    const unsubscribe = subscribeToChatMessages(id, (msgs) => {
      setMessages(msgs);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);

      markMessagesAsRead(id, user.uid);
    }, user.uid);

    return () => unsubscribe();
  }, [id, user]);

  // Auto-translate incoming messages when autoTranslate is enabled (for this chat)
  useEffect(() => {
    if (!autoTranslate || !user || !id) return;
    if (!isChatTranslationEnabled(id)) return;
    const eligible = messages.filter(
      (msg) => msg.senderId !== user.uid && !msg.isDeletedForEveryone && msg.messageType === 'text'
    );
    if (eligible.length > 0) {
      batchTranslateMessages(
        eligible.map((m) => ({ id: m.id, text: m.content })),
        preferredLanguage
      );
    }
  }, [messages, autoTranslate, preferredLanguage, user, id, isChatTranslationEnabled]);

  const handleTyping = useCallback(async (text: string) => {
    if (!user || !id || !otherUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (text.length > 0) {
      await setTypingPresence(id, user.uid, true);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      await setTypingPresence(id, user.uid, false);
    }, 2000);
  }, [user, id, otherUser]);

  const handleVoiceCall = async () => {
    if (!otherUser || activeCall) return;
    const callId = await startCall(otherUser.id, 'voice');
    if (callId) router.push(`/call/${callId}`);
  };

  const handleVideoCall = async () => {
    if (!otherUser || activeCall) return;
    const callId = await startCall(otherUser.id, 'video');
    if (callId) router.push(`/call/${callId}`);
  };

  const handleBlockToggle = async () => {
    if (!otherUser) return;
    setShowPrivacyMenu(false);
    if (isUserBlocked(otherUser.id)) {
      await unblockUser(otherUser.id);
    } else {
      Alert.alert(
        'Block User',
        `Block ${otherUser.displayName}? They won't be able to send you messages.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Block',
            style: 'destructive',
            onPress: () => blockUser(otherUser.id),
          },
        ]
      );
    }
  };

  const handleMuteToggle = async () => {
    if (!id) return;
    setShowPrivacyMenu(false);
    if (isMuted(id)) {
      await unmuteChat(id);
    } else {
      await muteChat(id);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    if (!otherUser) return;
    setShowReportModal(false);
    await reportUserById(otherUser.id, reason);
    Alert.alert('Report Sent', 'Thank you. Our team will review this report.');
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id || !otherUser || sending) return;

    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage('');

    await setTypingPresence(id, user.uid, false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    try {
      await sendChatMessage(id, user.uid, otherUser.id, messageContent);
    } catch (error) {
      console.error('Error sending message:', error);
      setNewMessage(messageContent);
    } finally {
      setSending(false);
    }
  };

  const openMediaPicker = () => {
    if (sending) return;
    if (Platform.OS === 'web') {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        const uri = URL.createObjectURL(file);
        setPendingImageUri(uri);
      };
      input.click();
      return;
    }
    setShowMediaPicker(true);
  };

  const pickImage = async () => {
    setShowMediaPicker(false);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant photo library access to send images.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[chat] pickImage error:', error);
    }
  };

  const takePhoto = async () => {
    setShowMediaPicker(false);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant camera access to take photos.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'] as any,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
      });
      if (!result.canceled && result.assets[0]) {
        setPendingImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('[chat] takePhoto error:', error);
    }
  };

  const sendPendingImage = async () => {
    if (!pendingImageUri || !user || !id || !otherUser || sending) return;

    setSending(true);
    setUploadProgress(0);
    const uri = pendingImageUri;
    setPendingImageUri(null);

    try {
      const moderation = await moderateImage(uri);
      if (!moderation.safe) {
        Alert.alert('Image Not Allowed', MODERATION_BLOCK_MESSAGE);
        return;
      }

      console.log('[chat] uploadChatImage start');
      const imageUrl = await uploadChatImage(id, uri, (p) => setUploadProgress(p));
      console.log('[chat] uploadChatImage done, sending message');
      await sendChatMessage(id, user.uid, otherUser.id, '📷 Photo', 'image', imageUrl);
    } catch (error) {
      console.error('[chat] sendPendingImage error:', error);
      Alert.alert('Upload Failed', 'Could not send the image. Please try again.');
    } finally {
      setSending(false);
      setUploadProgress(0);
      if (Platform.OS === 'web' && uri.startsWith('blob:')) {
        URL.revokeObjectURL(uri);
      }
    }
  };

  const handleLongPress = (message: Message) => {
    // Can't interact with already-deleted-for-everyone messages
    if (message.isDeletedForEveryone) return;
    setDeleteFlow({ step: 'options', message });
  };

  const handleTranslate = async (message: Message) => {
    const msg = message; // capture before any state update
    setDeleteFlow(null);
    Alert.alert('Pressed', `Translating message ${msg.id}`);
    try {
      console.log('[translate] button pressed', { msgId: msg.id, lang: preferredLanguage });
      await translateMessage(msg.id, msg.content, preferredLanguage);
    } catch (e: any) {
      Alert.alert('Translation Error', e?.message ?? String(e));
      return;
    }
    // After translating, show the translation (not original)
    setShowOriginalSet((prev) => {
      const next = new Set(prev);
      next.delete(msg.id);
      return next;
    });
  };

  const toggleShowOriginal = (messageId: string) => {
    setShowOriginalSet((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };

  const executeDelete = async (type: 'me' | 'everyone', message: Message) => {
    console.log('[chat] executeDelete ENTRY — type:', type, 'messageId:', message.id, 'senderId:', message.senderId, 'currentUser:', user?.uid);
    if (!message.id || !user) {
      Alert.alert('Delete Failed', 'Message ID or user is missing — cannot delete.');
      return;
    }
    setDeleteFlow(null);
    setDeleteLoading(true);
    try {
      if (type === 'me') {
        console.log('[chat] calling deleteForMe');
        await deleteForMe(message.id, user.uid);
        console.log('[chat] deleteForMe completed successfully');
      } else {
        console.log('[chat] calling deleteForEveryone');
        await deleteForEveryone(message.id, user.uid, message.mediaUrl || undefined);
        console.log('[chat] deleteForEveryone completed successfully');
      }
      console.log('[chat] delete flow finished — UI should update via onSnapshot');
    } catch (error: any) {
      console.error('[chat] executeDelete CAUGHT ERROR:', error);
      const msg = error?.message ?? error?.code ?? String(error);
      Alert.alert('Delete Failed', msg);
    } finally {
      setDeleteLoading(false);
    }
  };

  const startRecording = async () => {
    if (Platform.OS === 'web') return;

    try {
      const { Audio } = await import('expo-av');
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant microphone access to send voice messages.');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = async () => {
    if (!recording || !user || !otherUser) return;

    setIsRecording(false);
    setSending(true);

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
      });

      if (uri) {
        setUploadProgress(0);
        const voiceUrl = await uploadVoiceMessage(
          uri,
          id!,
          user.uid,
          (progress) => setUploadProgress(progress)
        );

        await sendChatMessage(id!, user.uid, otherUser.id, '🎤 Voice message', 'voice', voiceUrl);
      }
    } catch (error) {
      console.error('Error sending voice message:', error);
      Alert.alert('Error', 'Failed to send voice message');
    } finally {
      setRecording(null);
      setSending(false);
      setUploadProgress(0);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getAvatarUrl = (avatarUrl: string | undefined, displayName: string) => {
    if (avatarUrl) return avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563EB&color=fff&size=64`;
  };

  const renderTypingIndicator = () => (
    <Animated.View style={[styles.typingContainer, { opacity: fadeAnim }]}>
      <Image
        source={{ uri: getAvatarUrl(otherUser?.avatarUrl, otherUser?.displayName || 'User') }}
        style={styles.typingAvatar as ImageStyle}
      />
      <View style={styles.typingBubble}>
        <View style={styles.typingDots}>
          <View style={[styles.dot, { opacity: 0.4 }]} />
          <View style={[styles.dot, { opacity: 0.7 }]} />
          <View style={[styles.dot, { opacity: 1 }]} />
        </View>
      </View>
    </Animated.View>
  );

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwn = item.senderId === user?.uid;
    const showAvatar = index === 0 || messages[index - 1]?.senderId !== item.senderId;
    const isRead = item.readBy && item.readBy.includes(otherUser?.id || '');
    const nextMessageSame = messages[index + 1]?.senderId === item.senderId;
    const isDeletedForEveryone = item.isDeletedForEveryone;

    // Translation
    const translation = item.messageType === 'text' ? getTranslation(item.id) : null;
    const isTranslating = translatingIds.has(item.id);
    const showingOriginal = showOriginalSet.has(item.id)
      ? true
      : showOriginalByDefault
      ? !translation
      : false;
    const displayText = translation && !showingOriginal ? translation : item.content;
    const sourceLang = translation ? getSourceLanguage(item.id) : null;
    const sourceLangName = sourceLang
      ? (SUPPORTED_LANGUAGES.find((l) => l.code === sourceLang)?.name ?? sourceLang)
      : null;

    return (
      <TouchableOpacity
        activeOpacity={1}
        onLongPress={() => handleLongPress(item)}
        delayLongPress={400}
      >
        <View
          style={[
            styles.messageContainer,
            isOwn ? styles.ownMessage : styles.otherMessage,
            showAvatar && styles.messageWithAvatar,
          ]}
        >
          {!isOwn && showAvatar && (
            <Image
              source={{ uri: getAvatarUrl(otherUser?.avatarUrl, otherUser?.displayName || 'User') }}
              style={styles.messageAvatar as ImageStyle}
            />
          )}
          {!isOwn && !showAvatar && <View style={styles.messageAvatarPlaceholder} />}
          <View
            style={[
              styles.messageBubble,
              isOwn
                ? [styles.ownBubble, nextMessageSame && styles.ownBubbleNoTail]
                : [styles.otherBubble, nextMessageSame && styles.otherBubbleNoTail],
              isDeletedForEveryone && styles.deletedBubble,
            ]}
          >
            {isDeletedForEveryone ? (
              <Text style={[styles.deletedText, isOwn && styles.deletedTextOwn]}>
                This message was deleted
              </Text>
            ) : (
              <>
                {item.messageType === 'image' && item.mediaUrl && (
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreenImage(item.mediaUrl!)}>
                    <Image source={{ uri: item.mediaUrl }} style={styles.messageImage as ImageStyle} />
                  </TouchableOpacity>
                )}
                {item.messageType === 'voice' && item.mediaUrl && (
                  <View style={styles.voiceMessageContainer}>
                    <Mic size={20} color={isOwn ? '#FFFFFF' : colors.text} />
                    <Text style={[styles.voiceMessageText, isOwn && styles.ownMessageText]}>
                      Voice message
                    </Text>
                  </View>
                )}
                {item.messageType === 'text' && (
                  <>
                    <Text style={[styles.messageText, isOwn && styles.ownMessageText]}>
                      {displayText}
                    </Text>
                    {isTranslating && (
                      <ActivityIndicator
                        size="small"
                        color={isOwn ? 'rgba(255,255,255,0.7)' : colors.primary}
                        style={{ marginTop: 4, alignSelf: 'flex-start' }}
                      />
                    )}
                    {!isOwn && !isTranslating && (
                      <>
                        {translation ? (
                          <>
                            {!showingOriginal && sourceLangName && (
                              <Text style={[styles.translatedFromText, isOwn && styles.translatedFromTextOwn]}>
                                Translated from {sourceLangName}
                              </Text>
                            )}
                            <TouchableOpacity
                              onPress={() => {
                                const dbg = { messageId: item.id, hasTranslation: !!translation, targetLanguage: preferredLanguage, showingOriginal };
                                console.log('[translation-debug]', dbg);
                                Alert.alert('Translation Debug', JSON.stringify(dbg, null, 2));
                                toggleShowOriginal(item.id);
                              }}
                              style={styles.toggleTranslationBtn}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Text style={[styles.toggleTranslationText, isOwn && styles.toggleTranslationTextOwn]}>
                                {showingOriginal ? 'Show translation' : 'Show original'}
                              </Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            onPress={async () => {
                              const dbg = { messageId: item.id, hasTranslation: !!translation, targetLanguage: preferredLanguage, showingOriginal };
                              console.log('[translation-debug]', dbg);
                              Alert.alert('Translation Debug', JSON.stringify(dbg, null, 2));
                              try {
                                await translateMessage(item.id, item.content, preferredLanguage);
                              } catch (e: any) {
                                Alert.alert('Translation Error', e?.message ?? String(e));
                              }
                            }}
                            style={styles.toggleTranslationBtn}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={styles.toggleTranslationText}>Translate</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}
                  </>
                )}
              </>
            )}
            <View style={styles.messageMeta}>
              <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                {formatTime(item.createdAt)}
              </Text>
              {isOwn && !isDeletedForEveryone && (
                <View style={styles.readStatus}>
                  {isRead ? (
                    <CheckCheck size={14} color={colors.primary} />
                  ) : (
                    <Check size={14} color="rgba(255,255,255,0.6)" />
                  )}
                </View>
              )}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      marginRight: 12,
    },
    headerInfo: {
      flex: 1,
    },
    headerName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    headerStatus: {
      fontSize: 12,
      color: isTyping ? colors.primary : colors.textSecondary,
      marginTop: 2,
    },
    listContainer: {
      paddingHorizontal: 12,
      paddingVertical: 16,
    },
    typingContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginBottom: 8,
      marginLeft: 12,
    },
    typingAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
    },
    typingBubble: {
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 18,
      borderBottomLeftRadius: 4,
    },
    typingDots: {
      flexDirection: 'row',
      gap: 4,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.textSecondary,
    },
    messageContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginVertical: 1,
    },
    ownMessage: {
      justifyContent: 'flex-end',
      marginRight: 8,
    },
    otherMessage: {
      justifyContent: 'flex-start',
      marginLeft: 8,
    },
    messageWithAvatar: {
      marginTop: 8,
    },
    messageAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
    },
    messageAvatarPlaceholder: {
      width: 28,
      height: 28,
      marginRight: 8,
    },
    messageBubble: {
      maxWidth: '75%',
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 18,
    },
    ownBubble: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    ownBubbleNoTail: {
      borderBottomRightRadius: 18,
    },
    otherBubble: {
      backgroundColor: colors.card,
      borderBottomLeftRadius: 4,
    },
    otherBubbleNoTail: {
      borderBottomLeftRadius: 18,
    },
    messageText: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
    },
    ownMessageText: {
      color: '#FFFFFF',
    },
    messageMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      marginTop: 4,
      gap: 4,
    },
    messageTime: {
      fontSize: 10,
      color: colors.textSecondary,
    },
    ownMessageTime: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    readStatus: {
      marginLeft: 2,
    },
    deletedBubble: {
      opacity: 0.65,
    },
    deletedText: {
      fontSize: 14,
      fontStyle: 'italic',
      color: colors.textSecondary,
    },
    deletedTextOwn: {
      color: 'rgba(255,255,255,0.7)',
    },
    messageImage: {
      width: 200,
      height: 150,
      borderRadius: 12,
      marginBottom: 4,
    },
    voiceMessageContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    voiceMessageText: {
      fontSize: 14,
      color: colors.text,
    },
    toggleTranslationBtn: {
      marginTop: 4,
      paddingVertical: 2,
    },
    toggleTranslationText: {
      fontSize: 12,
      color: 'rgba(0,0,0,0.45)',
      fontStyle: 'italic',
    },
    toggleTranslationTextOwn: {
      color: 'rgba(255,255,255,0.65)',
    },
    translatedFromText: {
      fontSize: 11,
      color: 'rgba(0,0,0,0.4)',
      fontStyle: 'italic',
      marginTop: 3,
    },
    translatedFromTextOwn: {
      color: 'rgba(255,255,255,0.55)',
    },
    headerTranslateBtn: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: '#0EA5E915',
      marginLeft: 8,
    },
    headerTranslateBtnOff: {
      backgroundColor: 'transparent',
    },
    headerMoreBtn: {
      padding: 8,
      marginLeft: 4,
    },
    callBtn: {
      padding: 8,
      marginLeft: 4,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    attachmentButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.input,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 16,
      color: colors.text,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    recordButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.error,
    },
    recordingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 40,
      paddingHorizontal: 16,
      backgroundColor: colors.error + '20',
      borderRadius: 20,
      gap: 8,
    },
    recordingText: {
      color: colors.error,
      fontSize: 14,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadProgress: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadText: {
      color: '#FFFFFF',
      fontSize: 16,
      marginTop: 8,
    },
    previewOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.92)',
      justifyContent: 'flex-end',
    },
    previewContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: 32,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    previewTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    previewImage: {
      width: '100%',
      height: 300,
    },
    previewActions: {
      flexDirection: 'row',
      gap: 12,
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    previewCancelBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    previewSendBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: colors.primary,
    },
    previewBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    previewSendBtnText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    fullscreenOverlay: {
      flex: 1,
      backgroundColor: '#000000',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullscreenImage: {
      width: '100%',
      height: '80%',
    },
    fullscreenClose: {
      position: 'absolute',
      top: 56,
      right: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    actionSheet: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    actionSheetContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 32,
    },
    actionSheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    actionSheetTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    actionSheetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 20,
      gap: 14,
    },
    actionSheetBtnText: {
      fontSize: 16,
      color: colors.text,
    },
    actionSheetBtnDestructive: {
      color: '#EF4444',
    },
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    confirmBox: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 16,
      padding: 24,
      backgroundColor: colors.card,
    },
    confirmTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 10,
    },
    confirmMessage: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.textSecondary,
      marginBottom: 24,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    confirmCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    confirmDeleteBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: '#EF4444',
    },
    confirmBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
    },
    confirmDeleteBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    deleteLoadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Image
          source={{ uri: getAvatarUrl(otherUser?.avatarUrl, otherUser?.displayName || 'User') }}
          style={styles.headerAvatar}
        />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{otherUser?.displayName || 'User'}</Text>
          <Text style={styles.headerStatus}>
            {isTyping
              ? 'typing...'
              : otherUserOnline
              ? 'online'
              : otherUserLastSeen
              ? `last seen ${otherUserLastSeen.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              : `@${otherUser?.username}`}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.callBtn}
          onPress={handleVoiceCall}
          disabled={!!activeCall}
        >
          <Phone size={19} color={activeCall ? colors.textTertiary : colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.callBtn}
          onPress={handleVideoCall}
          disabled={!!activeCall}
        >
          <Video size={19} color={activeCall ? colors.textTertiary : colors.textSecondary} />
        </TouchableOpacity>
        {autoTranslate && id && (
          <TouchableOpacity
            style={[
              styles.headerTranslateBtn,
              !isChatTranslationEnabled(id) && styles.headerTranslateBtnOff,
            ]}
            onPress={() => toggleChatTranslation(id)}
          >
            <Languages
              size={18}
              color={isChatTranslationEnabled(id) ? '#0EA5E9' : colors.textTertiary}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.headerMoreBtn} onPress={() => setShowPrivacyMenu(true)}>
          <MoreVertical size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        ListFooterComponent={isTyping ? renderTypingIndicator : null}
      />

      <View style={styles.inputContainer}>
        {isRecording ? (
          <TouchableOpacity style={styles.recordingContainer} onPress={stopRecording}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.error }} />
            <Text style={styles.recordingText}>Recording... Tap to stop</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity style={styles.attachmentButton} onPress={openMediaPicker}>
              <ImageIcon size={20} color={colors.textSecondary} />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Type a message..."
              placeholderTextColor={colors.placeholder}
              value={newMessage}
              onChangeText={(text) => {
                setNewMessage(text);
                handleTyping(text);
              }}
              multiline
              maxLength={2000}
            />
            {newMessage.trim() ? (
              <TouchableOpacity
                style={[styles.sendButton, sending && styles.sendButtonDisabled]}
                onPress={sendMessage}
                disabled={sending}
              >
                <Send size={20} color="#FFFFFF" />
              </TouchableOpacity>
            ) : Platform.OS !== 'web' ? (
              <TouchableOpacity
                style={styles.attachmentButton}
                onPressIn={startRecording}
                onPressOut={stopRecording}
              >
                <Mic size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </>
        )}
      </View>

      {sending && uploadProgress > 0 && (
        <View style={styles.uploadProgress}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.uploadText}>Uploading... {Math.round(uploadProgress)}%</Text>
        </View>
      )}

      {/* Media source picker — camera vs gallery (native only) */}
      <Modal
        visible={showMediaPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMediaPicker(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetContent}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>Send Image</Text>
              <TouchableOpacity onPress={() => setShowMediaPicker(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.actionSheetBtn} onPress={takePhoto}>
              <Camera size={20} color={colors.primary} />
              <Text style={styles.actionSheetBtnText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSheetBtn} onPress={pickImage}>
              <ImageIcon size={20} color={colors.primary} />
              <Text style={styles.actionSheetBtnText}>Choose from Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Image preview before sending */}
      <Modal
        visible={pendingImageUri !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setPendingImageUri(null)}
      >
        <View style={styles.previewOverlay}>
          <View style={styles.previewContent}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>Send Image?</Text>
              <TouchableOpacity onPress={() => setPendingImageUri(null)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            {pendingImageUri && (
              <Image
                source={{ uri: pendingImageUri }}
                style={styles.previewImage as ImageStyle}
                resizeMode="cover"
              />
            )}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.previewCancelBtn}
                onPress={() => setPendingImageUri(null)}
              >
                <Text style={styles.previewBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.previewSendBtn} onPress={sendPendingImage}>
                <Text style={styles.previewSendBtnText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen image viewer */}
      <Modal
        visible={fullscreenImage !== null}
        animationType="fade"
        transparent={false}
        onRequestClose={() => setFullscreenImage(null)}
      >
        <View style={styles.fullscreenOverlay}>
          {fullscreenImage && (
            <Image
              source={{ uri: fullscreenImage }}
              style={styles.fullscreenImage as ImageStyle}
              resizeMode="contain"
            />
          )}
          <TouchableOpacity
            style={styles.fullscreenClose}
            onPress={() => setFullscreenImage(null)}
          >
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Single delete modal — step 1 (options) and step 2 (confirm) share one Modal
          to avoid backdrop overlap from simultaneously-animating modals on web */}
      <Modal
        visible={deleteFlow !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setDeleteFlow(null)}
      >
        <>
          {deleteFlow?.step === 'options' && (
            <View style={styles.actionSheet} pointerEvents="box-none">
              <View style={styles.actionSheetContent}>
                <View style={{ backgroundColor: 'red', padding: 8, alignItems: 'center' }}>
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>ACTIVE: chat/[id].tsx</Text>
                </View>
                <View style={styles.actionSheetHeader}>
                  <Text style={styles.actionSheetTitle}>Message Actions</Text>
                  <TouchableOpacity onPress={() => setDeleteFlow(null)}>
                    <X size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                {/* Translate — temp test: no messageType guard */}
                <TouchableOpacity
                  style={{
                    backgroundColor: 'red',
                    padding: 20,
                    marginVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                  onPress={() => {
                    console.log('[touch-test] TOUCH WORKS');
                    alert('TOUCH WORKS');
                  }}
                >
                  <Text style={{ color: 'white', fontWeight: 'bold' }}>
                    TEST BUTTON (type={deleteFlow.message.messageType})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionSheetBtn}
                  onPress={() => {
                    const msg = deleteFlow.message;
                    setDeleteFlow({ step: 'confirm', message: msg, type: 'me' });
                  }}
                >
                  <Trash2 size={20} color={colors.text} />
                  <Text style={styles.actionSheetBtnText}>Delete for me</Text>
                </TouchableOpacity>
                {deleteFlow.message.senderId === user?.uid && (
                  <TouchableOpacity
                    style={styles.actionSheetBtn}
                    onPress={() => {
                      const msg = deleteFlow.message;
                      setDeleteFlow({ step: 'confirm', message: msg, type: 'everyone' });
                    }}
                  >
                    <Trash2 size={20} color="#EF4444" />
                    <Text style={[styles.actionSheetBtnText, styles.actionSheetBtnDestructive]}>
                      Delete for everyone
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
          {deleteFlow?.step === 'confirm' && (
            <View style={styles.confirmOverlay}>
              <View style={styles.confirmBox}>
                <Text style={styles.confirmTitle}>
                  {deleteFlow.type === 'everyone' ? 'Delete for Everyone?' : 'Delete for Me?'}
                </Text>
                <Text style={styles.confirmMessage}>
                  {deleteFlow.type === 'everyone'
                    ? 'This message will be removed for all participants.'
                    : 'This message will be hidden only for you.'}
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    onPress={() => setDeleteFlow(null)}
                  >
                    <Text style={styles.confirmBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.confirmDeleteBtn}
                    onPress={() => {
                      console.log('[chat] confirm delete pressed', deleteFlow.type, deleteFlow.message.id);
                      executeDelete(deleteFlow.type, deleteFlow.message);
                    }}
                  >
                    <Text style={styles.confirmDeleteBtnText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </>
      </Modal>

      {/* Delete in-progress overlay */}
      {deleteLoading && (
        <View style={styles.deleteLoadingOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      )}

      {/* Privacy / safety action menu */}
      <Modal
        visible={showPrivacyMenu}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPrivacyMenu(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetContent}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>{otherUser?.displayName || 'User'}</Text>
              <TouchableOpacity onPress={() => setShowPrivacyMenu(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.actionSheetBtn} onPress={handleMuteToggle}>
              {isMuted(id!) ? (
                <Volume2 size={20} color={colors.text} />
              ) : (
                <VolumeX size={20} color={colors.text} />
              )}
              <Text style={styles.actionSheetBtnText}>
                {isMuted(id!) ? 'Unmute Notifications' : 'Mute Notifications'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionSheetBtn}
              onPress={() => {
                setShowPrivacyMenu(false);
                setShowReportModal(true);
              }}
            >
              <Flag size={20} color={colors.text} />
              <Text style={styles.actionSheetBtnText}>Report User</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSheetBtn} onPress={handleBlockToggle}>
              <Ban size={20} color={otherUser && isUserBlocked(otherUser.id) ? colors.text : '#EF4444'} />
              <Text style={[styles.actionSheetBtnText, otherUser && !isUserBlocked(otherUser.id) && styles.actionSheetBtnDestructive]}>
                {otherUser && isUserBlocked(otherUser.id) ? 'Unblock User' : 'Block User'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Report user modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetContent}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>Report User</Text>
              <TouchableOpacity onPress={() => setShowReportModal(false)}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {REPORT_REASONS.map((r) => (
              <TouchableOpacity
                key={r.value}
                style={styles.actionSheetBtn}
                onPress={() => handleReport(r.value)}
              >
                <Text style={styles.actionSheetBtnText}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
