export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      checklist_templates: {
        Row: {
          created_at: string;
          id: string;
          is_supplement: boolean;
          section: string;
          sort_order: number;
          supplement_slugs: string[];
          template_key: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          is_supplement?: boolean;
          section: string;
          sort_order?: number;
          supplement_slugs?: string[];
          template_key: string;
          title: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_supplement?: boolean;
          section?: string;
          sort_order?: number;
          supplement_slugs?: string[];
          template_key?: string;
          title?: string;
        };
      };
      daily_checklists: {
        Row: {
          completed: boolean;
          created_at: string;
          entry_date: string;
          id: string;
          template_key: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          created_at?: string;
          entry_date: string;
          id?: string;
          template_key: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          entry_date?: string;
          id?: string;
          template_key?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      daily_entries: {
        Row: {
          body_weight: number | null;
          calories: number | null;
          created_at: string;
          cravings_score: number | null;
          energy_score: number | null;
          entry_date: string;
          id: string;
          notes: string | null;
          sleep_score: number | null;
          training_completed: boolean;
          day_type: "training" | "rest";
          updated_at: string;
          user_id: string;
        };
        Insert: {
          body_weight?: number | null;
          calories?: number | null;
          created_at?: string;
          cravings_score?: number | null;
          energy_score?: number | null;
          entry_date: string;
          id?: string;
          notes?: string | null;
          sleep_score?: number | null;
          training_completed?: boolean;
          day_type?: "training" | "rest";
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body_weight?: number | null;
          calories?: number | null;
          created_at?: string;
          cravings_score?: number | null;
          energy_score?: number | null;
          entry_date?: string;
          id?: string;
          notes?: string | null;
          sleep_score?: number | null;
          training_completed?: boolean;
          day_type?: "training" | "rest";
          updated_at?: string;
          user_id?: string;
        };
      };
      day_templates: {
        Row: {
          calories: number | null;
          created_at: string;
          day_type: "training" | "rest";
          default_checklist_keys: string[] | null;
          id: string;
          meal_template_keys: string[] | null;
          notes: string | null;
          slug: string;
          title: string;
        };
        Insert: {
          calories?: number | null;
          created_at?: string;
          day_type: "training" | "rest";
          default_checklist_keys?: string[] | null;
          id?: string;
          meal_template_keys?: string[] | null;
          notes?: string | null;
          slug: string;
          title: string;
        };
        Update: {
          calories?: number | null;
          created_at?: string;
          day_type?: "training" | "rest";
          default_checklist_keys?: string[] | null;
          id?: string;
          meal_template_keys?: string[] | null;
          notes?: string | null;
          slug?: string;
          title?: string;
        };
      };
      meal_templates: {
        Row: {
          calories: number | null;
          carbs_g: number | null;
          created_at: string;
          description: string | null;
          fat_g: number | null;
          id: string;
          meal_slot: string;
          name: string;
          notes: string | null;
          protein_g: number | null;
          sort_order: number;
          template_key: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          calories?: number | null;
          carbs_g?: number | null;
          created_at?: string;
          description?: string | null;
          fat_g?: number | null;
          id?: string;
          meal_slot: string;
          name: string;
          notes?: string | null;
          protein_g?: number | null;
          sort_order?: number;
          template_key: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          calories?: number | null;
          carbs_g?: number | null;
          created_at?: string;
          description?: string | null;
          fat_g?: number | null;
          id?: string;
          meal_slot?: string;
          name?: string;
          notes?: string | null;
          protein_g?: number | null;
          sort_order?: number;
          template_key?: string;
          updated_at?: string;
          user_id?: string | null;
        };
      };
      phase_supplements: {
        Row: {
          dosage: string | null;
          id: string;
          notes: string | null;
          phase_id: string;
          sort_order: number;
          supplement_id: string;
          timing: string | null;
        };
        Insert: {
          dosage?: string | null;
          id?: string;
          notes?: string | null;
          phase_id: string;
          sort_order?: number;
          supplement_id: string;
          timing?: string | null;
        };
        Update: {
          dosage?: string | null;
          id?: string;
          notes?: string | null;
          phase_id?: string;
          sort_order?: number;
          supplement_id?: string;
          timing?: string | null;
        };
      };
      phases: {
        Row: {
          created_at: string;
          guidance: string | null;
          id: string;
          name: string;
          objective: string;
          slug: string;
          sort_order: number;
          summary: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          guidance?: string | null;
          id?: string;
          name: string;
          objective: string;
          slug: string;
          sort_order?: number;
          summary: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          guidance?: string | null;
          id?: string;
          name?: string;
          objective?: string;
          slug?: string;
          sort_order?: number;
          summary?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string | null;
          id: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          id?: string;
          timezone?: string;
          updated_at?: string;
        };
      };
      supplement_catalog: {
        Row: {
          category: string;
          created_at: string;
          dosage: string | null;
          guidance: string | null;
          id: string;
          is_default_active: boolean;
          name: string;
          slug: string;
          sort_order: number;
          timing: string | null;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          dosage?: string | null;
          guidance?: string | null;
          id?: string;
          is_default_active?: boolean;
          name: string;
          slug: string;
          sort_order?: number;
          timing?: string | null;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          dosage?: string | null;
          guidance?: string | null;
          id?: string;
          is_default_active?: boolean;
          name?: string;
          slug?: string;
          sort_order?: number;
          timing?: string | null;
          updated_at?: string;
        };
      };
      supplement_logs: {
        Row: {
          completed: boolean;
          created_at: string;
          id: string;
          log_date: string;
          supplement_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          log_date: string;
          supplement_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          completed?: boolean;
          created_at?: string;
          id?: string;
          log_date?: string;
          supplement_id?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      user_settings: {
        Row: {
          current_phase_slug: string;
          dark_mode_preference: "system" | "light" | "dark";
          macro_rest_calories: number;
          macro_rest_carbs: number;
          macro_rest_fat: number;
          macro_rest_protein: number;
          macro_training_calories: number;
          macro_training_carbs: number;
          macro_training_fat: number;
          macro_training_protein: number;
          phase_started_at: string;
          training_days: number[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_phase_slug?: string;
          dark_mode_preference?: "system" | "light" | "dark";
          macro_rest_calories?: number;
          macro_rest_carbs?: number;
          macro_rest_fat?: number;
          macro_rest_protein?: number;
          macro_training_calories?: number;
          macro_training_carbs?: number;
          macro_training_fat?: number;
          macro_training_protein?: number;
          phase_started_at?: string;
          training_days?: number[];
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          current_phase_slug?: string;
          dark_mode_preference?: "system" | "light" | "dark";
          macro_rest_calories?: number;
          macro_rest_carbs?: number;
          macro_rest_fat?: number;
          macro_rest_protein?: number;
          macro_training_calories?: number;
          macro_training_carbs?: number;
          macro_training_fat?: number;
          macro_training_protein?: number;
          phase_started_at?: string;
          training_days?: number[];
          updated_at?: string;
          user_id?: string;
        };
      };
      user_supplements: {
        Row: {
          active: boolean;
          created_at: string;
          custom_dosage: string | null;
          custom_timing: string | null;
          id: string;
          notes: string | null;
          supplement_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          custom_dosage?: string | null;
          custom_timing?: string | null;
          id?: string;
          notes?: string | null;
          supplement_id: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          custom_dosage?: string | null;
          custom_timing?: string | null;
          id?: string;
          notes?: string | null;
          supplement_id?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
    };
  };
};

export type TableName = keyof Database["public"]["Tables"];

export type TableRow<T extends TableName> = Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends TableName> = Database["public"]["Tables"][T]["Insert"];
export type TableUpdate<T extends TableName> = Database["public"]["Tables"][T]["Update"];
