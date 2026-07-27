export type FullstackConfig = {
  enabled: boolean;
  supabaseUrl: string;
  supabasePublishableKey: string;
  allowedEmail: string;
  storageBucket: string;
};

const bool = (value: string | undefined, fallback: boolean) => {
  if (value == null || value === "") return fallback;
  return value.toLowerCase() === "true";
};

export const fullstackConfig: FullstackConfig = {
  enabled: bool(import.meta.env.VITE_FULLSTACK_ENABLED, true),
  supabaseUrl: String(import.meta.env.VITE_SUPABASE_URL || "").trim(),
  supabasePublishableKey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
  allowedEmail: String(import.meta.env.VITE_ALLOWED_EMAIL || "").trim().toLowerCase(),
  storageBucket: String(import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || "work-note-attachments").trim()
};

export const hasSupabaseConfig = Boolean(
  fullstackConfig.enabled
  && fullstackConfig.supabaseUrl
  && fullstackConfig.supabasePublishableKey
);
