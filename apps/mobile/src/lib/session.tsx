import type { Capability, MeResponse, MembershipDto } from "@aiesec/api-contract";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, apiFetch } from "./api";
import { supabase } from "./supabase";

type SessionContextValue = {
  /** null once the Supabase session has been checked and there isn't one. */
  session: Session | null;
  /** True until the persisted session has been read from the keychain. */
  initializing: boolean;
  me: MeResponse | null;
  meLoading: boolean;
  meError: ApiError | null;
  activeLcId: string | null;
  setActiveLcId: (lcId: string) => void;
  memberships: MembershipDto[];
  can: (capability: Capability) => boolean;
  signOut: () => Promise<void>;
  refetchMe: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [activeLcId, setActiveLcIdState] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Never let one account see another's cached rows.
      if (!next) {
        setActiveLcIdState(null);
        queryClient.clear();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const meQuery = useQuery({
    queryKey: ["me", session?.user.id ?? null, activeLcId],
    enabled: Boolean(session),
    queryFn: () => apiFetch<MeResponse>("/me", { lcId: activeLcId }),
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => !(error instanceof ApiError && error.isAuthError) && failureCount < 2
  });

  const me = meQuery.data ?? null;

  // Adopt the server's choice on first load so `activeLcId` is always a real
  // membership, even after the LC list changes underneath us.
  useEffect(() => {
    if (me && !activeLcId) setActiveLcIdState(me.activeMembership.lcId);
  }, [me, activeLcId]);

  const setActiveLcId = useCallback(
    (lcId: string) => {
      setActiveLcIdState(lcId);
      // Everything below /me is LC-scoped; drop it rather than show stale data
      // from the previous workspace.
      queryClient.removeQueries({ queryKey: ["dashboard"] });
      queryClient.removeQueries({ queryKey: ["contacts"] });
      queryClient.removeQueries({ queryKey: ["conversations"] });
    },
    [queryClient]
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(() => {
    const capabilities = new Set(me?.capabilities ?? []);
    return {
      session,
      initializing,
      me,
      meLoading: meQuery.isPending,
      meError: meQuery.error instanceof ApiError ? meQuery.error : null,
      activeLcId: activeLcId ?? me?.activeMembership.lcId ?? null,
      setActiveLcId,
      memberships: me?.memberships ?? [],
      can: (capability: Capability) => capabilities.has(capability),
      signOut,
      refetchMe: () => void meQuery.refetch()
    };
  }, [session, initializing, me, meQuery, activeLcId, setActiveLcId, signOut]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}
