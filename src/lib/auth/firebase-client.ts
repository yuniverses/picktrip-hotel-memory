import type { FirebaseOptions } from "firebase/app";

async function loadFirebaseAuth() {
  const response = await fetch("/api/firebase-config", { cache: "no-store" });
  const payload = (await response.json()) as {
    enabled: boolean;
    config?: FirebaseOptions;
    error?: string;
  };
  if (!response.ok || !payload.enabled || !payload.config) {
    throw new Error(payload.error ?? "Firebase web sign-in is not configured.");
  }
  const [{ getApps, initializeApp }, authModule] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
  ]);
  const app = getApps()[0] ?? initializeApp(payload.config);
  return { auth: authModule.getAuth(app), authModule };
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, authModule } = await loadFirebaseAuth();
  const provider = new authModule.GoogleAuthProvider();
  provider.addScope("email");
  const credential = await authModule.signInWithPopup(auth, provider);
  const firebaseIdToken = await credential.user.getIdToken(true);
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firebaseIdToken }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error ?? "PickTrip sign-in failed.");
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth", { method: "DELETE" });
  try {
    const { auth, authModule } = await loadFirebaseAuth();
    await authModule.signOut(auth);
  } catch {
    // The httpOnly Picktrip session was already removed.
  }
}
