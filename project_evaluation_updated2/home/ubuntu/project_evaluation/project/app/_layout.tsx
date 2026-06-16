import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { TranslationProvider } from '@/contexts/TranslationContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { PresenceProvider } from '@/contexts/PresenceContext';
import { PrivacyProvider } from '@/contexts/PrivacyContext';
import { ContactsProvider } from '@/contexts/ContactsContext';
import { CallProvider, useCall } from '@/contexts/CallContext';
import { Phone, PhoneOff } from 'lucide-react-native';

// ---------------------------------------------------------------------------
// Incoming call banner — shown while ringing, navigates to call screen on answer
// ---------------------------------------------------------------------------

function IncomingCallBanner() {
  const { incomingCall, answerCall, declineCall } = useCall();
  const router = useRouter();

  if (!incomingCall) return null;

  const callTypeLabel = incomingCall.type === 'video' ? 'Video call' : 'Voice call';

  const handleAnswer = async () => {
    await answerCall(incomingCall.id, incomingCall.callerId, incomingCall.type);
    router.push(`/call/${incomingCall.id}`);
  };

  const handleDecline = async () => {
    await declineCall(incomingCall.id);
  };

  return (
    <View style={bannerStyles.banner}>
      <TouchableOpacity style={bannerStyles.info} onPress={() => router.push(`/call/${incomingCall.id}`)}>
        <Text style={bannerStyles.label}>{callTypeLabel} • incoming</Text>
        <Text style={bannerStyles.name} numberOfLines={1}>{incomingCall.callerId}</Text>
      </TouchableOpacity>
      <View style={bannerStyles.actions}>
        <TouchableOpacity style={bannerStyles.declineBtn} onPress={handleDecline}>
          <PhoneOff size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <TouchableOpacity style={bannerStyles.answerBtn} onPress={handleAnswer}>
          <Phone size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Outgoing ringing banner — shown while waiting for the callee to answer
// ---------------------------------------------------------------------------

function OutgoingRingingBanner() {
  const { activeCall, endCall } = useCall();
  const router = useRouter();

  if (!activeCall || activeCall.state !== 'ringing' || activeCall.direction !== 'outgoing') {
    return null;
  }

  const callTypeLabel = activeCall.type === 'video' ? 'Video' : 'Voice';

  const handleCancel = async () => {
    await endCall();
  };

  return (
    <TouchableOpacity
      style={outgoingStyles.banner}
      activeOpacity={0.9}
      onPress={() => router.push(`/call/${activeCall.callId}`)}
    >
      <View style={outgoingStyles.info}>
        <Text style={outgoingStyles.label}>{callTypeLabel} call • ringing…</Text>
        <Text style={outgoingStyles.text} numberOfLines={1}>{activeCall.remoteUserId}</Text>
      </View>
      <TouchableOpacity style={outgoingStyles.cancelBtn} onPress={handleCancel}>
        <PhoneOff size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Root layout content
// ---------------------------------------------------------------------------

function RootLayoutContent() {
  const { colors, isDark } = useTheme();
  const { user, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
    // Intentionally only react to auth state changes, not every segment change.
  }, [user, loading]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="search" options={{ headerShown: false }} />
        <Stack.Screen name="new-chat" options={{ headerShown: false }} />
        <Stack.Screen name="create-room" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="search-rooms" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <IncomingCallBanner />
      <OutgoingRingingBanner />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ThemeProvider>
      <AuthProvider>
        <TranslationProvider>
          <NotificationProvider>
            <PresenceProvider>
              <PrivacyProvider>
                <ContactsProvider>
                  <CallProvider>
                    <RootLayoutContent />
                  </CallProvider>
                </ContactsProvider>
              </PrivacyProvider>
            </PresenceProvider>
          </NotificationProvider>
        </TranslationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

// ---------------------------------------------------------------------------
// Styles (module-level — no theme dependency needed for call banners)
// ---------------------------------------------------------------------------

const bannerStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 999,
    backgroundColor: '#1C1C1E',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  info: { flex: 1 },
  label: { fontSize: 13, color: '#8E8E93', marginBottom: 2 },
  name: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  actions: { flexDirection: 'row', gap: 12 },
  declineBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  answerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

const outgoingStyles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 998,
    backgroundColor: '#0F766E',
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  info: { flex: 1 },
  label: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  text: { fontSize: 17, fontWeight: '600', color: '#FFFFFF' },
  cancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
