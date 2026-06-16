import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  Alert,
  SectionList,
} from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useContacts } from '@/contexts/ContactsContext';
import { getUserProfile } from '@/lib/firestore';
import { getOrCreateChat } from '@/lib/firestore';
import { UserProfile } from '@/contexts/AuthContext';
import {
  UserPlus,
  Search,
  MessageCircle,
  Check,
  X,
  UserMinus,
} from 'lucide-react-native';

function avatarUrl(url: string | undefined, name: string) {
  if (url) return url;
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=2563EB&color=fff&size=64`;
}

export default function ContactsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const {
    contacts,
    incomingRequests,
    outgoingRequests,
    acceptRequest,
    rejectRequest,
    removeContactById,
  } = useContacts();

  const [contactProfiles, setContactProfiles] = useState<Record<string, UserProfile>>({});
  const fetchingRef = useRef<Set<string>>(new Set());

  // Load profiles for any user IDs we haven't fetched yet
  useEffect(() => {
    const allIds = [
      ...contacts.map((c) => c.contactId),
      ...incomingRequests.map((r) => r.senderId),
    ];
    const missing = allIds.filter(
      (id) => !contactProfiles[id] && !fetchingRef.current.has(id)
    );
    if (missing.length === 0) return;

    missing.forEach((uid) => fetchingRef.current.add(uid));

    Promise.all(missing.map((uid) => getUserProfile(uid))).then((profiles) => {
      const updates: Record<string, UserProfile> = {};
      profiles.forEach((p, i) => {
        if (p) updates[missing[i]] = p;
      });
      if (Object.keys(updates).length > 0) {
        setContactProfiles((prev) => ({ ...prev, ...updates }));
      }
    });
  }, [contacts, incomingRequests]);

  const [loadingId, setLoadingId] = useState<string | null>(null);

  const startChat = async (contactId: string) => {
    if (!user) return;
    try {
      const chatId = await getOrCreateChat(user.uid, contactId);
      router.push(`/chat/${chatId}`);
    } catch {
      // ignore
    }
  };

  const handleAccept = async (requestId: string, senderId: string) => {
    setLoadingId(requestId);
    await acceptRequest(requestId);
    setLoadingId(null);
  };

  const handleReject = async (requestId: string) => {
    setLoadingId(requestId);
    await rejectRequest(requestId);
    setLoadingId(null);
  };

  const handleRemove = (contactId: string, name: string) => {
    Alert.alert('Remove Contact', `Remove ${name} from your contacts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeContactById(contactId),
      },
    ]);
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.background,
    },
    title: { fontSize: 32, fontWeight: '700', color: colors.text },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 6,
      backgroundColor: colors.background,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 16,
      backgroundColor: colors.card,
      marginHorizontal: 16,
      borderRadius: 14,
      marginBottom: 6,
    },
    avatar: { width: 46, height: 46, borderRadius: 23 },
    info: { flex: 1, marginLeft: 12, marginRight: 8 },
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    username: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
    actions: { flexDirection: 'row', gap: 8 },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    acceptBtn: { backgroundColor: colors.primary + '20' },
    rejectBtn: { backgroundColor: '#EF444420' },
    chatBtn: { backgroundColor: colors.primary + '20' },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingTop: 80,
    },
    emptyText: { fontSize: 17, color: colors.textSecondary, marginTop: 12 },
    emptySubtext: { fontSize: 14, color: colors.textTertiary, marginTop: 4 },
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
      marginLeft: 6,
    },
    badgeText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center' },
  });

  const renderContact = ({ item }: { item: typeof contacts[0] }) => {
    const profile = contactProfiles[item.contactId];
    const name = profile?.displayName ?? '...';
    const uname = profile?.username ?? '';
    return (
      <View style={styles.row}>
        <Image source={{ uri: avatarUrl(profile?.avatarUrl, name) }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {uname ? <Text style={styles.username} numberOfLines={1}>@{uname}</Text> : null}
        </View>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.iconBtn, styles.chatBtn]}
            onPress={() => startChat(item.contactId)}
          >
            <MessageCircle size={18} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconBtn, styles.rejectBtn]}
            onPress={() => handleRemove(item.contactId, name)}
          >
            <UserMinus size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderRequest = ({ item }: { item: typeof incomingRequests[0] }) => {
    const profile = contactProfiles[item.senderId];
    const name = profile?.displayName ?? '...';
    const uname = profile?.username ?? '';
    const isLoading = loadingId === item.id;
    return (
      <View style={styles.row}>
        <Image source={{ uri: avatarUrl(profile?.avatarUrl, name) }} style={styles.avatar} />
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {uname ? <Text style={styles.username} numberOfLines={1}>@{uname}</Text> : null}
        </View>
        <View style={styles.actions}>
          {isLoading ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.iconBtn, styles.acceptBtn]}
                onPress={() => handleAccept(item.id, item.senderId)}
              >
                <Check size={18} color={colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, styles.rejectBtn]}
                onPress={() => handleReject(item.id)}
              >
                <X size={18} color="#EF4444" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const hasContent =
    contacts.length > 0 || incomingRequests.length > 0 || outgoingRequests.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.title}>Contacts</Text>
          {incomingRequests.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{incomingRequests.length}</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/search')}>
          <Search size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {!hasContent ? (
        <View style={styles.emptyContainer}>
          <UserPlus size={56} color={colors.textTertiary} />
          <Text style={styles.emptyText}>No contacts yet</Text>
          <Text style={styles.emptySubtext}>Search for users to add them</Text>
        </View>
      ) : (
        <SectionList
          sections={[
            ...(incomingRequests.length > 0
              ? [{ title: 'Requests', data: incomingRequests, type: 'request' as const }]
              : []),
            ...(contacts.length > 0
              ? [{ title: `Contacts (${contacts.length})`, data: contacts, type: 'contact' as const }]
              : []),
          ]}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
          )}
          renderItem={({ item, section }) => {
            if (section.type === 'request') {
              return renderRequest({ item: item as typeof incomingRequests[0] });
            }
            return renderContact({ item: item as typeof contacts[0] });
          }}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
    </View>
  );
}
