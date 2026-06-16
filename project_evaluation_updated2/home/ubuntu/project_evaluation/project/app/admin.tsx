import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import {
  getAllUsers,
  banUser,
  unbanUser,
  deleteChatRoom,
  getAllReports,
  resolveReport,
  getStats,
} from '@/lib/firestore';
import { ChatRoom, Report } from '@/lib/firestore';
import {
  ArrowLeft,
  Users,
  MessageSquare,
  AlertTriangle,
  Ban,
  CheckCircle,
} from 'lucide-react-native';

export default function AdminScreen() {
  const { colors } = useTheme();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'users' | 'rooms' | 'reports'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState({ users: 0, rooms: 0, messages: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!profile?.isAdmin) {
      router.back();
      return;
    }

    try {
      const [usersData, roomsData, reportsData, statsData] = await Promise.all([
        getAllUsers(),
        import('@/lib/firestore').then(({ getChatRooms }) => getChatRooms()),
        getAllReports(),
        getStats(),
      ]);

      setUsers(usersData);
      setRooms(roomsData);
      setReports(reportsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleBanUser = async (userId: string) => {
    Alert.alert(
      'Ban User',
      'Are you sure you want to ban this user?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ban',
          style: 'destructive',
          onPress: async () => {
            await banUser(userId);
            fetchData();
          },
        },
      ]
    );
  };

  const handleUnbanUser = async (userId: string) => {
    await unbanUser(userId);
    fetchData();
  };

  const handleDeleteRoom = async (roomId: string) => {
    Alert.alert(
      'Delete Room',
      'Are you sure you want to delete this room?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteChatRoom(roomId);
            fetchData();
          },
        },
      ]
    );
  };

  const handleResolveReport = async (reportId: string, action: 'resolved' | 'dismissed') => {
    await resolveReport(reportId, profile!.id, action);
    fetchData();
  };

  const getAvatarUrl = (avatarUrl: string | undefined, displayName: string) => {
    if (avatarUrl) return avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=2563EB&color=fff&size=64`;
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
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
      marginRight: 8,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    statsContainer: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 20,
      gap: 12,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      alignItems: 'center',
    },
    statValue: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.primary,
    },
    statLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 4,
    },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      marginBottom: 16,
      gap: 8,
    },
    tab: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
    },
    tabActive: {
      backgroundColor: colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    tabTextActive: {
      color: '#FFFFFF',
    },
    listContainer: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    userItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 8,
    },
    userAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
    },
    userInfo: {
      flex: 1,
      marginLeft: 12,
    },
    userName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    userMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    bannedBadge: {
      fontSize: 10,
      color: colors.error,
      fontWeight: '600',
      marginTop: 4,
    },
    actionButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 8,
    },
    reportItem: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    reportHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    reportIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.error + '20',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
    },
    reportInfo: {
      flex: 1,
    },
    reportType: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    reportTime: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    reportReason: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    reportActions: {
      flexDirection: 'row',
      gap: 8,
    },
    resolveButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: 'center',
    },
    resolveText: {
      fontSize: 14,
      fontWeight: '600',
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingTop: 40,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });

  const renderUser = ({ item }: { item: UserProfile }) => (
    <View style={styles.userItem}>
      <Image source={{ uri: getAvatarUrl(item.avatarUrl, item.displayName) }} style={styles.userAvatar} />
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.displayName}</Text>
        <Text style={styles.userMeta}>@{item.username}</Text>
        {item.isBanned && <Text style={styles.bannedBadge}>BANNED</Text>}
      </View>
      {item.isBanned ? (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.success + '20' }]}
          onPress={() => handleUnbanUser(item.id)}
        >
          <CheckCircle size={18} color={colors.success} />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
          onPress={() => handleBanUser(item.id)}
        >
          <Ban size={18} color={colors.error} />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderRoom = ({ item }: { item: ChatRoom }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userMeta}>{item.isPrivate ? 'Private' : 'Public'} room</Text>
      </View>
      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: colors.error + '20' }]}
        onPress={() => handleDeleteRoom(item.id)}
      >
        <Ban size={18} color={colors.error} />
      </TouchableOpacity>
    </View>
  );

  const renderReport = ({ item }: { item: Report }) => (
    <View style={styles.reportItem}>
      <View style={styles.reportHeader}>
        <View style={styles.reportIcon}>
          <AlertTriangle size={20} color={colors.error} />
        </View>
        <View style={styles.reportInfo}>
          <Text style={styles.reportType}>User Report</Text>
          <Text style={styles.reportTime}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      <Text style={styles.reportReason}>{item.reason}</Text>
      <View style={styles.reportActions}>
        <TouchableOpacity
          style={[styles.resolveButton, { backgroundColor: colors.success + '20' }]}
          onPress={() => handleResolveReport(item.id, 'resolved')}
        >
          <Text style={[styles.resolveText, { color: colors.success }]}>Resolve</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.resolveButton, { backgroundColor: colors.textSecondary + '20' }]}
          onPress={() => handleResolveReport(item.id, 'dismissed')}
        >
          <Text style={[styles.resolveText, { color: colors.textSecondary }]}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </View>
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.users}</Text>
          <Text style={styles.statLabel}>Users</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.rooms}</Text>
          <Text style={styles.statLabel}>Rooms</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.messages}</Text>
          <Text style={styles.statLabel}>Messages</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'users' && styles.tabActive]}
          onPress={() => setActiveTab('users')}
        >
          <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
            Users
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'rooms' && styles.tabActive]}
          onPress={() => setActiveTab('rooms')}
        >
          <Text style={[styles.tabText, activeTab === 'rooms' && styles.tabTextActive]}>
            Rooms
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'reports' && styles.tabActive]}
          onPress={() => setActiveTab('reports')}
        >
          <Text style={[styles.tabText, activeTab === 'reports' && styles.tabTextActive]}>
            Reports
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'users' && (
        <FlatList
          data={users}
          renderItem={renderUser}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {activeTab === 'rooms' && (
        <FlatList
          data={rooms}
          renderItem={renderRoom}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      {activeTab === 'reports' && (
        <FlatList
          data={reports}
          renderItem={renderReport}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={<Text style={styles.emptyText}>No pending reports</Text>}
        />
      )}
    </View>
  );
}
