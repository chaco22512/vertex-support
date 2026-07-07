import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Role } from '@vertex/shared';
import { supabase } from './supabase';

export interface StaffProfile {
  userId: string;
  name: string;
  role: Role;
  isActive: boolean;
}

interface AuthState {
  session: Session | null;
  staff: StaffProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Load the staff profile for the signed-in user (role gates admin-only screens). */
async function loadStaff(userId: string): Promise<StaffProfile | null> {
  const { data } = await supabase
    .from('staff')
    .select('id,name,role,is_active')
    .eq('id', userId)
    .maybeSingle();
  if (!data) return null;
  return { userId: data.id, name: data.name, role: data.role, isActive: data.is_active };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function apply(next: Session | null) {
      if (!active) return;
      setSession(next);
      setStaff(next ? await loadStaff(next.user.id) : null);
      setLoading(false);
    }
    void supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, next) => void apply(next));
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? 'Sign-in failed. Check your email and password.' : null };
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, staff, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
