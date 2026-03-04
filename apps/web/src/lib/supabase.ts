import { createClient } from "@supabase/supabase-js";

const SESSION_KEY = "gp_keep_session";
const authStorage = {
  getItem(key: string) {
    return window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
  },
  setItem(key: string, value: string) {
    const persist = window.localStorage.getItem(SESSION_KEY) !== "0";
    if (persist) {
      window.sessionStorage.removeItem(key);
      window.localStorage.setItem(key, value);
      return;
    }
    window.localStorage.removeItem(key);
    window.sessionStorage.setItem(key, value);
  },
  removeItem(key: string) {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  }
};

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);
