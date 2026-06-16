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
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { usePrivacy } from '@/contexts/PrivacyContext';
import { setTypingPresence, subscribeToTypingPresence } from '@/lib/presence';
import { REPORT_REASONS, ReportReason } from '@/lib/privacy';
import {
  sendRoomMessage,
  subscribeToRoomMessages,
  joinChatRoom,
  leaveChatRoom,
  isRoomMember,
  getRoomMembers,
  updateChatRoom,
  deleteChatRoomById,
  updateRoomMemberRole,
  removeRoomMember,
  subscribeToRoomMembers,
  uploadRoomImage,
  deleteForMe,
  deleteForEveryone,
  ChatRoom,
  Message,
  RoomMember,
  ROOM_CATEGORIES,
  RoomCategory,
} from '@/lib/firestore';
import { moderateImage, MODERATION_BLOCK_MESSAGE } from '@/lib/moderation';
import { doc, getDoc, db, collection, getDocs, query, where, updateDoc, serverTimestamp } from '@/lib/firebase';
import {
  ArrowLeft,
  Send,
  Image as ImageIcon,
  Camera,
  Users,
  Settings,
  Crown,
  Shield,
  User,
  MoreVertical,
  X,
  Trash2,
  Languages,
  UserMinus,
  VolumeX,
  Volume2,
  Flag,
} from 'lucide-react-native';
interface RoomMessage extends Message {
  sender: UserProfile;
}

