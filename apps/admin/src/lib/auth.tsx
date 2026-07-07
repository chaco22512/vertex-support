import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@vertex/shared';
import { supabase } from './supabase';
import { ApiError, api } from './api';

export interface StaffProfile {
  userId: string;
  name: string;
  role: Role;
  isActive: boolean;
}

interface AuthState {
  session: Session | null;
  staff: StaffProfile | null;
  /** Non-null when the post-login role check failed (network/CORS/not-staff). */
  staffError: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  /** Re-run the role check for the current session (retry after an error). */
  refresh: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

type StaffResult = { staff: StaffProfile | null; error: string | null };

/**
 * Resolve the signed-in staff profile via the Workers API (§7 roles). Going
 * through the API (not a browser RLS read) means CORS/network failures surface
 * as a real error instead of a silent null that strands the user on a spinner.
 */
async function loadStaff(): Promise<StaffResult> {
  try {
    const { staff } = await api.me();
    return { staff, error: null };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      return { staff: null, error: 'Your account is not an active staff member. Contact an administrator.' };
    }
    // Network error / CORS rejection / server down.
    return {
      staff: null,
      error: "Signed in, but we couldn't reach the support server. Check your connection and try again.",
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let active = true;
    async function apply(next: Session | null) {
      if (!active) return;
      setSession(next);
      if (!next) {
        setStaff(null);
        setStaffError(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      const { staff, error } = await loadStaff();
      if (!active) return;
      setStaff(staff);
      setStaffError(error);
      setLoading(false);
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => void apply(next));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [nonce]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<{ error: string | null }> => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error ? 'Sign-in failed. Check your email and password.' : null };
    },
    [],
  );

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return (
    <AuthContext.Provider value={{ session, staff, staffError, loading, signIn, signOut, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
