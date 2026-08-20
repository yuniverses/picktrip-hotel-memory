import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FirebaseOptions } from "firebase/app";

const PICKTRIP_FIREBASE_DEFAULT: FirebaseOptions = {
  apiKey: "AIzaSyCnfXet81j4Iqw0tLjahoIE_xekOHprwos",
  authDomain: "picktrip-com.firebaseapp.com",
  projectId: "picktrip-com",
  storageBucket: "picktrip-com.firebasestorage.app",
  messagingSenderId: "272727908991",
  appId: "1:272727908991:ios:367befabb2bd0a0fbc554a",
};

let cachedConfig: FirebaseOptions | null = null;

export async function resolveFirebaseConfig(): Promise<FirebaseOptions> {
  if (cachedConfig) return cachedConfig;

  cachedConfig =
    firebaseConfigFromEnv() ?? (await firebaseConfigFromIosPlist()) ?? PICKTRIP_FIREBASE_DEFAULT;
  return cachedConfig;
}

function firebaseConfigFromEnv(): FirebaseOptions | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const authDomain =
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ??
    (projectId ? `${projectId}.firebaseapp.com` : undefined);
  if (!apiKey || !projectId || !authDomain) return null;

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

async function firebaseConfigFromIosPlist(): Promise<FirebaseOptions | null> {
  const plistPath =
    process.env.PICKTRIP_IOS_GOOGLE_PLIST_PATH ??
    path.resolve(process.cwd(), "../App-iOS/PickTrip/GoogleService-Info.plist");
  const plist = await readFile(plistPath, "utf8").catch(() => "");
  if (!plist) return null;

  const apiKey = plistString(plist, "API_KEY");
  const projectId = plistString(plist, "PROJECT_ID");
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: `${projectId}.firebaseapp.com`,
    projectId,
    storageBucket: plistString(plist, "STORAGE_BUCKET"),
    messagingSenderId: plistString(plist, "GCM_SENDER_ID"),
    appId: plistString(plist, "GOOGLE_APP_ID"),
  };
}

function plistString(plist: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return plist
    .match(new RegExp(`<key>${escapedKey}</key>\\s*<string>([^<]*)</string>`))?.[1]
    ?.trim();
}
