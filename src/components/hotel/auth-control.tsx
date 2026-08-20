"use client";

import { LogOut, UserRoundPlus } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { signInWithGoogle, signOut } from "@/src/lib/auth/firebase-client";

export type SessionUser = { uid: string; name: string | null; imageUrl: string | null };

export function usePicktripSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/session", { cache: "no-store" }).catch(() => null);
    const payload = await response?.json().catch(() => null);
    setUser(response?.ok && payload?.authenticated ? payload.user : null);
    setLoading(false);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { user, loading, refresh };
}

export function AuthControl({
  user,
  loading,
  onChanged,
}: {
  user: SessionUser | null;
  loading: boolean;
  onChanged: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setPending(true);
    setError(null);
    try {
      if (user) await signOut();
      else await signInWithGoogle();
      await onChanged();
    } catch {
      setError("Sign-in failed. Please try again.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="auth-wrap">
      <button
        className="auth-pill"
        type="button"
        onClick={toggle}
        disabled={loading || pending}
        aria-label={user ? `Sign out ${user.name ?? "PickTrip"}` : "Sign in to PickTrip"}
      >
        {user ? <LogOut size={21} /> : <UserRoundPlus size={23} />}
        {user?.imageUrl ? (
          <Image
            className="avatar"
            src={user.imageUrl}
            alt=""
            width={52}
            height={52}
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="avatar avatar-fallback">{user?.name?.slice(0, 1) ?? "P"}</span>
        )}
        <span className="auth-label">
          {pending ? "Working…" : user ? (user.name ?? "Signed in") : "Sign in"}
        </span>
      </button>
      {error ? <span className="auth-error">{error}</span> : null}
    </div>
  );
}
