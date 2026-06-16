import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  blockUser,
  unblockUser,
  subscribeToBlockedUsers,
  muteTarget,
  unmuteTarget,
  subscribeToMutes,
  reportUser,
  reportMessage,
  reportRoom,
  updatePrivacySettings,
  subscribeToPrivacySettings,
  MuteRecord,
  MuteTarget,
  PrivacySettings,
  ReportReason,
  LastSeenVisibility,
  ProfilePhotoVisibility,
} from '@/lib/privacy';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PrivacyContextType {
  // Block
  blockedIds: string[];
  blockUser: (targetId: string) => Promise<void>;
  unblockUser: (targetId: string) => Promise<void>;
  isUserBlocked: (targetId: string) => boolean;

  // Mute
  muteRecords: MuteRecord[];
  muteChat: (chatId: string) => Promise<void>;
  unmuteChat: (chatId: string) => Promise<void>;
  muteRoom: (roomId: string) => Promise<void>;
  unmuteRoom: (roomId: string) => Promise<void>;
  isMuted: (targetId: string) => boolean;

  // Report
  reportUserById: (reportedUserId: string, reason: ReportReason, details?: string) => Promise<void>;
  reportMessageById: (messageId: string, reportedUserId: string, reason: ReportReason, details?: string) => Promise<void>;
  reportRoomById: (roomId: string, reason: ReportReason, details?: string) => Promise<void>;

  // Privacy settings
  privacySettings: PrivacySettings | null;
  updateLastSeenVisibility: (value: LastSeenVisibility) => Promise<void>;
  updateProfilePhotoVisibility: (value: ProfilePhotoVisibility) => Promise<void>;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [muteRecords, setMuteRecords] = useState<MuteRecord[]>([]);
  const [privacySettings, setPrivacySettings] = useState<PrivacySettings | null>(null);

  // Subscribe to block list
  useEffect(() => {
    if (!user) {
      setBlockedIds([]);
      return;
    }
    return subscribeToBlockedUsers(user.uid, setBlockedIds);
  }, [user]);

  // Subscribe to mutes
  useEffect(() => {
    if (!user) {
      setMuteRecords([]);
      return;
    }
    return subscribeToMutes(user.uid, setMuteRecords);
  }, [user]);

  // Subscribe to privacy settings
  useEffect(() => {
    if (!user) {
      setPrivacySettings(null);
      return;
    }
    return subscribeToPrivacySettings(user.uid, setPrivacySettings);
  }, [user]);

  // Block helpers
  const handleBlockUser = useCallback(async (targetId: string) => {
    if (!user) return;
    await blockUser(user.uid, targetId);
  }, [user]);

  const handleUnblockUser = useCallback(async (targetId: string) => {
    if (!user) return;
    await unblockUser(user.uid, targetId);
  }, [user]);

  const isUserBlocked = useCallback(
    (targetId: string) => blockedIds.includes(targetId),
    [blockedIds]
  );

  // Mute helpers
  const muteChat = useCallback(async (chatId: string) => {
    if (!user) return;
    await muteTarget(user.uid, chatId, 'chat');
  }, [user]);

  const unmuteChat = useCallback(async (chatId: string) => {
    if (!user) return;
    await unmuteTarget(user.uid, chatId);
  }, [user]);

  const muteRoom = useCallback(async (roomId: string) => {
    if (!user) return;
    await muteTarget(user.uid, roomId, 'room');
  }, [user]);

  const unmuteRoom = useCallback(async (roomId: string) => {
    if (!user) return;
    await unmuteTarget(user.uid, roomId);
  }, [user]);

  const isMuted = useCallback(
    (targetId: string) => muteRecords.some((r) => r.targetId === targetId),
    [muteRecords]
  );

  // Report helpers
  const reportUserById = useCallback(
    async (reportedUserId: string, reason: ReportReason, details?: string) => {
      if (!user) return;
      await reportUser(user.uid, reportedUserId, reason, details);
    },
    [user]
  );

  const reportMessageById = useCallback(
    async (messageId: string, reportedUserId: string, reason: ReportReason, details?: string) => {
      if (!user) return;
      await reportMessage(user.uid, messageId, reportedUserId, reason, details);
    },
    [user]
  );

  const reportRoomById = useCallback(
    async (roomId: string, reason: ReportReason, details?: string) => {
      if (!user) return;
      await reportRoom(user.uid, roomId, reason, details);
    },
    [user]
  );

  // Privacy settings helpers
  const updateLastSeenVisibility = useCallback(
    async (value: LastSeenVisibility) => {
      if (!user) return;
      await updatePrivacySettings(user.uid, { lastSeenVisibility: value });
    },
    [user]
  );

  const updateProfilePhotoVisibility = useCallback(
    async (value: ProfilePhotoVisibility) => {
      if (!user) return;
      await updatePrivacySettings(user.uid, { profilePhotoVisibility: value });
    },
    [user]
  );

  return (
    <PrivacyContext.Provider
      value={{
        blockedIds,
        blockUser: handleBlockUser,
        unblockUser: handleUnblockUser,
        isUserBlocked,
        muteRecords,
        muteChat,
        unmuteChat,
        muteRoom,
        unmuteRoom,
        isMuted,
        reportUserById,
        reportMessageById,
        reportRoomById,
        privacySettings,
        updateLastSeenVisibility,
        updateProfilePhotoVisibility,
      }}
    >
      {children}
    </PrivacyContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePrivacy(): PrivacyContextType {
  const ctx = useContext(PrivacyContext);
  if (!ctx) throw new Error('usePrivacy must be used within PrivacyProvider');
  return ctx;
}
