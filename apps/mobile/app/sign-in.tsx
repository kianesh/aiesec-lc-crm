import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Field, Txt } from "../src/components/ui";
import { ApiError, apiFetch } from "../src/lib/api";
import { takeAuthNotice, setAuthNotice } from "../src/lib/auth-notice";
import { supabase } from "../src/lib/supabase";
import { space, useTheme } from "../src/theme";

// Dismisses the auth browser tab if one was left open by a previous attempt.
WebBrowser.maybeCompleteAuthSession();

const NO_MEMBERSHIP =
  "That account isn't a member of any LC. Ask your LC to invite you, then sign in on the web once.";

type Step = "email" | "code";

// Mobile signs in with an emailed 6-digit code rather than the web app's magic
// link: a link tapped in a mail client opens the browser, not the app, and
// getting it back here would need universal links + a custom dev build. The
// code path works today in Expo Go and lands on the same Supabase user.
export default function SignInScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Seeded from the notice a rejected Google sign-in left behind, since that
  // rejection unmounted the previous instance of this screen.
  const [error, setError] = useState<string | null>(takeAuthNotice);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      // Existing members only — new accounts are created through the web
      // onboarding flow, which also builds the LC and profile rows.
      options: { shouldCreateUser: false }
    });
    setBusy(false);

    if (otpError) {
      setError(
        /signups not allowed|not found/i.test(otpError.message)
          ? "No account for that email. Ask your LC to invite you, then sign in on the web once."
          : otpError.message
      );
      return;
    }
    setStep("code");
  }

  async function verifyCode() {
    const trimmed = code.trim();
    if (trimmed.length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmed,
      type: "email"
    });
    setBusy(false);

    // The auth listener in SessionProvider handles the redirect on success.
    if (verifyError) setError("That code didn't work. Check it, or request a new one.");
  }

  // Supabase creates a user for any Google account that signs in, which would
  // otherwise sidestep the `shouldCreateUser: false` rule the email path
  // enforces. A member-less account gets 403 from /me — and because that isn't
  // an "unauthorized" error, nothing would sign them back out — so check for a
  // membership here and undo the sign-in when there isn't one.
  async function signInWithGoogle() {
    setBusy(true);
    setError(null);

    const redirectTo = Linking.createURL("auth/callback");
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Open the URL ourselves, in an in-app auth session that can hand the
      // redirect back rather than stranding the user in Safari.
      options: { redirectTo, skipBrowserRedirect: true }
    });

    if (oauthError || !data?.url) {
      setBusy(false);
      setError(oauthError?.message ?? "Couldn't start Google sign-in.");
      return;
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== "success") {
      // Cancelled or dismissed: the user did that on purpose, so stay quiet.
      setBusy(false);
      return;
    }

    const returnedCode = new URL(result.url).searchParams.get("code");
    if (!returnedCode) {
      setBusy(false);
      setError("Google didn't return a sign-in code. Try again.");
      return;
    }

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(returnedCode);
    if (exchangeError) {
      setBusy(false);
      setError(exchangeError.message);
      return;
    }

    try {
      await apiFetch("/me");
    } catch (meError) {
      // Set the notice before signing out: signing out remounts this screen,
      // and the fresh instance reads the notice as its initial error.
      setAuthNotice(
        meError instanceof ApiError && meError.code === "forbidden"
          ? NO_MEMBERSHIP
          : "Couldn't load your account. Try again."
      );
      await supabase.auth.signOut();
      return;
    }

    setBusy(false);
    // The auth listener in SessionProvider handles the redirect on success.
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.surfaceMuted }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: space.xl,
          paddingTop: insets.top + space.xxl,
          paddingBottom: insets.bottom + space.xl,
          gap: space.xl
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: space.md, alignItems: "flex-start" }}>
          <Image
            source={require("../assets/aiesec-human-blue.png")}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Txt variant="display">AIESEC CRM</Txt>
          <Txt variant="body" tone="muted">
            {step === "email"
              ? "Sign in with the email your LC invited you on."
              : `Enter the 6-digit code sent to ${email.trim().toLowerCase()}.`}
          </Txt>
        </View>

        <View style={{ gap: space.lg }}>
          {step === "email" ? (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError(null);
                }}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="emailAddress"
                placeholder="you@example.com"
                editable={!busy}
                error={error}
                onSubmitEditing={requestCode}
                returnKeyType="go"
              />
              <Button label="Email me a code" onPress={requestCode} loading={busy} icon="mail-outline" />

              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
                <Txt variant="caption" tone="subtle">
                  or
                </Txt>
                <View style={{ flex: 1, height: 1, backgroundColor: theme.border }} />
              </View>

              <Button
                label="Continue with Google"
                variant="secondary"
                icon="logo-google"
                onPress={signInWithGoogle}
                disabled={busy}
              />
            </>
          ) : (
            <>
              <Field
                label="Verification code"
                value={code}
                onChangeText={(value) => {
                  setCode(value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                placeholder="123456"
                editable={!busy}
                error={error}
                hint="The code expires after a few minutes."
                onSubmitEditing={verifyCode}
                returnKeyType="go"
              />
              <Button label="Sign in" onPress={verifyCode} loading={busy} />
              <Button
                label="Use a different email"
                variant="ghost"
                onPress={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
              />
            </>
          )}
        </View>

        <Txt variant="caption" tone="subtle">
          Creating a new Local Committee, managing integrations and editing permissions still happen on the web app.
        </Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
