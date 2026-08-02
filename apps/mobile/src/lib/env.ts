import Constants from "expo-constants";

// EXPO_PUBLIC_* variables are inlined at build time. They are readable by
// anyone with the .ipa/.apk, so only ever put the Supabase *anon* key and the
// public API origin here — never a service-role key.
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Copy apps/mobile/.env.example to apps/mobile/.env and fill it in, then restart the dev server with \`npx expo start -c\`.`
    );
  }
  return value.trim().replace(/\/$/, "");
}

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const env = {
  supabaseUrl: required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL ?? extra.supabaseUrl
  ),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extra.supabaseAnonKey
  ),
  /**
   * Origin of the Next.js app that serves /api/mobile/v1.
   * On a simulator this is your machine's LAN IP, not localhost — the phone
   * resolves localhost to itself.
   */
  apiUrl: required("EXPO_PUBLIC_API_URL", process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl),
  /** Web app origin, for the "open on the web" links. */
  webUrl: (process.env.EXPO_PUBLIC_WEB_URL ?? process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/$/, "")
};
