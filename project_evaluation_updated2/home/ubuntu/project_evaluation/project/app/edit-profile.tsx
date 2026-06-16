import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { uploadAvatar } from '@/lib/firestore';
import { ArrowLeft, Camera } from 'lucide-react-native';

export default function EditProfileScreen() {
  const { colors } = useTheme();
  const { user, profile, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Guard against double-submission (e.g., user taps Save twice, or component re-renders mid-save)
  const isSavingRef = useRef(false);

  const loading = uploading || saving;

  const handlePickImage = async () => {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photo library to change your profile picture.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setLocalAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (isSavingRef.current) return;
    if (!displayName.trim()) {
      Alert.alert('Error', 'Display name cannot be empty');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Error', 'Username cannot be empty');
      return;
    }
    if (!user) return;

    isSavingRef.current = true;
    let avatarUrl = profile?.avatarUrl;

    try {
      if (localAvatarUri) {
        setUploading(true);
        setUploadProgress(0);
        setUploadError(null);

        console.log('[edit-profile] starting avatar upload');
        // uploadAvatar reports progress 10–90%; final 90→100% comes from Firestore write below
        avatarUrl = await uploadAvatar(user.uid, localAvatarUri, (p) => setUploadProgress(p));
        console.log('[edit-profile] avatar upload complete, url:', avatarUrl?.slice(0, 60));

        // Upload done (90%). Write all fields + avatarUrl to Firestore.
        setUploadProgress(95);
        console.log('[edit-profile] writing to Firestore with avatarUrl');
        const { error: saveError } = await updateProfile({
          displayName: displayName.trim(),
          username: username.trim().toLowerCase(),
          bio: bio.trim(),
          avatarUrl,
        });

        if (saveError) {
          console.error('[edit-profile] Firestore update error:', saveError);
          throw saveError;
        }

        setUploadProgress(100);
        console.log('[edit-profile] Firestore update succeeded, navigating back');
        setUploading(false);
        router.back();
        return;
      }

      // No new avatar — just save text fields
      setSaving(true);
      console.log('[edit-profile] saving text fields to Firestore');
      const { error: saveError } = await updateProfile({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
      });

      if (saveError) {
        console.error('[edit-profile] Firestore update error:', saveError);
        throw saveError;
      }

      console.log('[edit-profile] text-only save succeeded, navigating back');
      setSaving(false);
      router.back();
    } catch (err: any) {
      const msg = err?.message || 'Could not save profile. Please try again.';
      console.error('[edit-profile] handleSave error:', err);
      setUploadError(msg);
      setUploading(false);
      setSaving(false);
      Alert.alert('Save failed', msg);
    } finally {
      isSavingRef.current = false;
    }
  };

  const avatarSource = localAvatarUri
    ? { uri: localAvatarUri }
    : profile?.avatarUrl
    ? { uri: profile.avatarUrl }
    : {
        uri: `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'User')}&background=2563EB&color=fff&size=200`,
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
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
    },
    saveButton: {
      padding: 8,
    },
    saveText: {
      fontSize: 16,
      color: colors.primary,
      fontWeight: '600',
    },
    saveTextDisabled: {
      color: colors.textSecondary,
    },
    scrollContent: {
      padding: 20,
    },
    avatarContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    avatarWrapper: {
      position: 'relative',
    },
    avatar: {
      width: 120,
      height: 120,
      borderRadius: 60,
    },
    avatarOverlay: {
      position: 'absolute',
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    cameraButton: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      backgroundColor: colors.primary,
      width: 36,
      height: 36,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      borderColor: colors.background,
    },
    progressRow: {
      marginTop: 10,
      alignItems: 'center',
      gap: 4,
    },
    progressBar: {
      width: 120,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
    },
    progressText: {
      fontSize: 11,
      color: colors.textSecondary,
    },
    uploadErrorText: {
      fontSize: 12,
      color: '#EF4444',
      marginTop: 6,
      textAlign: 'center',
    },
    fieldContainer: {
      marginBottom: 20,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    input: {
      backgroundColor: colors.input,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: colors.text,
    },
    bioInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    hint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} disabled={loading}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Text style={[styles.saveText, loading && styles.saveTextDisabled]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.avatarContainer}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={handlePickImage} disabled={loading}>
            <Image source={avatarSource} style={styles.avatar} />
            {uploading && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
            <View style={styles.cameraButton}>
              <Camera size={18} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {uploading && (
            <View style={styles.progressRow}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
            </View>
          )}
          {uploadError && !uploading && (
            <Text style={styles.uploadErrorText}>{uploadError}</Text>
          )}
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Display Name</Text>
          <TextInput
            style={styles.input}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Your display name"
            placeholderTextColor={colors.placeholder}
            maxLength={50}
            editable={!loading}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="Your username"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            editable={!loading}
          />
          <Text style={styles.hint}>Username must be unique</Text>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell us about yourself"
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={200}
            editable={!loading}
          />
          <Text style={styles.hint}>{bio.length}/200</Text>
        </View>
      </ScrollView>
    </View>
  );
}
