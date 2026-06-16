import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { createChatRoom, RoomCategory, ROOM_CATEGORIES } from '@/lib/firestore';
import { ArrowLeft, Image as ImageIcon, Check } from 'lucide-react-native';

export default function CreateRoomScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [category, setCategory] = useState<RoomCategory>('general');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Room name cannot be empty');
      return;
    }

    if (!user) return;

    setLoading(true);

    try {
      const roomId = await createChatRoom(
        name.trim(),
        user.uid,
        description.trim(),
        isPrivate,
        category
      );
      router.replace(`/room/${roomId}`);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create room');
    } finally {
      setLoading(false);
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
    createButton: {
      backgroundColor: colors.primary,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    createButtonDisabled: {
      opacity: 0.5,
    },
    createText: {
      fontSize: 16,
      color: '#FFFFFF',
      fontWeight: '600',
    },
    scrollContent: {
      padding: 20,
    },
    imageContainer: {
      alignItems: 'center',
      marginBottom: 32,
    },
    imagePicker: {
      width: 120,
      height: 120,
      borderRadius: 24,
      backgroundColor: colors.backgroundSecondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 2,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    imagePickerText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
    },
    fieldContainer: {
      marginBottom: 24,
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
    descriptionInput: {
      minHeight: 100,
      textAlignVertical: 'top',
    },
    fieldHint: {
      fontSize: 12,
      color: colors.textTertiary,
      marginTop: 4,
    },
    categoryContainer: {
      gap: 8,
    },
    categoryItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    categoryItemSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '10',
    },
    categoryIcon: {
      fontSize: 20,
      marginRight: 12,
    },
    categoryLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      flex: 1,
    },
    checkIcon: {
      marginLeft: 8,
    },
    toggleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
    },
    toggleInfo: {
      flex: 1,
      marginRight: 12,
    },
    toggleLabel: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    toggleDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Room</Text>
        <TouchableOpacity
          style={[styles.createButton, loading && styles.createButtonDisabled]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.createText}>Create</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.imageContainer}>
          <TouchableOpacity style={styles.imagePicker}>
            <ImageIcon size={32} color={colors.textSecondary} />
            <Text style={styles.imagePickerText}>Add Photo</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Room Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Enter room name"
            placeholderTextColor={colors.placeholder}
            maxLength={50}
          />
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Category</Text>
          <View style={styles.categoryContainer}>
            {ROOM_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryItem,
                  category === cat.value && styles.categoryItemSelected,
                ]}
                onPress={() => setCategory(cat.value)}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
                <Text style={styles.categoryLabel}>{cat.label}</Text>
                {category === cat.value && (
                  <Check size={20} color={colors.primary} style={styles.checkIcon} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Description</Text>
          <TextInput
            style={[styles.input, styles.descriptionInput]}
            value={description}
            onChangeText={setDescription}
            placeholder="What's this room about?"
            placeholderTextColor={colors.placeholder}
            multiline
            maxLength={200}
          />
          <Text style={styles.fieldHint}>{description.length}/200</Text>
        </View>

        <View style={styles.fieldContainer}>
          <Text style={styles.label}>Privacy</Text>
          <View style={styles.toggleContainer}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleLabel}>Private Room</Text>
              <Text style={styles.toggleDescription}>
                Only members can see and join private rooms
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={setIsPrivate}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
