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
import { useTheme } from '@/contexts/ThemeContext';
import { searchRooms, ChatRoom } from '@/lib/firestore';
import { ArrowLeft, Search, Users, Lock } from 'lucide-react-native';

type RoomWithCount = ChatRoom & { memberCount: number };

export default function SearchRoomsScreen() {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RoomWithCount[]>([]);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const rooms = await searchRooms(text.trim());
      setResults(rooms as RoomWithCount[]);
    } catch (error) {
      console.error('Error searching rooms:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const getRoomImage = (imageUrl: string, name: string) => {
    if (imageUrl) return imageUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10B981&color=fff&size=128`;
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    backButton: { padding: 8, marginRight: 8 },
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
    listContainer: { paddingHorizontal: 16, paddingVertical: 12 },
    roomItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 10,
    },
    imageContainer: { position: 'relative' },
    roomImage: { width: 56, height: 56, borderRadius: 14 },
    privateBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      backgroundColor: colors.textSecondary,
      borderRadius: 10,
      padding: 3,
    },
    roomInfo: { flex: 1, marginLeft: 12 },
    roomName: { fontSize: 16, fontWeight: '600', color: colors.text },
    roomMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    roomMetaText: { fontSize: 12, color: colors.textSecondary },
    roomDescription: {
      fontSize: 13,
      color: colors.textTertiary,
      marginTop: 2,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: { fontSize: 18, color: colors.textSecondary, marginBottom: 8 },
    emptySubtext: { fontSize: 14, color: colors.textTertiary },
    loadingContainer: { paddingVertical: 20, alignItems: 'center' },
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
            <Search size={20} color={colors.textSecondary} />
          )}
          <TextInput
            style={styles.searchInput}
            placeholder="Search rooms by name or category..."
            placeholderTextColor={colors.placeholder}
            value={query}
            onChangeText={search}
            autoFocus
          />
        </View>
      </View>

      {!query.trim() ? (
        <View style={styles.emptyContainer}>
          <Search size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyText, { marginTop: 16 }]}>Search for rooms</Text>
          <Text style={styles.emptySubtext}>Find communities by name or category</Text>
        </View>
      ) : results.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No rooms found</Text>
          <Text style={styles.emptySubtext}>Try a different search term</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.roomItem}
              onPress={() => router.push(`/room/${item.id}`)}
            >
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: getRoomImage(item.imageUrl, item.name) }}
                  style={styles.roomImage}
                />
                {item.isPrivate && (
                  <View style={styles.privateBadge}>
                    <Lock size={11} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <View style={styles.roomInfo}>
                <Text style={styles.roomName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.roomMeta}>
                  <Users size={12} color={colors.textSecondary} />
                  <Text style={styles.roomMetaText}>{item.memberCount} members</Text>
                  <Text style={styles.roomMetaText}>· {item.category}</Text>
                </View>
                {item.description ? (
                  <Text style={styles.roomDescription} numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
