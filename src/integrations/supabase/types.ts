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
      additional_charges: {
        Row: {
          admin_id: string | null
          amount: number
          branch_id: string | null
          charge_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount?: number
          branch_id?: string | null
          charge_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          branch_id?: string | null
          charge_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "additional_charges_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "additional_charges_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          created_at: string
          hsn_code: string | null
          id: string
          item_id: string
          price: number
          quantity: number
          tax_amount: number | null
          tax_rate: number | null
          tax_rate_snapshot: number | null
          tax_type: string | null
          taxable_amount: number | null
          total: number
        }
        Insert: {
          bill_id: string
          created_at?: string
          hsn_code?: string | null
          id?: string
          item_id: string
          price: number
          quantity: number
          tax_amount?: number | null
          tax_rate?: number | null
          tax_rate_snapshot?: number | null
          tax_type?: string | null
          taxable_amount?: number | null
          total: number
        }
        Update: {
          bill_id?: string
          created_at?: string
          hsn_code?: string | null
          id?: string
          item_id?: string
          price?: number
          quantity?: number
          tax_amount?: number | null
          tax_rate?: number | null
          tax_rate_snapshot?: number | null
          tax_type?: string | null
          taxable_amount?: number | null
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          additional_charges: Json | null
          admin_id: string | null
          bill_no: string
          branch_id: string | null
          created_at: string
          created_by: string
          customer_gstin: string | null
          customer_mobile: string | null
          customer_phone: string | null
          date: string
          discount: number | null
          id: string
          is_deleted: boolean | null
          is_edited: boolean | null
          kitchen_status: Database["public"]["Enums"]["service_status"] | null
          order_type: string | null
          payment_details: Json | null
          payment_mode: Database["public"]["Enums"]["payment_method"]
          round_off: number | null
          service_status: Database["public"]["Enums"]["service_status"] | null
          status_updated_at: string | null
          table_no: string | null
          tax_summary: Json | null
          total_amount: number
          total_tax: number | null
          whatsapp_sent: boolean | null
          whatsapp_sent_at: string | null
        }
        Insert: {
          additional_charges?: Json | null
          admin_id?: string | null
          bill_no: string
          branch_id?: string | null
          created_at?: string
          created_by: string
          customer_gstin?: string | null
          customer_mobile?: string | null
          customer_phone?: string | null
          date?: string
          discount?: number | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          kitchen_status?: Database["public"]["Enums"]["service_status"] | null
          order_type?: string | null
          payment_details?: Json | null
          payment_mode: Database["public"]["Enums"]["payment_method"]
          round_off?: number | null
          service_status?: Database["public"]["Enums"]["service_status"] | null
          status_updated_at?: string | null
          table_no?: string | null
          tax_summary?: Json | null
          total_amount: number
          total_tax?: number | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
        }
        Update: {
          additional_charges?: Json | null
          admin_id?: string | null
          bill_no?: string
          branch_id?: string | null
          created_at?: string
          created_by?: string
          customer_gstin?: string | null
          customer_mobile?: string | null
          customer_phone?: string | null
          date?: string
          discount?: number | null
          id?: string
          is_deleted?: boolean | null
          is_edited?: boolean | null
          kitchen_status?: Database["public"]["Enums"]["service_status"] | null
          order_type?: string | null
          payment_details?: Json | null
          payment_mode?: Database["public"]["Enums"]["payment_method"]
          round_off?: number | null
          service_status?: Database["public"]["Enums"]["service_status"] | null
          status_updated_at?: string | null
          table_no?: string | null
          tax_summary?: Json | null
          total_amount?: number
          total_tax?: number | null
          whatsapp_sent?: boolean | null
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      bluetooth_settings: {
        Row: {
          auto_print: boolean
          branch_id: string | null
          created_at: string
          id: string
          is_enabled: boolean
          printer_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_print?: boolean
          branch_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          printer_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_print?: boolean
          branch_id?: string | null
          created_at?: string
          id?: string
          is_enabled?: boolean
          printer_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          admin_id: string
          code: string | null
          composition_rate: number | null
          contact_number: string | null
          created_at: string
          gst_enabled: boolean | null
          gstin: string | null
          id: string
          is_active: boolean | null
          is_composition_scheme: boolean | null
          is_default: boolean | null
          is_main: boolean
          logo_url: string | null
          menu_slug: string | null
          name: string
          shop_name: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          admin_id: string
          code?: string | null
          composition_rate?: number | null
          contact_number?: string | null
          created_at?: string
          gst_enabled?: boolean | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          is_composition_scheme?: boolean | null
          is_default?: boolean | null
          is_main?: boolean
          logo_url?: string | null
          menu_slug?: string | null
          name: string
          shop_name?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          admin_id?: string
          code?: string | null
          composition_rate?: number | null
          contact_number?: string | null
          created_at?: string
          gst_enabled?: boolean | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          is_composition_scheme?: boolean | null
          is_default?: boolean | null
          is_main?: boolean
          logo_url?: string | null
          menu_slug?: string | null
          name?: string
          shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          admin_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          last_visit: string | null
          name: string | null
          phone: string
          total_spent: number | null
          updated_at: string
          visit_count: number | null
        }
        Insert: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          last_visit?: string | null
          name?: string | null
          phone: string
          total_spent?: number | null
          updated_at?: string
          visit_count?: number | null
        }
        Update: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          last_visit?: string | null
          name?: string | null
          phone?: string
          total_spent?: number | null
          updated_at?: string
          visit_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      display_settings: {
        Row: {
          branch_id: string | null
          category_order: string[] | null
          created_at: string
          id: string
          items_per_row: number
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          category_order?: string[] | null
          created_at?: string
          id?: string
          items_per_row?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          category_order?: string[] | null
          created_at?: string
          id?: string
          items_per_row?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "display_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          admin_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          is_deleted: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          admin_id: string | null
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          created_by: string
          date: string
          expense_name: string | null
          id: string
          note: string | null
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          amount: number
          branch_id?: string | null
          category: string
          created_at?: string
          created_by: string
          date?: string
          expense_name?: string | null
          id?: string
          note?: string | null
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          created_by?: string
          date?: string
          expense_name?: string | null
          id?: string
          note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      item_categories: {
        Row: {
          admin_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          is_deleted: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_categories_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          admin_id: string | null
          base_value: number | null
          branch_id: string | null
          category: string | null
          created_at: string
          description: string | null
          display_order: number | null
          hsn_code: string | null
          id: string
          image_url: string | null
          is_active: boolean
          is_tax_inclusive: boolean | null
          media_type: string | null
          minimum_stock_alert: number | null
          name: string
          price: number
          purchase_rate: number | null
          quantity_step: number | null
          sale_count: number | null
          stock_quantity: number | null
          tax_rate_id: string | null
          unit: string | null
          unlimited_stock: boolean | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          admin_id?: string | null
          base_value?: number | null
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_tax_inclusive?: boolean | null
          media_type?: string | null
          minimum_stock_alert?: number | null
          name: string
          price: number
          purchase_rate?: number | null
          quantity_step?: number | null
          sale_count?: number | null
          stock_quantity?: number | null
          tax_rate_id?: string | null
          unit?: string | null
          unlimited_stock?: boolean | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          admin_id?: string | null
          base_value?: number | null
          branch_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_tax_inclusive?: boolean | null
          media_type?: string | null
          minimum_stock_alert?: number | null
          name?: string
          price?: number
          purchase_rate?: number | null
          quantity_step?: number | null
          sale_count?: number | null
          stock_quantity?: number | null
          tax_rate_id?: string | null
          unit?: string | null
          unlimited_stock?: boolean | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_tax_rate_id_fkey"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          admin_id: string | null
          branch_id: string | null
          created_at: string
          id: string
          is_default: boolean | null
          is_disabled: boolean | null
          payment_method: Database["public"]["Enums"]["payment_mode"] | null
          payment_type: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_disabled?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_mode"] | null
          payment_type: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          branch_id?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          is_disabled?: boolean | null
          payment_method?: Database["public"]["Enums"]["payment_mode"] | null
          payment_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          admin_id: string | null
          created_at: string
          has_qr_menu_access: boolean | null
          hotel_name: string | null
          id: string
          item_limit: number | null
          last_login: string | null
          login_count: number | null
          max_branches: number
          max_sub_users: number
          multi_branch_enabled: boolean | null
          name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string
          has_qr_menu_access?: boolean | null
          hotel_name?: string | null
          id?: string
          item_limit?: number | null
          last_login?: string | null
          login_count?: number | null
          max_branches?: number
          max_sub_users?: number
          multi_branch_enabled?: boolean | null
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string
          has_qr_menu_access?: boolean | null
          hotel_name?: string | null
          id?: string
          item_limit?: number | null
          last_login?: string | null
          login_count?: number | null
          max_branches?: number
          max_sub_users?: number
          multi_branch_enabled?: boolean | null
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_banners: {
        Row: {
          admin_id: string | null
          bg_color: string | null
          branch_id: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_text_only: boolean | null
          link_url: string | null
          start_date: string | null
          text_color: string | null
          title: string
        }
        Insert: {
          admin_id?: string | null
          bg_color?: string | null
          branch_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_text_only?: boolean | null
          link_url?: string | null
          start_date?: string | null
          text_color?: string | null
          title: string
        }
        Update: {
          admin_id?: string | null
          bg_color?: string | null
          branch_id?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_text_only?: boolean | null
          link_url?: string | null
          start_date?: string | null
          text_color?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_banners_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_banners_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          address: string | null
          branch_id: string | null
          composition_rate: number | null
          contact_number: string | null
          created_at: string | null
          facebook: string | null
          gst_enabled: boolean | null
          gstin: string | null
          id: string
          instagram: string | null
          is_composition_scheme: boolean | null
          logo_url: string | null
          menu_background_color: string | null
          menu_items_per_row: number | null
          menu_primary_color: string | null
          menu_secondary_color: string | null
          menu_show_address: boolean | null
          menu_show_category_header: boolean | null
          menu_show_phone: boolean | null
          menu_show_shop_name: boolean | null
          menu_slug: string | null
          menu_text_color: string | null
          printer_width: string | null
          shop_latitude: number | null
          shop_longitude: number | null
          shop_name: string | null
          show_facebook: boolean | null
          show_instagram: boolean | null
          show_order_type: boolean | null
          show_whatsapp: boolean | null
          updated_at: string | null
          user_id: string
          visible_nav_pages: string[] | null
          whatsapp: string | null
          whatsapp_bill_share_enabled: boolean | null
          whatsapp_business_api_enabled: boolean | null
          whatsapp_business_api_token: string | null
          whatsapp_business_phone_id: string | null
          whatsapp_share_mode: string | null
        }
        Insert: {
          address?: string | null
          branch_id?: string | null
          composition_rate?: number | null
          contact_number?: string | null
          created_at?: string | null
          facebook?: string | null
          gst_enabled?: boolean | null
          gstin?: string | null
          id?: string
          instagram?: string | null
          is_composition_scheme?: boolean | null
          logo_url?: string | null
          menu_background_color?: string | null
          menu_items_per_row?: number | null
          menu_primary_color?: string | null
          menu_secondary_color?: string | null
          menu_show_address?: boolean | null
          menu_show_category_header?: boolean | null
          menu_show_phone?: boolean | null
          menu_show_shop_name?: boolean | null
          menu_slug?: string | null
          menu_text_color?: string | null
          printer_width?: string | null
          shop_latitude?: number | null
          shop_longitude?: number | null
          shop_name?: string | null
          show_facebook?: boolean | null
          show_instagram?: boolean | null
          show_order_type?: boolean | null
          show_whatsapp?: boolean | null
          updated_at?: string | null
          user_id: string
          visible_nav_pages?: string[] | null
          whatsapp?: string | null
          whatsapp_bill_share_enabled?: boolean | null
          whatsapp_business_api_enabled?: boolean | null
          whatsapp_business_api_token?: string | null
          whatsapp_business_phone_id?: string | null
          whatsapp_share_mode?: string | null
        }
        Update: {
          address?: string | null
          branch_id?: string | null
          composition_rate?: number | null
          contact_number?: string | null
          created_at?: string | null
          facebook?: string | null
          gst_enabled?: boolean | null
          gstin?: string | null
          id?: string
          instagram?: string | null
          is_composition_scheme?: boolean | null
          logo_url?: string | null
          menu_background_color?: string | null
          menu_items_per_row?: number | null
          menu_primary_color?: string | null
          menu_secondary_color?: string | null
          menu_show_address?: boolean | null
          menu_show_category_header?: boolean | null
          menu_show_phone?: boolean | null
          menu_show_shop_name?: boolean | null
          menu_slug?: string | null
          menu_text_color?: string | null
          printer_width?: string | null
          shop_latitude?: number | null
          shop_longitude?: number | null
          shop_name?: string | null
          show_facebook?: boolean | null
          show_instagram?: boolean | null
          show_order_type?: boolean | null
          show_whatsapp?: boolean | null
          updated_at?: string | null
          user_id?: string
          visible_nav_pages?: string[] | null
          whatsapp?: string | null
          whatsapp_bill_share_enabled?: boolean | null
          whatsapp_business_api_enabled?: boolean | null
          whatsapp_business_api_token?: string | null
          whatsapp_business_phone_id?: string | null
          whatsapp_share_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shop_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      table_orders: {
        Row: {
          admin_id: string
          bill_id: string | null
          branch_id: string | null
          created_at: string | null
          customer_note: string | null
          id: string
          is_billed: boolean | null
          items: Json
          order_number: number
          session_id: string
          status: string
          table_number: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          admin_id: string
          bill_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          customer_note?: string | null
          id?: string
          is_billed?: boolean | null
          items?: Json
          order_number?: number
          session_id: string
          status?: string
          table_number: string
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          admin_id?: string
          bill_id?: string | null
          branch_id?: string | null
          created_at?: string | null
          customer_note?: string | null
          id?: string
          is_billed?: boolean | null
          items?: Json
          order_number?: number
          session_id?: string
          status?: string
          table_number?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_orders_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_orders_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      table_service_requests: {
        Row: {
          admin_id: string
          branch_id: string | null
          created_at: string | null
          id: string
          message: string | null
          request_type: string
          resolved_at: string | null
          resolved_by: string | null
          session_id: string
          status: string
          table_number: string
        }
        Insert: {
          admin_id: string
          branch_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id: string
          status?: string
          table_number: string
        }
        Update: {
          admin_id?: string
          branch_id?: string | null
          created_at?: string | null
          id?: string
          message?: string | null
          request_type?: string
          resolved_at?: string | null
          resolved_by?: string | null
          session_id?: string
          status?: string
          table_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_service_requests_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          admin_id: string | null
          branch_id: string | null
          capacity: number | null
          created_at: string
          current_bill_id: string | null
          display_order: number | null
          id: string
          is_active: boolean
          status: string
          table_name: string | null
          table_number: string
          updated_at: string
        }
        Insert: {
          admin_id?: string | null
          branch_id?: string | null
          capacity?: number | null
          created_at?: string
          current_bill_id?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          status?: string
          table_name?: string | null
          table_number: string
          updated_at?: string
        }
        Update: {
          admin_id?: string | null
          branch_id?: string | null
          capacity?: number | null
          created_at?: string
          current_bill_id?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean
          status?: string
          table_name?: string | null
          table_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tables_current_bill_id_fkey"
            columns: ["current_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          admin_id: string
          branch_id: string | null
          cess_rate: number
          created_at: string
          hsn_code: string | null
          id: string
          is_active: boolean
          name: string
          rate: number
          updated_at: string
        }
        Insert: {
          admin_id: string
          branch_id?: string | null
          cess_rate?: number
          created_at?: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name: string
          rate?: number
          updated_at?: string
        }
        Update: {
          admin_id?: string
          branch_id?: string | null
          cess_rate?: number
          created_at?: string
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tax_rates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_branches: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_branches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          has_access: boolean
          id: string
          page_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          has_access?: boolean
          id?: string
          page_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          has_access?: boolean
          id?: string
          page_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          pos_view: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          pos_view?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          pos_view?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_service_request_rate_limit: {
        Args: { p_admin_id: string; p_table_number: string }
        Returns: boolean
      }
      check_table_order_rate_limit: {
        Args: {
          p_admin_id: string
          p_session_id: string
          p_table_number: string
        }
        Returns: boolean
      }
      copy_items_to_branch: {
        Args: {
          p_item_ids?: string[]
          p_source_branch_id: string
          p_target_branch_id: string
        }
        Returns: number
      }
      create_bill_transaction:
        | {
            Args: {
              p_additional_charges: Json
              p_bill_no: string
              p_created_by: string
              p_date: string
              p_discount: number
              p_items: Json
              p_payment_details: Json
              p_payment_mode: Database["public"]["Enums"]["payment_method"]
              p_total_amount: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_bill_no: string
              p_discount: number
              p_items: Json
              p_payment_details?: Json
              p_payment_mode: Database["public"]["Enums"]["payment_method"]
              p_table_id?: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_bill_no: string
              p_branch_id?: string
              p_discount: number
              p_items: Json
              p_payment_details?: Json
              p_payment_mode: Database["public"]["Enums"]["payment_method"]
              p_table_id?: string
              p_user_id: string
            }
            Returns: Json
          }
      get_branch_scoped_shop_settings: {
        Args: { p_branch_id: string; p_user_id: string }
        Returns: {
          address: string | null
          branch_id: string | null
          composition_rate: number | null
          contact_number: string | null
          created_at: string | null
          facebook: string | null
          gst_enabled: boolean | null
          gstin: string | null
          id: string
          instagram: string | null
          is_composition_scheme: boolean | null
          logo_url: string | null
          menu_background_color: string | null
          menu_items_per_row: number | null
          menu_primary_color: string | null
          menu_secondary_color: string | null
          menu_show_address: boolean | null
          menu_show_category_header: boolean | null
          menu_show_phone: boolean | null
          menu_show_shop_name: boolean | null
          menu_slug: string | null
          menu_text_color: string | null
          printer_width: string | null
          shop_latitude: number | null
          shop_longitude: number | null
          shop_name: string | null
          show_facebook: boolean | null
          show_instagram: boolean | null
          show_order_type: boolean | null
          show_whatsapp: boolean | null
          updated_at: string | null
          user_id: string
          visible_nav_pages: string[] | null
          whatsapp: string | null
          whatsapp_bill_share_enabled: boolean | null
          whatsapp_business_api_enabled: boolean | null
          whatsapp_business_api_token: string | null
          whatsapp_business_phone_id: string | null
          whatsapp_share_mode: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "shop_settings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_admin_id: { Args: never; Returns: string }
      get_my_permissions: {
        Args: never
        Returns: {
          has_access: boolean
          page_name: string
        }[]
      }
      get_my_profile_id: { Args: never; Returns: string }
      get_my_role: { Args: never; Returns: string }
      get_public_item_categories: {
        Args: { p_admin_id: string }
        Returns: {
          branch_id: string
          id: string
          name: string
        }[]
      }
      get_public_shop_settings: { Args: { p_user_id: string }; Returns: Json }
      get_public_shop_settings_by_profile: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      get_public_shop_settings_for_branch: {
        Args: { p_admin_id: string; p_branch_id: string }
        Returns: Json
      }
      get_user_admin_id: { Args: never; Returns: string }
      has_page_permission: {
        Args: { _page_name: string; _user_id: string }
        Returns: boolean
      }
      is_admin_or_super: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_user_allowed_to_login: {
        Args: { p_user_id: string }
        Returns: {
          allowed: boolean
          reason: string
        }[]
      }
      public_update_table_status: {
        Args: { p_admin_id: string; p_status: string; p_table_no: string }
        Returns: undefined
      }
      resolve_branch_menu: {
        Args: { p_branch_code: string; p_shop_slug: string }
        Returns: {
          admin_id: string
          branch_id: string
        }[]
      }
      resolve_menu_slug: { Args: { p_slug: string }; Returns: string }
      resolve_menu_target: {
        Args: { p_slug: string }
        Returns: {
          admin_id: string
          branch_id: string
        }[]
      }
      seed_branch_defaults: {
        Args: { p_source_branch_id?: string; p_target_branch_id: string }
        Returns: Json
      }
      user_has_branch_access: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "super_admin"
      payment_method: "cash" | "upi" | "card" | "other"
      payment_mode: "cash" | "card" | "upi" | "online"
      service_status:
        | "pending"
        | "preparing"
        | "ready"
        | "served"
        | "completed"
        | "rejected"
      user_status: "active" | "paused" | "deleted"
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
      app_role: ["admin", "user", "super_admin"],
      payment_method: ["cash", "upi", "card", "other"],
      payment_mode: ["cash", "card", "upi", "online"],
      service_status: [
        "pending",
        "preparing",
        "ready",
        "served",
        "completed",
        "rejected",
      ],
      user_status: ["active", "paused", "deleted"],
    },
  },
} as const