interface RoomData {
  name: string;
  description: string;
  imageUrl: string;
  ownerId: string;
  isPrivate: boolean;
  category: RoomCategory;
  rules: string[];
  activeUsers: number;
}

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const { setActiveConversation } = useNotifications();
  const { isMuted, muteRoom, unmuteRoom, reportRoomById } = usePrivacy();
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
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [isMember, setIsMember] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [operationLoading, setOperationLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [showOriginalSet, setShowOriginalSet] = useState<Set<string>>(new Set());
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Mark this room as the active conversation so notifications are suppressed while open
  useEffect(() => {
    if (!id) return;
    setActiveConversation(id);
    return () => setActiveConversation(null);
  }, [id, setActiveConversation]);

  // Subscribe to typing indicators for this room
  useEffect(() => {
    if (!id || !user) return;
    return subscribeToTypingPresence(id, user.uid, setTypingUserIds);
  }, [id, user]);

  const currentUserRole = members.find((m) => m.userId === user?.uid)?.role;
  const isOwner = room?.ownerId === user?.uid;
  const isAdmin = isOwner || currentUserRole === 'admin';

  const fetchRoom = useCallback(async () => {
    if (!user || !id) return;

    try {
      const roomDoc = await getDoc(doc(db, 'chatRooms', id));
      if (roomDoc.exists()) {
        const data = roomDoc.data() as RoomData;
        setRoom({
          id: roomDoc.id,
          name: data.name,
          description: data.description || '',
          imageUrl: data.imageUrl || '',
          ownerId: data.ownerId,
          isPrivate: data.isPrivate,
          category: data.category || 'general',
          rules: data.rules || [],
          activeUsers: data.activeUsers || 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const membersRef = collection(db, 'chatRoomMembers');
      const membersQ = query(membersRef, where('roomId', '==', id));
      const membersSnapshot = await getDocs(membersQ);
      setMemberCount(membersSnapshot.size);

      const member = await isRoomMember(id, user.uid);
      setIsMember(member);
    } catch (error) {
      console.error('Error fetching room:', error);
    } finally {
      setLoading(false);
    }
  }, [user, id]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  useEffect(() => {
    if (!id || !isMember || !user) return;

    const unsubscribe = subscribeToRoomMessages(id, (msgs) => {
      setMessages(msgs as RoomMessage[]);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }, user.uid);

    return () => unsubscribe();
  }, [id, isMember, user]);

  // Auto-translate incoming messages when autoTranslate is enabled (for this room)
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

  useEffect(() => {
    if (!id) return;

    const unsubscribe = subscribeToRoomMembers(id, (mbs) => {
      setMembers(mbs);
      setMemberCount(mbs.length);
    });

    return () => unsubscribe();
  }, [id]);

  const joinRoom = async () => {
    if (!user || !id) return;

    try {
      await joinChatRoom(id, user.uid);
      setIsMember(true);
      fetchRoom();
    } catch (error) {
      console.error('Error joining room:', error);
      Alert.alert('Error', 'Failed to join room');
    }
  };

  const leaveRoom = () => {
    if (!user || !id) return;
    setConfirmDialog({
      title: 'Leave Room',
      message: 'Are you sure you want to leave this room? You will no longer receive messages.',
      confirmLabel: 'Leave',
      onConfirm: async () => {
        setConfirmDialog(null);
        setShowSettings(false);
        setOperationLoading(true);
        try {
          console.log('[room] leaveChatRoom', id, user.uid);
          await leaveChatRoom(id, user.uid);
          router.replace('/(tabs)/rooms');
        } catch (error) {
          console.error('[room] leaveChatRoom error:', error);
          Alert.alert('Error', 'Failed to leave room. Please try again.');
        } finally {
          setOperationLoading(false);
        }
      },
    });
  };

  const deleteRoom = () => {
    if (!id || !isOwner) return;
    setConfirmDialog({
      title: 'Delete Room',
      message: 'Are you sure you want to delete this room? This action cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: async () => {
        setConfirmDialog(null);
        setShowSettings(false);
        setOperationLoading(true);
        try {
          console.log('[room] deleteChatRoomById', id);
          await deleteChatRoomById(id);
          router.replace('/(tabs)/rooms');
        } catch (error) {
          console.error('[room] deleteChatRoomById error:', error);
          Alert.alert('Error', 'Failed to delete room. Please try again.');
        } finally {
          setOperationLoading(false);
        }
      },
    });
  };

  const handleMemberAction = (member: RoomMember) => {
    if (!isOwner && member.role === 'admin') return;
    if (member.userId === user?.uid) return;

    const options = [];

    if (isOwner && member.role === 'member') {
      options.push({
        text: 'Make Admin',
        onPress: async () => {
          await updateRoomMemberRole(id!, member.userId, 'admin');
        },
      });
    }

    if (isOwner && member.role === 'admin') {
      options.push({
        text: 'Remove Admin',
        onPress: async () => {
          await updateRoomMemberRole(id!, member.userId, 'member');
        },
      });
    }

    if (isAdmin) {
      options.push({
        text: 'Remove Member',
        style: 'destructive' as const,
        onPress: async () => {
          Alert.alert(
            'Remove Member',
            `Remove ${member.user?.displayName} from this room?`,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: async () => {
                  await removeRoomMember(id!, member.userId);
                },
              },
            ]
          );
        },
      });
    }

    if (options.length > 0) {
      Alert.alert(
        member.user?.displayName || 'Member',
        undefined,
        [
          ...options,
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    }
  };

  const handleMuteToggle = async () => {
    if (!id) return;
    if (isMuted(id)) {
      await unmuteRoom(id);
    } else {
      await muteRoom(id);
    }
  };

  const handleReport = async (reason: ReportReason) => {
    if (!id) return;
    setShowReportModal(false);
    await reportRoomById(id, reason);
    Alert.alert('Report Sent', 'Thank you. Our team will review this report.');
  };

  const handleTyping = useCallback(async (text: string) => {
    if (!user || !id) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (text.length > 0) {
      await setTypingPresence(id, user.uid, true);
    }
    typingTimeoutRef.current = setTimeout(async () => {
      await setTypingPresence(id, user.uid, false);
    }, 2000);
  }, [user, id]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !id || sending) return;

    setSending(true);
    const messageContent = newMessage.trim();
    setNewMessage('');

    await setTypingPresence(id, user.uid, false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      await sendRoomMessage(id, user.uid, messageContent);
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
        setPendingImageUri(URL.createObjectURL(file));
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
      console.error('[room] pickImage error:', error);
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
      console.error('[room] takePhoto error:', error);
    }
  };

  const sendPendingImage = async () => {
    if (!pendingImageUri || !user || !id || sending) return;

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

      console.log('[room] uploadRoomImage start');
      const imageUrl = await uploadRoomImage(id, uri, (p) => setUploadProgress(p));
      console.log('[room] uploadRoomImage done, sending message');
      await sendRoomMessage(id, user.uid, '📷 Photo', 'image', imageUrl);
    } catch (error) {
      console.error('[room] sendPendingImage error:', error);
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
    // Can't interact with messages already deleted for everyone
    if (message.isDeletedForEveryone) return;
    setDeleteFlow({ step: 'options', message });
  };

  const handleTranslate = async (message: Message) => {
    console.log('[room-translate] handleTranslate START', { id: message.id, type: message.messageType, lang: preferredLanguage });
    const msg = message; // capture before any state update
    setDeleteFlow(null);
    Alert.alert('Pressed', `Translating message ${msg.id}`);
    try {
      console.log('[room-translate] calling translateMessage', { id: msg.id });
      await translateMessage(msg.id, msg.content, preferredLanguage);
      console.log('[room-translate] translateMessage resolved');
    } catch (e: any) {
      console.error('[room-translate] CATCH', e);
      Alert.alert('Translation Error', e?.message ?? String(e));
      return;
    }
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
    console.log('[room] executeDelete ENTRY — type:', type, 'messageId:', message.id, 'senderId:', message.senderId, 'currentUser:', user?.uid);
    if (!message.id || !user) {
      Alert.alert('Delete Failed', 'Message ID or user is missing — cannot delete.');
      return;
    }
    setDeleteFlow(null);
    setDeleteLoading(true);
    try {
      if (type === 'me') {
        console.log('[room] calling deleteForMe');
        await deleteForMe(message.id, user.uid);
        console.log('[room] deleteForMe completed successfully');
      } else {
        console.log('[room] calling deleteForEveryone');
        await deleteForEveryone(message.id, user.uid, message.mediaUrl || undefined);
        console.log('[room] deleteForEveryone completed successfully');
      }
      console.log('[room] delete flow finished — UI should update via onSnapshot');
    } catch (error: any) {
      console.error('[room] executeDelete CAUGHT ERROR:', error);
      const msg = error?.message ?? error?.code ?? String(error);
      Alert.alert('Delete Failed', msg);
    } finally {
      setDeleteLoading(false);
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

  const getRoomImage = () => {
    if (room?.imageUrl) return room.imageUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(room?.name || 'Room')}&background=10B981&color=fff&size=128`;
  };

  const getCategoryIcon = () => {
    const cat = ROOM_CATEGORIES.find((c) => c.value === room?.category);
    return cat?.icon || '';
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
      paddingBottom: 16,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerImage: {
      width: 40,
      height: 40,
      borderRadius: 12,
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
    headerMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerButtons: {
      flexDirection: 'row',
      gap: 8,
    },
    headerButton: {
      padding: 8,
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    messageContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginVertical: 4,
    },
    ownMessage: {
      justifyContent: 'flex-end',
    },
    otherMessage: {
      justifyContent: 'flex-start',
    },
    messageAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      marginRight: 8,
    },
    messageContent: {
      maxWidth: '70%',
    },
    senderName: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
      marginLeft: 4,
    },
    messageBubble: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 18,
    },
    ownBubble: {
      backgroundColor: colors.primary,
      borderBottomRightRadius: 4,
    },
    otherBubble: {
      backgroundColor: colors.card,
      borderBottomLeftRadius: 4,
    },
    messageText: {
      fontSize: 16,
      color: colors.text,
      lineHeight: 22,
    },
    ownMessageText: {
      color: '#FFFFFF',
    },
    messageTime: {
      fontSize: 10,
      color: colors.textSecondary,
      marginTop: 4,
      textAlign: 'right',
    },
    ownMessageTime: {
      color: 'rgba(255, 255, 255, 0.7)',
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: colors.card,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: colors.input,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      fontSize: 16,
      color: colors.text,
    },
    sendButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    attachmentButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      justifyContent: 'center',
      alignItems: 'center',
    },
    joinContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    joinImage: {
      width: 120,
      height: 120,
      borderRadius: 24,
      marginBottom: 20,
    },
    joinTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    joinDescription: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 8,
    },
    joinMeta: {
      fontSize: 14,
      color: colors.textTertiary,
      marginBottom: 32,
    },
    joinButton: {
      backgroundColor: colors.primary,
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: 12,
    },
    joinButtonText: {
      color: '#FFFFFF',
      fontSize: 18,
      fontWeight: '600',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    modalCloseButton: {
      padding: 4,
    },
    memberItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    memberAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      marginRight: 12,
    },
    memberInfo: {
      flex: 1,
    },
    memberName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    memberRole: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    roleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      marginLeft: 8,
    },
    ownerBadge: {
      backgroundColor: '#F59E0B20',
    },
    adminBadge: {
      backgroundColor: colors.primary + '20',
    },
    roleText: {
      fontSize: 10,
      fontWeight: '600',
      marginLeft: 4,
    },
    settingsSection: {
      padding: 20,
    },
    settingsSectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 12,
    },
    settingItemDestructive: {
      backgroundColor: '#EF444410',
    },
    settingIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    settingIconDestructive: {
      backgroundColor: '#EF444420',
    },
    settingTextContainer: {
      flex: 1,
    },
    settingTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    settingTitleDestructive: {
      color: '#EF4444',
    },
    settingDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    roomInfoCard: {
      padding: 20,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 20,
    },
    roomInfoName: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    roomInfoCategory: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    roomInfoDescription: {
      fontSize: 16,
      color: colors.text,
      marginTop: 12,
      lineHeight: 22,
    },
    activeIndicator: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: '#10B981',
    },
    confirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    confirmBox: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 16,
      padding: 24,
    },
    confirmTitle: {
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 10,
    },
    confirmMessage: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 24,
    },
    confirmButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    confirmBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      alignItems: 'center',
    },
    confirmBtnDestructive: {
      backgroundColor: '#EF4444',
    },
    confirmBtnText: {
      fontSize: 15,
      fontWeight: '600',
    },
    operationOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    messageImage: {
      width: 200,
      height: 150,
      borderRadius: 12,
      marginBottom: 4,
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
    uploadProgressOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    uploadProgressText: {
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
  });

  const renderMessage = ({ item }: { item: RoomMessage }) => {
    const isOwn = item.senderId === user?.uid;
    const isDeletedForEveryone = item.isDeletedForEveryone;
    const canInteract = !isDeletedForEveryone;

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
        onLongPress={() => canInteract && handleLongPress(item)}
        delayLongPress={400}
      >
        <View style={[styles.messageContainer, isOwn ? styles.ownMessage : styles.otherMessage]}>
          {!isOwn && (
            <Image
              source={{ uri: getAvatarUrl(item.sender.avatarUrl, item.sender.displayName) }}
              style={styles.messageAvatar}
            />
          )}
          <View style={styles.messageContent}>
            {!isOwn && (
              <Text style={styles.senderName}>{item.sender.displayName}</Text>
            )}
            <View style={[
              styles.messageBubble,
              isOwn ? styles.ownBubble : styles.otherBubble,
              isDeletedForEveryone && styles.deletedBubble,
            ]}>
              {isDeletedForEveryone ? (
                <Text style={[styles.deletedText, isOwn && styles.deletedTextOwn]}>
                  This message was deleted
                </Text>
              ) : item.messageType === 'image' && item.mediaUrl ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreenImage(item.mediaUrl!)}>
                  <Image source={{ uri: item.mediaUrl }} style={styles.messageImage} />
                </TouchableOpacity>
              ) : (
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
              <Text style={[styles.messageTime, isOwn && styles.ownMessageTime]}>
                {formatTime(item.createdAt)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderMember = ({ item }: { item: RoomMember }) => (
    <TouchableOpacity
      style={styles.memberItem}
      onPress={() => isAdmin && item.userId !== user?.uid && handleMemberAction(item)}
      disabled={!isAdmin || item.userId === user?.uid}
    >
      <Image
        source={{ uri: getAvatarUrl(item.user?.avatarUrl, item.user?.displayName || 'User') }}
        style={styles.memberAvatar}
      />
      <View style={styles.memberInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.memberName}>{item.user?.displayName}</Text>
          {item.role === 'owner' && (
            <View style={[styles.roleBadge, styles.ownerBadge]}>
              <Crown size={12} color="#F59E0B" />
              <Text style={[styles.roleText, { color: '#F59E0B' }]}>Owner</Text>
            </View>
          )}
          {item.role === 'admin' && (
            <View style={[styles.roleBadge, styles.adminBadge]}>
              <Shield size={12} color={colors.primary} />
              <Text style={[styles.roleText, { color: colors.primary }]}>Admin</Text>
            </View>
          )}
        </View>
        <Text style={styles.memberRole}>
          {item.userId === user?.uid ? 'You' : `Joined ${item.joinedAt.toLocaleDateString()}`}
        </Text>
      </View>
      {isAdmin && item.userId !== user?.uid && (
        <MoreVertical size={20} color={colors.textSecondary} />
      )}
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!isMember) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Image source={{ uri: getRoomImage() }} style={styles.headerImage} />
          <View style={styles.headerInfo}>
            <Text style={styles.headerName}>{room?.name}</Text>
            <Text style={styles.headerMeta}>
              {getCategoryIcon()} {memberCount} members
            </Text>
          </View>
        </View>

        <View style={styles.joinContainer}>
          <Image source={{ uri: getRoomImage() }} style={styles.joinImage} />
          <Text style={styles.joinTitle}>{room?.name}</Text>
          <Text style={styles.joinDescription}>{room?.description || 'No description'}</Text>
          <Text style={styles.joinMeta}>
            {getCategoryIcon()} {room?.category} · {memberCount} members
          </Text>
          <TouchableOpacity style={styles.joinButton} onPress={joinRoom}>
            <Text style={styles.joinButtonText}>Join Room</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Image source={{ uri: getRoomImage() }} style={styles.headerImage} />
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{room?.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {room && room.activeUsers > 0 && (
              <View style={styles.activeIndicator} />
            )}
            <Text style={styles.headerMeta}>
              {typingUserIds.length > 0
                ? `${typingUserIds.length === 1 ? 'Someone' : `${typingUserIds.length} people`} typing...`
                : `${memberCount} members`}
            </Text>
          </View>
        </View>
        <View style={styles.headerButtons}>
          {autoTranslate && id && (
            <TouchableOpacity
              style={[
                styles.headerButton,
                !isChatTranslationEnabled(id) && { opacity: 0.4 },
              ]}
              onPress={() => toggleChatTranslation(id)}
            >
              <Languages
                size={20}
                color={isChatTranslationEnabled(id) ? '#0EA5E9' : colors.textSecondary}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.headerButton} onPress={handleMuteToggle}>
            {isMuted(id!) ? (
              <Volume2 size={20} color={colors.textSecondary} />
            ) : (
              <VolumeX size={20} color={colors.textSecondary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowMembers(true)}>
            <Users size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowSettings(true)}>
            <Settings size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => setShowReportModal(true)}>
            <Flag size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
      />

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={[styles.attachmentButton, sending && { opacity: 0.5 }]}
          onPress={openMediaPicker}
          disabled={sending}
        >
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
        <TouchableOpacity
          style={[styles.sendButton, (!newMessage.trim() || sending) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || sending}
        >
          <Send size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <Modal
        visible={showMembers}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMembers(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Members ({memberCount})</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowMembers(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={members}
              renderItem={renderMember}
              keyExtractor={(item) => item.id}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={showSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Room Settings</Text>
              <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowSettings(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              <View style={styles.settingsSection}>
                <View style={styles.roomInfoCard}>
                  <Text style={styles.roomInfoName}>
                    {getCategoryIcon()} {room?.name}
                  </Text>
                  <Text style={styles.roomInfoCategory}>
                    {room?.isPrivate ? 'Private' : 'Public'} · {room?.category}
                  </Text>
                  {room?.description && (
                    <Text style={styles.roomInfoDescription}>{room.description}</Text>
                  )}
                </View>

                <TouchableOpacity style={styles.settingItem} onPress={leaveRoom}>
                  <View style={styles.settingIcon}>
                    <UserMinus size={20} color={colors.text} />
                  </View>
                  <View style={styles.settingTextContainer}>
                    <Text style={styles.settingTitle}>Leave Room</Text>
                    <Text style={styles.settingDescription}>You will no longer receive messages</Text>
                  </View>
                </TouchableOpacity>

                {isOwner && (
                  <TouchableOpacity style={[styles.settingItem, styles.settingItemDestructive]} onPress={deleteRoom}>
                    <View style={[styles.settingIcon, styles.settingIconDestructive]}>
                      <Trash2 size={20} color="#EF4444" />
                    </View>
                    <View style={styles.settingTextContainer}>
                      <Text style={[styles.settingTitle, styles.settingTitleDestructive]}>Delete Room</Text>
                      <Text style={styles.settingDescription}>This action cannot be undone</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cross-platform confirmation dialog */}
      <Modal
        visible={confirmDialog !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setConfirmDialog(null)}
      >
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.card }]}>
            <Text style={[styles.confirmTitle, { color: colors.text }]}>
              {confirmDialog?.title}
            </Text>
            <Text style={[styles.confirmMessage, { color: colors.textSecondary }]}>
              {confirmDialog?.message}
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity
                style={[styles.confirmBtn, { backgroundColor: colors.backgroundSecondary }]}
                onPress={() => setConfirmDialog(null)}
              >
                <Text style={[styles.confirmBtnText, { color: colors.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmBtn, styles.confirmBtnDestructive]}
                onPress={confirmDialog?.onConfirm}
              >
                <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>
                  {confirmDialog?.confirmLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full-screen loading overlay for leave/delete operations */}
      <Modal visible={operationLoading} transparent animationType="none">
        <View style={styles.operationOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
        </View>
      </Modal>

      {/* Upload progress overlay */}
      {sending && uploadProgress > 0 && (
        <View style={styles.uploadProgressOverlay}>
          <ActivityIndicator size="large" color="#FFFFFF" />
          <Text style={styles.uploadProgressText}>Uploading... {Math.round(uploadProgress)}%</Text>
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
                style={styles.previewImage}
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
              style={styles.fullscreenImage}
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


      {/* Single delete modal — steps share one Modal to avoid backdrop overlap on web */}
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
                  <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>ACTIVE: room/[id].tsx</Text>
                </View>
                <View style={styles.actionSheetHeader}>
                  <Text style={styles.actionSheetTitle}>Message Actions</Text>
                  <TouchableOpacity onPress={() => setDeleteFlow(null)}>
                    <X size={20} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                {/* Translate — only for text messages */}
                {deleteFlow.message.messageType === 'text' && (
                  <TouchableOpacity
                    style={styles.actionSheetBtn}
                    onPress={() => handleTranslate(deleteFlow.message)}
                  >
                    <Languages size={20} color="#0EA5E9" />
                    <Text style={[styles.actionSheetBtnText, { color: '#0EA5E9' }]}>
                      {getTranslation(deleteFlow.message.id)
                        ? showOriginalSet.has(deleteFlow.message.id)
                          ? 'Show translation'
                          : 'Translate again'
                        : 'Translate'}
                    </Text>
                  </TouchableOpacity>
                )}
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
                {(deleteFlow.message.senderId === user?.uid || isAdmin) && (
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
              <View style={[styles.confirmBox, { backgroundColor: colors.card }]}>
                <Text style={[styles.confirmTitle, { color: colors.text }]}>
                  {deleteFlow.type === 'everyone' ? 'Delete for Everyone?' : 'Delete for Me?'}
                </Text>
                <Text style={[styles.confirmMessage, { color: colors.textSecondary }]}>
                  {deleteFlow.type === 'everyone'
                    ? 'This message will be removed for all participants.'
                    : 'This message will be hidden only for you.'}
                </Text>
                <View style={styles.confirmButtons}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.backgroundSecondary }]}
                    onPress={() => setDeleteFlow(null)}
                  >
                    <Text style={[styles.confirmBtnText, { color: colors.text }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmBtnDestructive]}
                    onPress={() => {
                      console.log('[room] confirm delete pressed', deleteFlow.type, deleteFlow.message.id);
                      executeDelete(deleteFlow.type, deleteFlow.message);
                    }}
                  >
                    <Text style={[styles.confirmBtnText, { color: '#FFFFFF' }]}>Delete</Text>
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

      {/* Report room modal */}
      <Modal
        visible={showReportModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.actionSheet}>
          <View style={styles.actionSheetContent}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle}>Report Room</Text>
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
