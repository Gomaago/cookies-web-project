import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { searchUsers, getOrCreateChat } from '@/lib/firestore';
import { ArrowLeft, MessageCircle, Search, X } from 'lucide-react-native';

const DEBOUNCE_MS = 300;

export default function NewChatScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChatId, setStartingChatId] = useState<string | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(async (q: string) => {
    if (!user) return;
    setLoading(true);
    try {
      const results = await searchUsers(q, user.uid);
      setUsers(results);
    } catch (err) {
      console.error('[new-chat] searchUsers error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial load — show all users
  useEffect(() => {
    runSearch('');
  }, [runSearch]);

  // Debounced search on query change
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [query, runSearch]);

  const startChat = async (targetUserId: string) => {
    if (startingChatId || !user) return;
    setStartingChatId(targetUserId);
    try {
      console.log('[new-chat] getOrCreateChat', user.uid, '->', targetUserId);
      const chatId = await getOrCreateChat(user.uid, targetUserId);
      console.log('[new-chat] navigating to chat', chatId);
      router.push(`/chat/${chatId}`);
    } catch (err) {
      console.error('[new-chat] getOrCreateChat error:', err);
    } finally {
      setStartingChatId(null);
    }
  };

  const getAvatarUrl = (avatarUrl: string | undefined, displayName: string) =>
    avatarUrl ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563EB&color=fff&size=64`;

  const renderUser = ({ item }: { item: UserProfile }) => {
    const isBusy = startingChatId === item.id;
    return (
      <TouchableOpacity
        style={[styles.userItem, { backgroundColor: colors.card }]}
        onPress={() => startChat(item.id)}
        activeOpacity={0.7}
        disabled={startingChatId !== null}
      >
        <Image
          source={{ uri: getAvatarUrl(item.avatarUrl, item.displayName) }}
          style={styles.avatar}
        />
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: colors.text }]}>{item.displayName}</Text>
          <Text style={[styles.userHandle, { color: colors.textSecondary }]}>
            @{item.username}
          </Text>
          {item.bio ? (
            <Text style={[styles.userBio, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.bio}
            </Text>
          ) : null}
        </View>
        <View style={[styles.messageButton, { backgroundColor: colors.primary + '20' }]}>
          {isBusy ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <MessageCircle size={20} color={colors.primary} />
          )}
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
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 8,
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.backgroundSecondary,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
    },
    clearButton: {
      padding: 2,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginBottom: 4,
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 40,
    },
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      borderRadius: 14,
      marginBottom: 8,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    userInfo: {
      flex: 1,
      marginLeft: 12,
    },
    userName: {
      fontSize: 16,
      fontWeight: '600',
    },
    userHandle: {
      fontSize: 13,
      marginTop: 2,
    },
    userBio: {
      fontSize: 13,
      marginTop: 3,
    },
    messageButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    centerBox: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingBottom: 80,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '600',
    },
    emptySubtitle: {
      fontSize: 14,
    },
  });

  const isEmpty = !loading && users.length === 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Chat</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Search size={18} color={colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username…"
          placeholderTextColor={colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : query.length > 0 ? (
          <TouchableOpacity style={styles.clearButton} onPress={() => setQuery('')}>
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.divider} />

      {/* Results */}
      {loading && users.length === 0 ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerBox}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {query.trim() ? 'No users found' : 'No users yet'}
          </Text>
          {query.trim() ? (
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Try a different name or username
            </Text>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
