// ── Supabase Client ──────────────────────────────────────────────────────────
// Optional auth for Academy/Feed. Uses db.settings for session persistence.

import { createClient } from "@supabase/supabase-js";
import type { Session, User } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants";
import { db } from "./tauri";

// Custom storage adapter — persists Supabase session in SQLite via Tauri
// Sentinel value — getItem returns null when it sees this
const REMOVED = "__removed__";

const storageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await db.settings.get(`supabase_${key}`);
      if (!value || value === REMOVED) return null;
      return value;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await db.settings.set(`supabase_${key}`, value);
    } catch {
      // Silently fail — auth is optional
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await db.settings.set(`supabase_${key}`, REMOVED);
    } catch {
      // Silently fail
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: storageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // We handle deep links manually
  },
});

export async function getSession(): Promise<{ session: Session | null; user: User | null }> {
  const { data } = await supabase.auth.getSession();
  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}

export function signInWithEmail(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signInWithOAuth(provider: "github" | "google") {
  // Generate OAuth URL — user opens it in external browser
  // Supabase PKCE flow handles state/verifier internally
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      skipBrowserRedirect: true,
      redirectTo: "https://kodiq.ai/auth/desktop-callback",
      queryParams: {
        // Force PKCE flow — prevents auth code interception
        flow_type: "pkce",
      },
    },
  });
  return { url: data?.url ?? null, error };
}

export function signOut() {
  return supabase.auth.signOut();
}

export type { Session, User };
