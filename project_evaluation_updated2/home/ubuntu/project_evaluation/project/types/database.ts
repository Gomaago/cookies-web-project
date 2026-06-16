export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string;
          display_name: string;
          bio: string;
          avatar_url: string;
          phone: string;
          is_admin: boolean;
          is_banned: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          display_name: string;
          bio?: string;
          avatar_url?: string;
          phone?: string;
          is_admin?: boolean;
          is_banned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          display_name?: string;
          bio?: string;
          avatar_url?: string;
          phone?: string;
          is_admin?: boolean;
          is_banned?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      chats: {
        Row: {
          id: string;
          user1_id: string;
          user2_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user1_id: string;
          user2_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user1_id?: string;
          user2_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          chat_id: string | null;
          room_id: string | null;
          sender_id: string;
          content: string;
          message_type: 'text' | 'image' | 'voice';
          media_url: string;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          chat_id?: string;
          room_id?: string;
          sender_id: string;
          content: string;
          message_type?: 'text' | 'image' | 'voice';
          media_url?: string;
          created_at?: string;
          deleted_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          room_id?: string;
          sender_id?: string;
          content?: string;
          message_type?: 'text' | 'image' | 'voice';
          media_url?: string;
          created_at?: string;
          deleted_at?: string;
        };
      };
      chat_rooms: {
        Row: {
          id: string;
          name: string;
          description: string;
          image_url: string;
          owner_id: string;
          is_private: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          image_url?: string;
          owner_id: string;
          is_private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          image_url?: string;
          owner_id?: string;
          is_private?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_room_members: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          user_id: string;
          joined_at?: string;
        };
        Update: {
          id?: string;
          room_id?: string;
          user_id?: string;
          joined_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data?: Json;
          read_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          body?: string;
          data?: Json;
          read_at?: string;
          created_at?: string;
        };
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string | null;
          reported_message_id: string | null;
          reported_room_id: string | null;
          reason: string;
          status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id?: string;
          reported_message_id?: string;
          reported_room_id?: string;
          reason: string;
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          created_at?: string;
          resolved_at?: string;
          resolved_by?: string;
        };
        Update: {
          id?: string;
          reporter_id?: string;
          reported_user_id?: string;
          reported_message_id?: string;
          reported_room_id?: string;
          reason?: string;
          status?: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
          created_at?: string;
          resolved_at?: string;
          resolved_by?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
