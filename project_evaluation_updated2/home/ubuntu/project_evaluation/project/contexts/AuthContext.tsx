import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from '@/lib/firebase';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  phone: string;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signOutUser: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getFirebaseErrorMessage(code: string): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Invalid email address.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
      return 'Sign-in was cancelled.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      import('@react-native-google-signin/google-signin').then(({ GoogleSignin }) => {
        GoogleSignin.configure({
          webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
          offlineAccess: true,
        });
      }).catch(() => {});
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchProfile(firebaseUser.uid, firebaseUser);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const fetchProfile = async (userId: string, firebaseUser?: User | null) => {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile({
          id: userId,
          email: data.email || '',
          username: data.username || '',
          displayName: data.displayName || 'User',
          bio: data.bio || '',
          avatarUrl: data.avatarUrl || '',
          phone: data.phone || '',
          isAdmin: data.isAdmin || false,
          isBanned: data.isBanned || false,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        });
      } else {
        const fbUser = firebaseUser || user;
        const newProfile = {
          email: fbUser?.email || '',
          username: `user_${userId.substring(0, 8)}`,
          displayName: fbUser?.displayName || 'New User',
          bio: '',
          avatarUrl: fbUser?.photoURL || '',
          phone: fbUser?.phoneNumber || '',
          isAdmin: false,
          isBanned: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        await setDoc(doc(db, 'users', userId), newProfile);
        setProfile({
          id: userId,
          email: newProfile.email,
          username: newProfile.username,
          displayName: newProfile.displayName,
          bio: newProfile.bio,
          avatarUrl: newProfile.avatarUrl,
          phone: newProfile.phone,
          isAdmin: false,
          isBanned: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string, password: string, username: string, displayName: string) => {
    try {
      const { user: firebaseUser } = await createUserWithEmailAndPassword(auth, email, password);

      await setDoc(doc(db, 'users', firebaseUser.uid), {
        email,
        username,
        displayName,
        bio: '',
        avatarUrl: '',
        phone: '',
        isAdmin: false,
        isBanned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { error: null };
    } catch (error: any) {
      const message = getFirebaseErrorMessage(error.code);
      return { error: new Error(message) };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      const message = getFirebaseErrorMessage(error.code);
      return { error: new Error(message) };
    }
  };

  const signInWithGoogle = async () => {
    try {
      if (Platform.OS === 'web') {
        const { GoogleAuthProvider, signInWithPopup } = await import('firebase/auth');
        const provider = new GoogleAuthProvider();
        await signInWithPopup(auth, provider);
      } else {
        const { GoogleSignin, statusCodes } = await import('@react-native-google-signin/google-signin');
        await GoogleSignin.hasPlayServices();
        const userInfo = await GoogleSignin.signIn();
        const idToken = userInfo.data?.idToken;

        if (!idToken) {
          throw new Error('No ID token returned from Google Sign-In');
        }

        const { GoogleAuthProvider, signInWithCredential } = await import('firebase/auth');
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      }
      return { error: null };
    } catch (error: any) {
      const message = getFirebaseErrorMessage(error.code || '');
      return { error: new Error(message) };
    }
  };

  const signOutUser = async () => {
    try {
      if (Platform.OS !== 'web') {
        import('@react-native-google-signin/google-signin')
          .then(({ GoogleSignin }) => GoogleSignin.signOut())
          .catch(() => {});
      }
      await signOut(auth);
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        ...updates,
        updatedAt: serverTimestamp(),
      });

      if (profile) {
        setProfile({ ...profile, ...updates });
      }
      return { error: null };
    } catch (error: any) {
      return { error: new Error(error.message || 'Failed to update profile') };
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.uid);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOutUser,
        updateProfile,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
