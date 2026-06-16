import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useContacts } from '@/contexts/ContactsContext';
import { searchUsers, searchChats, getOrCreateChat, Chat, Message } from '@/lib/firestore';
import { ArrowLeft, User, MessageCircle, Users, UserPlus, UserCheck, Clock } from 'lucide-react-native';

type SearchResult = {
  type: 'user' | 'room' | 'chat';
  data: UserProfile | Chat & { otherUser: UserProfile; lastMessage?: Message };
};

export default function SearchScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { isContact, hasPendingOutgoing, sendRequest } = useContacts();
  const [sendingRequestTo, setSendingRequestTo] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchType, setSearchType] = useState<'all' | 'users' | 'chats'>('all');

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim() || !user) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const resultsArray: SearchResult[] = [];

      if (searchType === 'all' || searchType === 'users') {
        const users = await searchUsers(searchQuery, user.uid);
        users.forEach((userData) => {
          resultsArray.push({ type: 'user', data: userData });
        });
      }

      if (searchType === 'all' || searchType === 'chats') {
        const chats = await searchChats(user.uid, searchQuery);
        chats.forEach((chat) => {
          resultsArray.push({ type: 'chat', data: chat as any });
        });
      }

      // Sort by relevance
      const sorted = resultsArray.sort((a, b) => {
        const aName = a.type === 'user'
          ? (a.data as UserProfile).displayName
          : (a.data as any).otherUser?.displayName || '';
        const bName = b.type === 'user'
          ? (b.data as UserProfile).displayName
          : (b.data as any).otherUser?.displayName || '';
        return aName.localeCompare(bName);
      });

      setResults(sorted);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  }, [user, searchType]);

  const handleQueryChange = (text: string) => {
    setQuery(text);
    search(text);
  };

  const getAvatarUrl = (avatarUrl: string | undefined, displayName: string) => {
    if (avatarUrl) return avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563EB&color=fff&size=64`;
  };

  const startChat = async (targetUserId: string) => {
    try {
      const chatId = await getOrCreateChat(user!.uid, targetUserId);
      router.push(`/chat/${chatId}`);
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };

  const openChat = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  const handleAddContact = async (targetUserId: string) => {
    setSendingRequestTo(targetUserId);
    try {
      await sendRequest(targetUserId);
    } finally {
      setSendingRequestTo(null);
    }
  };

  const renderItem = ({ item }: { item: SearchResult }) => {
    if (item.type === 'user') {
      const userData = item.data as UserProfile;
      const alreadyContact = isContact(userData.id);
      const pendingOut = hasPendingOutgoing(userData.id);
      const sending = sendingRequestTo === userData.id;
      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => startChat(userData.id)}
        >
          <Image
            source={{ uri: getAvatarUrl(userData.avatarUrl, userData.displayName) }}
            style={styles.resultImage}
          />
          <View style={styles.resultInfo}>
            <View style={styles.typeBadge}>
              <User size={12} color={colors.primary} />
              <Text style={styles.typeText}>User</Text>
            </View>
            <Text style={styles.resultName}>{userData.displayName}</Text>
            <Text style={styles.resultSecondary}>@{userData.username}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {!alreadyContact && !pendingOut && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleAddContact(userData.id)}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <UserPlus size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            )}
            {pendingOut && (
              <TouchableOpacity style={styles.actionButton} disabled>
                <Clock size={20} color={colors.textTertiary} />
              </TouchableOpacity>
            )}
            {alreadyContact && (
              <TouchableOpacity style={styles.actionButton} disabled>
                <UserCheck size={20} color="#22C55E" />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.actionButton} onPress={() => startChat(userData.id)}>
              <MessageCircle size={20} color={colors.primary} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    } else {
      const chatData = item.data as Chat & { otherUser: UserProfile; lastMessage?: Message };
      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => openChat(chatData.id)}
        >
          <Image
            source={{ uri: getAvatarUrl(chatData.otherUser.avatarUrl, chatData.otherUser.displayName) }}
            style={styles.resultImage}
          />
          <View style={styles.resultInfo}>
            <View style={[styles.typeBadge, { backgroundColor: colors.secondary + '20' }]}>
              <MessageCircle size={12} color={colors.secondary} />
              <Text style={[styles.typeText, { color: colors.secondary }]}>Chat</Text>
            </View>
            <Text style={styles.resultName}>{chatData.otherUser.displayName}</Text>
            <Text style={styles.resultSecondary} numberOfLines={1}>
              {chatData.lastMessage?.content || 'No messages'}
            </Text>
          </View>
        </TouchableOpacity>
      );
    }
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
      backgroundColor: colors.background,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.backgroundSecondary,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
    },
    searchInput: {
      flex: 1,
      marginLeft: 8,
      fontSize: 16,
      color: colors.text,
    },
    filters: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    filterButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
    },
    filterText: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    filterTextActive: {
      color: '#FFFFFF',
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    resultItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 8,
    },
    resultImage: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    resultInfo: {
      flex: 1,
      marginLeft: 12,
    },
    typeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: 'flex-start',
      marginBottom: 4,
      gap: 4,
    },
    typeText: {
      fontSize: 10,
      color: colors.primary,
      fontWeight: '600',
    },
    resultName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    resultSecondary: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    actionButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary + '20',
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 18,
      color: colors.textSecondary,
    },
    loadingContainer: {
      paddingVertical: 20,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.searchContainer}>
          {loading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <User size={20} color={colors.textSecondary} />
          )}
          <TextInput
            style={styles.searchInput}
            placeholder="Search users and chats..."
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={handleQueryChange}
            autoFocus
          />
        </View>
      </View>

      <View style={styles.filters}>
        <TouchableOpacity
          style={[styles.filterButton, searchType === 'all' && styles.filterButtonActive]}
          onPress={() => setSearchType('all')}
        >
          <Text style={[styles.filterText, searchType === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, searchType === 'users' && styles.filterButtonActive]}
          onPress={() => setSearchType('users')}
        >
          <Text style={[styles.filterText, searchType === 'users' && styles.filterTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterButton, searchType === 'chats' && styles.filterButtonActive]}
          onPress={() => setSearchType('chats')}
        >
          <Text style={[styles.filterText, searchType === 'chats' && styles.filterTextActive]}>
            Chats
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : results.length === 0 && query.trim() ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No results found</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          renderItem={renderItem}
          keyExtractor={(item, index) => `${item.type}-${index}`}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}
