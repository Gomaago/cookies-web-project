import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { Chat, Message, subscribeToUserChats } from '@/lib/firestore';
import { UserProfile } from '@/contexts/AuthContext';
import { MessageCircle, Plus, Search } from 'lucide-react-native';

interface ChatWithUser extends Chat {
  otherUser: UserProfile;
  lastMessage?: Message;
}

export default function ChatsScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const [chats, setChats] = useState<ChatWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToUserChats(user.uid, (updatedChats) => {
      setChats(updatedChats as ChatWithUser[]);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else if (days < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const getAvatarUrl = (avatarUrl: string | undefined) => {
    if (avatarUrl) return avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent('User')}&background=2563EB&color=fff&size=128`;
  };

  const getMessagePreview = (message: Message | undefined, userId: string) => {
    if (!message) return 'No messages yet';

    const prefix = message.senderId === userId ? 'You: ' : '';

    switch (message.messageType) {
      case 'image':
        return `${prefix}📷 Photo`;
      case 'voice':
        return `${prefix}🎤 Voice message`;
      default:
        return `${prefix}${message.content}`;
    }
  };

  const renderItem = ({ item }: { item: ChatWithUser }) => {
    const unreadCount = item.unreadCount?.[user?.uid || ''] || 0;
    const hasUnread = unreadCount > 0;

    return (
      <TouchableOpacity
        style={styles.chatItem}
        onPress={() => router.push(`/chat/${item.id}`)}
      >
        <View style={styles.avatarContainer}>
          <Image
            source={{ uri: getAvatarUrl(item.otherUser.avatarUrl) }}
            style={styles.avatar}
          />
          {hasUnread && (
            <View style={styles.unreadDot} />
          )}
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.chatHeader}>
            <Text style={[styles.chatName, hasUnread && styles.chatNameUnread]} numberOfLines={1}>
              {item.otherUser.displayName}
            </Text>
            {item.lastMessage && (
              <Text style={[styles.timeText, hasUnread && styles.timeTextUnread]}>
                {formatTime(item.lastMessage.createdAt)}
              </Text>
            )}
          </View>
          <View style={styles.messageRow}>
            <Text
              style={[styles.lastMessage, hasUnread && styles.lastMessageUnread]}
              numberOfLines={1}
            >
              {getMessagePreview(item.lastMessage, user?.uid || '')}
            </Text>
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
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
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
    },
    headerButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    headerButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    chatItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 8,
    },
    avatarContainer: {
      position: 'relative',
      flexShrink: 0,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    unreadDot: {
      position: 'absolute',
      bottom: 2,
      right: 2,
      width: 13,
      height: 13,
      borderRadius: 7,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.card,
    },
    chatInfo: {
      flex: 1,
      marginLeft: 12,
      minWidth: 0,
    },
    chatHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      gap: 8,
    },
    chatName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    chatNameUnread: {
      fontWeight: '700',
    },
    timeText: {
      fontSize: 12,
      color: colors.textTertiary,
      flexShrink: 0,
    },
    timeTextUnread: {
      color: colors.primary,
      fontWeight: '600',
    },
    messageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    lastMessage: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
      minWidth: 0,
    },
    lastMessageUnread: {
      color: colors.text,
      fontWeight: '500',
    },
    unreadBadge: {
      backgroundColor: colors.primary,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 5,
      flexShrink: 0,
    },
    unreadBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
    emptyIcon: {
      marginBottom: 16,
    },
    emptyText: {
      fontSize: 18,
      color: colors.textSecondary,
      marginBottom: 8,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Chats</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/search')}>
            <Search size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/new-chat')}>
            <Plus size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : chats.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MessageCircle size={64} color={colors.textTertiary} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>No chats yet</Text>
          <Text style={styles.emptySubtext}>Start a conversation with friends</Text>
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        />
      )}
    </View>
  );
}
