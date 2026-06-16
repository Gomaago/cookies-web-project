import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Switch,
  ScrollView,
  Modal,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth, UserProfile } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTranslation } from '@/contexts/TranslationContext';
import { SUPPORTED_LANGUAGES } from '@/lib/translation';
import {
  Moon,
  Sun,
  User,
  Shield,
  Bell,
  HelpCircle,
  LogOut,
  ChevronRight,
  ShieldCheck,
  Globe,
  Languages,
  Eye,
  Check,
} from 'lucide-react-native';

export default function SettingsScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const { user, profile, signOutUser } = useAuth();
  const {
    preferredLanguage,
    autoTranslate,
    showOriginalByDefault,
    setPreferredLanguage,
    setAutoTranslate,
    setShowOriginalByDefault,
  } = useTranslation();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);

  const handleSignOut = async () => {
    await signOutUser();
    router.replace('/(auth)/login');
  };

  const getAvatarUrl = () => {
    if (profile?.avatarUrl) return profile.avatarUrl;
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(profile?.displayName || 'User')}&background=2563EB&color=fff&size=200`;
  };

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === preferredLanguage);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 24,
    },
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: colors.text,
    },
    profileSection: {
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 32,
    },
    avatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      marginBottom: 12,
    },
    profileName: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    profileUsername: {
      fontSize: 16,
      color: colors.textSecondary,
    },
    profileBio: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 8,
      textAlign: 'center',
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginHorizontal: 16,
      marginBottom: 2,
    },
    settingIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      flexShrink: 0,
    },
    settingContent: {
      flex: 1,
      minWidth: 0,
      marginRight: 8,
    },
    settingLabel: {
      fontSize: 16,
      color: colors.text,
    },
    settingValue: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
      flexShrink: 1,
    },
    signOutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.error + '20',
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderRadius: 12,
      marginHorizontal: 16,
      marginTop: 24,
      justifyContent: 'center',
    },
    signOutText: {
      fontSize: 16,
      color: colors.error,
      fontWeight: '600',
      marginLeft: 8,
    },
    version: {
      textAlign: 'center',
      marginTop: 24,
      color: colors.textTertiary,
      fontSize: 12,
    },
    // Language picker modal
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '75%',
      paddingBottom: 32,
    },
    modalHandle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 4,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    languageItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    languageText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      minWidth: 0,
    },
    languageNative: {
      fontSize: 14,
      color: colors.textSecondary,
      marginLeft: 8,
      flexShrink: 1,
    },
  });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
        </View>

        <TouchableOpacity style={styles.profileSection} onPress={() => router.push('/edit-profile')}>
          <Image source={{ uri: getAvatarUrl() }} style={styles.avatar} />
          <Text style={styles.profileName}>{profile?.displayName || 'User'}</Text>
          <Text style={styles.profileUsername}>@{profile?.username || 'username'}</Text>
          {profile?.bio && <Text style={styles.profileBio}>{profile.bio}</Text>}
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
              {isDark ? (
                <Moon size={18} color={colors.primary} />
              ) : (
                <Sun size={18} color={colors.primary} />
              )}
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Dark Mode</Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: colors.accent + '20' }]}>
              <Bell size={18} color={colors.accent} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Language & Translation section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Language & Translation</Text>

          {/* Preferred Language */}
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => setLanguagePickerVisible(true)}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#0EA5E920' }]}>
              <Globe size={18} color="#0EA5E9" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Preferred Language</Text>
              <Text style={styles.settingValue}>
                {currentLang ? `${currentLang.name} — ${currentLang.nativeName}` : preferredLanguage}
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Auto Translate */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: '#10B98120' }]}>
              <Languages size={18} color="#10B981" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Auto Translate</Text>
              <Text style={styles.settingValue}>Translate incoming messages automatically</Text>
            </View>
            <Switch
              value={autoTranslate}
              onValueChange={setAutoTranslate}
              trackColor={{ false: colors.border, true: '#10B981' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Show Original by Default */}
          <View style={styles.settingItem}>
            <View style={[styles.settingIcon, { backgroundColor: '#F59E0B20' }]}>
              <Eye size={18} color="#F59E0B" />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Show Original First</Text>
              <Text style={styles.settingValue}>
                Always show original text before translation
              </Text>
            </View>
            <Switch
              value={showOriginalByDefault}
              onValueChange={setShowOriginalByDefault}
              trackColor={{ false: colors.border, true: '#F59E0B' }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/edit-profile')}>
            <View style={[styles.settingIcon, { backgroundColor: colors.secondary + '20' }]}>
              <User size={18} color={colors.secondary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Edit Profile</Text>
              <Text style={styles.settingValue}>Update your profile information</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/privacy')}>
            <View style={[styles.settingIcon, { backgroundColor: colors.textSecondary + '20' }]}>
              <Shield size={18} color={colors.textSecondary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Privacy</Text>
              <Text style={styles.settingValue}>Manage your privacy settings</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {profile?.isAdmin && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Admin</Text>
            <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/admin')}>
              <View style={[styles.settingIcon, { backgroundColor: colors.error + '20' }]}>
                <ShieldCheck size={18} color={colors.error} />
              </View>
              <View style={styles.settingContent}>
                <Text style={styles.settingLabel}>Admin Dashboard</Text>
                <Text style={styles.settingValue}>Manage users and content</Text>
              </View>
              <ChevronRight size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <TouchableOpacity style={styles.settingItem} onPress={() => router.push('/help')}>
            <View style={[styles.settingIcon, { backgroundColor: colors.primary + '20' }]}>
              <HelpCircle size={18} color={colors.primary} />
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingLabel}>Help Center</Text>
              <Text style={styles.settingValue}>Get help with ConnectHub</Text>
            </View>
            <ChevronRight size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={20} color={colors.error} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.version}>ConnectHub v1.0.0</Text>
      </ScrollView>

      {/* Language picker bottom sheet */}
      <Modal
        visible={languagePickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLanguagePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLanguagePickerVisible(false)}
        >
          <View style={styles.modalSheet} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select Language</Text>
            <FlatList
              data={SUPPORTED_LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.languageItem}
                  onPress={() => {
                    setPreferredLanguage(item.code);
                    setLanguagePickerVisible(false);
                  }}
                >
                  <Text style={styles.languageText}>{item.name}</Text>
                  <Text style={styles.languageNative}>{item.nativeName}</Text>
                  {preferredLanguage === item.code && (
                    <Check size={18} color={colors.primary} style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}


