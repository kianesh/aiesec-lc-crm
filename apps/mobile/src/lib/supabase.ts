import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import "react-native-url-polyfill/auto";
import { env } from "./env";

// SecureStore refuses values over ~2 KB, and a Supabase session (access token +
// refresh token + user metadata) routinely exceeds that. Store the value in
// numbered chunks with a small index record so it round-trips intact.
const CHUNK_SIZE = 1800;

function chunkKey(key: string, index: number) {
  return `${key}.${index}`;
}

const secureStorage: SupportedStorage = {
  async getItem(key) {
    const countRaw = await SecureStore.getItemAsync(key);
    if (countRaw === null) return null;
    const count = Number.parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 1) return null;

    const parts: string[] = [];
    for (let index = 0; index < count; index += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, index));
      // A partially-written session is unusable; treat it as signed out rather
      // than handing supabase-js a truncated JSON string.
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },

  async setItem(key, value) {
    await secureStorage.removeItem(key);
    const chunks: string[] = [];
    for (let offset = 0; offset < value.length; offset += CHUNK_SIZE) {
      chunks.push(value.slice(offset, offset + CHUNK_SIZE));
    }
    for (let index = 0; index < chunks.length; index += 1) {
      await SecureStore.setItemAsync(chunkKey(key, index), chunks[index]!);
    }
    await SecureStore.setItemAsync(key, String(chunks.length));
  },

  async removeItem(key) {
    const countRaw = await SecureStore.getItemAsync(key);
    const count = countRaw ? Number.parseInt(countRaw, 10) : 0;
    if (Number.isFinite(count)) {
      for (let index = 0; index < count; index += 1) {
        await SecureStore.deleteItemAsync(chunkKey(key, index));
      }
    }
    await SecureStore.deleteItemAsync(key);
  }
};

export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    // Keychain (iOS) / EncryptedSharedPreferences (Android). On Expo web there
    // is no SecureStore, so fall back to supabase-js's own localStorage default.
    storage: Platform.OS === "web" ? undefined : secureStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Google sign-in returns a `code` that the sign-in screen exchanges by
    // hand, so the verifier has to be generated and stored on this side.
    flowType: "pkce",
    // No URL to parse: the OS hands the OAuth redirect back to us through
    // WebBrowser, and the email path is an OTP code rather than a magic link.
    detectSessionInUrl: false
  }
});
