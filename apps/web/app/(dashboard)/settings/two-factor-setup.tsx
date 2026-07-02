"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Smartphone, Trash2 } from "lucide-react";
import { createClient } from "../../../lib/supabase/client";

type PhoneFactor = { id: string; phone?: string; status: string };
type Step = "loading" | "list" | "enterPhone" | "enterCode";

// E.164-ish: leading + and 8–15 digits.
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export function TwoFactorSetup() {
  const supabase = createClient();
  const [step, setStep] = useState<Step>("loading");
  const [factors, setFactors] = useState<PhoneFactor[]>([]);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      setError(error.message);
      setStep("list");
      return;
    }
    const phoneFactors = (data?.phone ?? []) as PhoneFactor[];
    setFactors(phoneFactors.filter((f) => f.status === "verified"));
    setStep("list");
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!PHONE_RE.test(phone)) {
      setError("Enter your number in international format, e.g. +14165551234.");
      return;
    }
    setBusy(true);
    try {
      const enroll = await supabase.auth.mfa.enroll({ factorType: "phone", phone });
      if (enroll.error) throw enroll.error;
      const id = enroll.data.id;
      setFactorId(id);
      const challenge = await supabase.auth.mfa.challenge({ factorId: id });
      if (challenge.error) throw challenge.error;
      setChallengeId(challenge.data.id);
      setStep("enterCode");
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!factorId || !challengeId) return;
    setBusy(true);
    try {
      const verify = await supabase.auth.mfa.verify({ factorId, challengeId, code: code.trim() });
      if (verify.error) throw verify.error;
      setPhone("");
      setCode("");
      setFactorId(null);
      setChallengeId(null);
      await refresh();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!factorId) return;
    setError(null);
    setBusy(true);
    try {
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) throw challenge.error;
      setChallengeId(challenge.data.id);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this phone from 2-step verification?")) return;
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      await refresh();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setError(null);
    setPhone("");
    setCode("");
    setFactorId(null);
    setChallengeId(null);
    setStep("list");
  }

  if (step === "loading") return <p className="muted-note">Loading security settings…</p>;

  return (
    <div className="twofa">
      {error && (
        <p className="form-error">
          <ShieldAlert size={14} /> {error}
        </p>
      )}

      {step === "list" && (
        <>
          {factors.length > 0 ? (
            <ul className="twofa-factors">
              {factors.map((f) => (
                <li key={f.id}>
                  <span className="twofa-factor-info">
                    <ShieldCheck size={16} className="twofa-ok" />
                    <span>
                      <strong>2-step verification on</strong>
                      <small>{f.phone ?? "Phone"}</small>
                    </span>
                  </span>
                  <button type="button" className="button ghost danger" onClick={() => remove(f.id)} disabled={busy}>
                    <Trash2 size={14} /> Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-note">
              Add your phone to require an SMS code at sign-in. This protects your workspace if your email is
              compromised.
            </p>
          )}
          {factors.length === 0 && (
            <button type="button" className="button primary" onClick={() => setStep("enterPhone")}>
              <Smartphone size={14} /> Add a phone number
            </button>
          )}
        </>
      )}

      {step === "enterPhone" && (
        <form onSubmit={startEnroll} className="twofa-form">
          <label>
            Phone number
            <input
              name="phone"
              type="tel"
              placeholder="+14165551234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              required
            />
          </label>
          <p className="muted-note">We’ll text you a 6-digit code to confirm.</p>
          <div className="twofa-actions">
            <button type="button" className="button ghost" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </div>
        </form>
      )}

      {step === "enterCode" && (
        <form onSubmit={verifyCode} className="twofa-form">
          <label>
            Verification code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          <p className="muted-note">
            Sent to {phone}.{" "}
            <button type="button" className="twofa-link" onClick={resend} disabled={busy}>
              Resend code
            </button>
          </p>
          <div className="twofa-actions">
            <button type="button" className="button ghost" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? "Verifying…" : "Verify & enable"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function messageFor(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not enabled|unsupported phone|provider/i.test(msg)) {
    return "Phone 2-step verification isn’t enabled on the server yet. An admin must configure an SMS provider in Supabase.";
  }
  if (/invalid.*code|expired/i.test(msg)) return "That code is invalid or expired. Try resending.";
  if (/already exists/i.test(msg)) return "A phone factor is already being set up. Remove it and try again.";
  return msg;
}
