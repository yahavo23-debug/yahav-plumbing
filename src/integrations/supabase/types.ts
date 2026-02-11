export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          resource_id: string | null
          resource_label: string | null
          resource_type: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_label?: string | null
          resource_type: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          resource_id?: string | null
          resource_label?: string | null
          resource_type?: string
          user_id?: string
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          id: string
          is_singleton: boolean | null
          logo_path: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_singleton?: boolean | null
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_singleton?: boolean | null
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      change_audit_logs: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation: string
          record_id: string
          table_name: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      contractor_customer_access: {
        Row: {
          contractor_user_id: string
          created_at: string
          created_by: string
          customer_id: string
          id: string
        }
        Insert: {
          contractor_user_id: string
          created_at?: string
          created_by: string
          customer_id: string
          id?: string
        }
        Update: {
          contractor_user_id?: string
          created_at?: string
          created_by?: string
          customer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_customer_access_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_ledger: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          customer_id: string
          description: string | null
          entry_date: string
          entry_type: string
          id: string
          is_locked: boolean | null
          payment_method: string | null
          receipt_path: string | null
          service_call_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string
          customer_id: string
          description?: string | null
          entry_date?: string
          entry_type: string
          id?: string
          is_locked?: boolean | null
          payment_method?: string | null
          receipt_path?: string | null
          service_call_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          customer_id?: string
          description?: string | null
          entry_date?: string
          entry_type?: string
          id?: string
          is_locked?: boolean | null
          payment_method?: string | null
          receipt_path?: string | null
          service_call_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_ledger_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          has_legal_action: boolean
          id: string
          legal_action_note: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          has_legal_action?: boolean
          id?: string
          legal_action_note?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          has_legal_action?: boolean
          id?: string
          legal_action_note?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          ban_reason: string | null
          banned_by: string | null
          banned_until: string | null
          created_at: string
          full_name: string | null
          id: string
          id_number: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_by?: string | null
          banned_until?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          ban_reason?: string | null
          banned_by?: string | null
          banned_until?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          id_number?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          quantity: number
          quote_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string
          discount_percent: number
          id: string
          include_vat: boolean
          notes: string | null
          quote_number: number
          service_call_id: string
          signature_path: string | null
          signed_at: string | null
          status: string
          title: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          discount_percent?: number
          id?: string
          include_vat?: boolean
          notes?: string | null
          quote_number?: number
          service_call_id: string
          signature_path?: string | null
          signed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          discount_percent?: number
          id?: string
          include_vat?: boolean
          notes?: string | null
          quote_number?: number
          service_call_id?: string
          signature_path?: string | null
          signed_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      report_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          report_id: string
          revoked_at: string | null
          share_token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          report_id: string
          revoked_at?: string | null
          share_token?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          report_id?: string
          revoked_at?: string | null
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_shares_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          created_by: string
          findings: string | null
          id: string
          invoice_number: string | null
          invoice_status: string | null
          pdf_path: string | null
          quote_summary: string | null
          recommendations: string | null
          service_call_id: string
          signature_date: string | null
          signature_path: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          findings?: string | null
          id?: string
          invoice_number?: string | null
          invoice_status?: string | null
          pdf_path?: string | null
          quote_summary?: string | null
          recommendations?: string | null
          service_call_id: string
          signature_date?: string | null
          signature_path?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          findings?: string | null
          id?: string
          invoice_number?: string | null
          invoice_status?: string | null
          pdf_path?: string | null
          quote_summary?: string | null
          recommendations?: string | null
          service_call_id?: string
          signature_date?: string | null
          signature_path?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_call_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          service_call_id: string
          storage_path: string
          tag: string | null
          uploaded_by: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          service_call_id: string
          storage_path: string
          tag?: string | null
          uploaded_by: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          service_call_id?: string
          storage_path?: string
          tag?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_call_photos_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_call_shares: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          service_call_id: string
          share_token: string
          share_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          service_call_id: string
          share_token?: string
          share_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          service_call_id?: string
          share_token?: string
          share_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_call_shares_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_call_videos: {
        Row: {
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          service_call_id: string
          storage_path: string
          tag: string | null
          thumbnail_path: string | null
          title: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          service_call_id: string
          storage_path: string
          tag?: string | null
          thumbnail_path?: string | null
          title?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          service_call_id?: string
          storage_path?: string
          tag?: string | null
          thumbnail_path?: string | null
          title?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_call_videos_service_call_id_fkey"
            columns: ["service_call_id"]
            isOneToOne: false
            referencedRelation: "service_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      service_calls: {
        Row: {
          areas_not_inspected: string | null
          assigned_to: string | null
          call_number: number
          cause_assessment: string | null
          completed_at: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          customer_id: string
          customer_signature_date: string | null
          customer_signature_path: string | null
          description: string | null
          detection_method: string | null
          diagnosis_confidence: string | null
          duration_minutes: number | null
          findings: string | null
          id: string
          job_type: string
          leak_location: string | null
          main_valve_closed: boolean | null
          notes: string | null
          priority: string
          property_occupied: boolean | null
          quote_id: string | null
          recommendations: string | null
          resolution_text: string | null
          scheduled_at: string | null
          scheduled_date: string | null
          status: string
          test_limitations: string | null
          updated_at: string
          urgency_level: string | null
          visible_damage: string[] | null
          water_pressure_status: string | null
        }
        Insert: {
          areas_not_inspected?: string | null
          assigned_to?: string | null
          call_number: number
          cause_assessment?: string | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          customer_id: string
          customer_signature_date?: string | null
          customer_signature_path?: string | null
          description?: string | null
          detection_method?: string | null
          diagnosis_confidence?: string | null
          duration_minutes?: number | null
          findings?: string | null
          id?: string
          job_type: string
          leak_location?: string | null
          main_valve_closed?: boolean | null
          notes?: string | null
          priority?: string
          property_occupied?: boolean | null
          quote_id?: string | null
          recommendations?: string | null
          resolution_text?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          status?: string
          test_limitations?: string | null
          updated_at?: string
          urgency_level?: string | null
          visible_damage?: string[] | null
          water_pressure_status?: string | null
        }
        Update: {
          areas_not_inspected?: string | null
          assigned_to?: string | null
          call_number?: number
          cause_assessment?: string | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          customer_id?: string
          customer_signature_date?: string | null
          customer_signature_path?: string | null
          description?: string | null
          detection_method?: string | null
          diagnosis_confidence?: string | null
          duration_minutes?: number | null
          findings?: string | null
          id?: string
          job_type?: string
          leak_location?: string | null
          main_valve_closed?: boolean | null
          notes?: string | null
          priority?: string
          property_occupied?: boolean | null
          quote_id?: string | null
          recommendations?: string | null
          resolution_text?: string | null
          scheduled_at?: string | null
          scheduled_date?: string | null
          status?: string
          test_limitations?: string | null
          updated_at?: string
          urgency_level?: string | null
          visible_damage?: string[] | null
          water_pressure_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_calls_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      video_share_tokens: {
        Row: {
          created_at: string
          id: string
          report_share_id: string
          video_id: string
          video_token: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_share_id: string
          video_id: string
          video_token?: string
        }
        Update: {
          created_at?: string
          id?: string
          report_share_id?: string
          video_id?: string
          video_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_share_tokens_report_share_id_fkey"
            columns: ["report_share_id"]
            isOneToOne: false
            referencedRelation: "report_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_share_tokens_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "service_call_videos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_service_call: {
        Args: { _service_call_id: string; _user_id: string }
        Returns: boolean
      }
      contractor_can_access_customer: {
        Args: { _customer_id: string; _user_id: string }
        Returns: boolean
      }
      get_customer_for_sc: { Args: { _sc_id: string }; Returns: string }
      get_sc_id_for_photo: { Args: { _photo_id: string }; Returns: string }
      get_sc_id_for_quote: { Args: { _quote_id: string }; Returns: string }
      get_sc_id_for_report: { Args: { _report_id: string }; Returns: string }
      get_sc_id_for_video: { Args: { _video_id: string }; Returns: string }
      has_any_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "technician" | "secretary" | "contractor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "technician", "secretary", "contractor"],
    },
  },
} as const
