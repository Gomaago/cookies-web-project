import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  Contact,
  ContactRequest,
  sendContactRequest,
  acceptContactRequest,
  rejectContactRequest,
  removeContact,
  subscribeToContacts,
  subscribeToIncomingRequests,
  subscribeToOutgoingRequests,
} from '@/lib/contacts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContactsContextType {
  contacts: Contact[];
  incomingRequests: ContactRequest[];
  outgoingRequests: ContactRequest[];

  sendRequest: (receiverId: string) => Promise<string>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  removeContactById: (contactId: string) => Promise<void>;

  isContact: (userId: string) => boolean;
  hasPendingOutgoing: (userId: string) => boolean;
  hasPendingIncoming: (userId: string) => boolean;
  pendingIncomingRequest: (userId: string) => ContactRequest | undefined;
}

const ContactsContext = createContext<ContactsContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ContactsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<ContactRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<ContactRequest[]>([]);

  useEffect(() => {
    if (!user) {
      setContacts([]);
      setIncomingRequests([]);
      setOutgoingRequests([]);
      return;
    }

    const unsubContacts = subscribeToContacts(user.uid, setContacts);
    const unsubIncoming = subscribeToIncomingRequests(user.uid, setIncomingRequests);
    const unsubOutgoing = subscribeToOutgoingRequests(user.uid, setOutgoingRequests);

    return () => {
      unsubContacts();
      unsubIncoming();
      unsubOutgoing();
    };
  }, [user]);

  const sendRequest = useCallback(
    async (receiverId: string) => {
      if (!user) return '';
      return sendContactRequest(user.uid, receiverId);
    },
    [user]
  );

  const acceptRequest = useCallback(async (requestId: string) => {
    await acceptContactRequest(requestId);
  }, []);

  const rejectRequest = useCallback(async (requestId: string) => {
    await rejectContactRequest(requestId);
  }, []);

  const removeContactById = useCallback(
    async (contactId: string) => {
      if (!user) return;
      await removeContact(user.uid, contactId);
    },
    [user]
  );

  const isContact = useCallback(
    (userId: string) => contacts.some((c) => c.contactId === userId),
    [contacts]
  );

  const hasPendingOutgoing = useCallback(
    (userId: string) =>
      outgoingRequests.some(
        (r) => r.receiverId === userId && r.status === 'pending'
      ),
    [outgoingRequests]
  );

  const hasPendingIncoming = useCallback(
    (userId: string) =>
      incomingRequests.some(
        (r) => r.senderId === userId && r.status === 'pending'
      ),
    [incomingRequests]
  );

  const pendingIncomingRequest = useCallback(
    (userId: string) =>
      incomingRequests.find(
        (r) => r.senderId === userId && r.status === 'pending'
      ),
    [incomingRequests]
  );

  return (
    <ContactsContext.Provider
      value={{
        contacts,
        incomingRequests,
        outgoingRequests,
        sendRequest,
        acceptRequest,
        rejectRequest,
        removeContactById,
        isContact,
        hasPendingOutgoing,
        hasPendingIncoming,
        pendingIncomingRequest,
      }}
    >
      {children}
    </ContactsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContacts(): ContactsContextType {
  const ctx = useContext(ContactsContext);
  if (!ctx) throw new Error('useContacts must be used within ContactsProvider');
  return ctx;
}
