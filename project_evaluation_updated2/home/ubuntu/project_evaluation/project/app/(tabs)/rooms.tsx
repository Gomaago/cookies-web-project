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
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getChatRooms,
  ChatRoom,
  Message,
  RoomCategory,
  ROOM_CATEGORIES,
} from '@/lib/firestore';
import { Users, Plus, Search, Lock, Activity } from 'lucide-react-native';

interface RoomWithDetails extends ChatRoom {
  memberCount: number;
  lastMessage?: Message;
}

export default function RoomsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<RoomCategory | null>(null);

  const fetchRooms = useCallback(async () => {
    if (!user) return;

    try {
      const roomsData = await getChatRooms(selectedCategory || undefined, false);
      setRooms(roomsData as RoomWithDetails[]);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, selectedCategory]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchRooms();
  }, [fetchRooms]);

  const getRoomImage = (imageUrl: string | undefined, name: string) => {
    if (imageUrl) return imageUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=10B981&color=fff&size=128`;
  };

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

  const getCategoryIcon = (category: RoomCategory) => {
    const cat = ROOM_CATEGORIES.find((c) => c.value === category);
    return cat?.icon || '💬';
  };

  const renderItem = ({ item }: { item: RoomWithDetails }) => (
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
            <Lock size={12} color="#FFFFFF" />
          </View>
        )}
        {item.activeUsers > 0 && (
          <View style={styles.activeBadge}>
            <Activity size={10} color="#10B981" />
            <Text style={styles.activeText}>{item.activeUsers}</Text>
          </View>
        )}
      </View>
      <View style={styles.roomInfo}>
        <View style={styles.roomHeader}>
          <View style={styles.roomNameRow}>
            <Text style={styles.categoryIcon}>{getCategoryIcon(item.category)}</Text>
            <Text style={styles.roomName} numberOfLines={1}>
              {item.name}
            </Text>
          </View>
          <View style={styles.memberCount}>
            <Users size={12} color={colors.textSecondary} />
            <Text style={styles.memberText}>{item.memberCount}</Text>
            {item.lastMessage && (
              <Text style={styles.timeText}>
                {formatTime(item.lastMessage.createdAt)}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.roomDescription} numberOfLines={1}>
          {item.description || 'No description'}
        </Text>
        {item.lastMessage && (
          <Text style={styles.lastMessage} numberOfLines={1}>
            {item.lastMessage.messageType === 'image'
              ? '📷 Photo'
              : item.lastMessage.messageType === 'voice'
              ? '🎤 Voice message'
              : item.lastMessage.content}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

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
    categoriesContainer: {
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    categoriesScroll: {
      paddingRight: 16,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.card,
      marginRight: 8,
      gap: 4,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
    },
    categoryChipText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      flexShrink: 1,
    },
    categoryChipTextActive: {
      color: '#FFFFFF',
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    roomItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 10,
    },
    imageContainer: {
      position: 'relative',
      flexShrink: 0,
    },
    roomImage: {
      width: 56,
      height: 56,
      borderRadius: 14,
    },
    privateBadge: {
      position: 'absolute',
      bottom: -4,
      right: -4,
      backgroundColor: colors.textSecondary,
      borderRadius: 10,
      padding: 4,
    },
    activeBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 5,
      paddingVertical: 3,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    activeText: {
      fontSize: 10,
      fontWeight: '600',
      color: '#10B981',
    },
    roomInfo: {
      flex: 1,
      marginLeft: 12,
      minWidth: 0,
    },
    roomHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
      gap: 8,
    },
    roomNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 5,
      minWidth: 0,
    },
    categoryIcon: {
      fontSize: 13,
      flexShrink: 0,
    },
    roomName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      flex: 1,
      minWidth: 0,
    },
    memberCount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      flexShrink: 0,
    },
    memberText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    timeText: {
      fontSize: 11,
      color: colors.textTertiary,
      marginLeft: 4,
    },
    roomDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 2,
    },
    lastMessage: {
      fontSize: 12,
      color: colors.textTertiary,
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
        <Text style={styles.title}>Rooms</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/search-rooms')}>
            <Search size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/create-room')}>
            <Plus size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.categoriesContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesScroll}
        >
          <TouchableOpacity
            style={[styles.categoryChip, selectedCategory === null && styles.categoryChipActive]}
            onPress={() => setSelectedCategory(null)}
          >
            <Text
              style={[styles.categoryChipText, selectedCategory === null && styles.categoryChipTextActive]}
            >
              All
            </Text>
          </TouchableOpacity>
          {ROOM_CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.value}
              style={[
                styles.categoryChip,
                selectedCategory === category.value && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(category.value)}
            >
              <Text style={styles.categoryIcon}>{category.icon}</Text>
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === category.value && styles.categoryChipTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : rooms.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Users size={64} color={colors.textTertiary} style={styles.emptyIcon} />
          <Text style={styles.emptyText}>
            {selectedCategory ? `No ${ROOM_CATEGORIES.find(c => c.value === selectedCategory)?.label} rooms` : 'No public rooms yet'}
          </Text>
          <Text style={styles.emptySubtext}>Create a room to start a community</Text>
        </View>
      ) : (
        <FlatList
          data={rooms}
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
