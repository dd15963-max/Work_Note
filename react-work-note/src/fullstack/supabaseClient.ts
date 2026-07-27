import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fullstackConfig, hasSupabaseConfig } from "./config";

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!hasSupabaseConfig) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }
  if (!client) {
    client = createClient(fullstackConfig.supabaseUrl, fullstackConfig.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "work-note-supabase-auth"
      }
    });
  }
  return client;
}
