"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  Clock,
  Loader2,
  Mail,
  Plus,
  Search,
  UserPlus,
  Users
} from "lucide-react";
import {
  createLc,
  requestToJoin,
  saveOnboardingProfile,
  searchLcs,
  sendOnboardingInvite,
  type LcSearchResult
} from "./actions";

type Path = null | "join" | "create";
type Screen = "profile" | "path" | "create" | "invite" | "join" | "requested";

const STEP_LABEL: Record<Exclude<Screen, "requested">, string> = {
  profile: "Your profile",
  path: "Join or create",
  create: "LC details",
  invite: "Invite your team",
  join: "Find your LC"
};

export function OnboardingWizard({
  initialProfile,
  siteUrl
}: {
  initialProfile: { fullName: string; title: string; phone: string };
  siteUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [screen, setScreen] = useState<Screen>("profile");
  const [path, setPath] = useState<Path>(null);

  // Profile
  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [title, setTitle] = useState(initialProfile.title);
  const [phone, setPhone] = useState(initialProfile.phone);

  // Create
  const [lc, setLc] = useState({ name: "", school: "", country: "", stateProvince: "", expaCommitteeId: "" });
  const [createdLcId, setCreatedLcId] = useState<string | null>(null);
  const [expaConnected, setExpaConnected] = useState(false);

  // Join
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LcSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestedLcName, setRequestedLcName] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invites
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin" | "owner">("member");
  const [invites, setInvites] = useState<{ email: string; role: string; token: string }[]>([]);

  // ------- progress -------
  const total = path === "create" ? 4 : path === "join" ? 3 : 4;
  const stepNumber =
    screen === "profile" ? 1 : screen === "path" ? 2 : screen === "create" || screen === "join" ? 3 : 4;
  const progress = screen === "requested" ? 100 : Math.round((stepNumber / total) * 100);

  const runSearch = useCallback((q: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchLcs(q)
        .then((r) => setResults(r))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
  }, []);

  function goProfileNext() {
    setError(null);
    startTransition(async () => {
      const res = await saveOnboardingProfile({ fullName, title, phone });
      if (!res.ok) return setError(res.error);
      setScreen("path");
    });
  }

  function choose(p: Path) {
    setError(null);
    setPath(p);
    setScreen(p === "join" ? "join" : "create");
  }

  function submitCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createLc(lc);
      if (!res.ok) return setError(res.error);
      setCreatedLcId(res.lcId);
      setExpaConnected(res.expaConnected);
      setScreen("invite");
    });
  }

  function submitRequest(lcId: string, name: string) {
    setError(null);
    startTransition(async () => {
      const res = await requestToJoin({ lcId });
      if (!res.ok) return setError(res.error);
      setRequestedLcName(name);
      setScreen("requested");
    });
  }

  function addInvite() {
    if (!createdLcId || !inviteEmail.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await sendOnboardingInvite({ lcId: createdLcId, email: inviteEmail.trim(), role: inviteRole });
      if (!res.ok) return setError(res.error);
      setInvites((prev) => [...prev, { email: res.email, role: inviteRole, token: res.token }]);
      setInviteEmail("");
    });
  }

  function finish() {
    startTransition(() => {
      router.push("/dashboard");
      router.refresh();
    });
  }

  const back = {
    path: () => setScreen("profile"),
    create: () => setScreen("path"),
    join: () => setScreen("path")
  };

  return (
    <div className="wizard">
      {screen !== "requested" && (
        <div className="wizard-progress" aria-label={`Step ${stepNumber} of ${total}`}>
          <div className="wizard-progress-head">
            <span className="eyebrow">
              Step {stepNumber} of {total}
            </span>
            <span className="wizard-progress-label">{STEP_LABEL[screen]}</span>
          </div>
          <div className="wizard-progress-track">
            <div className="wizard-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {error && <p className="book-error" role="alert">{error}</p>}

      {/* -------------------------------------------------- Profile -------- */}
      {screen === "profile" && (
        <div className="wizard-step">
          <h2>Welcome to AIESEC CRM</h2>
          <p className="wizard-sub">Let’s start with the basics so your team knows who you are.</p>
          <label className="book-field">
            <span>Full name *</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" autoComplete="name" />
          </label>
          <label className="book-field">
            <span>Role / title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="OGX Manager" />
          </label>
          <label className="book-field">
            <span>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" autoComplete="tel" />
          </label>
          <div className="wizard-actions">
            <span />
            <button className="button primary" onClick={goProfileNext} disabled={isPending || fullName.trim().length < 2}>
              {isPending ? <Loader2 size={15} className="spin" /> : <>Continue <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- Choose --------- */}
      {screen === "path" && (
        <div className="wizard-step">
          <h2>Join or create your LC</h2>
          <p className="wizard-sub">Connect to an existing Local Committee, or set up a new workspace.</p>
          <div className="wizard-choice-grid">
            <button className="wizard-choice" onClick={() => choose("join")}>
              <Users size={22} />
              <strong>Join an LC</strong>
              <span>Find your Local Committee and request access from an admin.</span>
            </button>
            <button className="wizard-choice" onClick={() => choose("create")}>
              <Building2 size={22} />
              <strong>Create an LC</strong>
              <span>Set up a new LC workspace — you’ll be the LCP.</span>
            </button>
          </div>
          <div className="wizard-actions">
            <button className="button ghost" onClick={back.path}>
              <ArrowLeft size={15} /> Back
            </button>
            <span />
          </div>
        </div>
      )}

      {/* -------------------------------------------------- Join ----------- */}
      {screen === "join" && (
        <div className="wizard-step">
          <h2>Find your LC</h2>
          <p className="wizard-sub">Search by LC name or LC ID. Ask your admin for the ID if you’re not sure.</p>
          <label className="book-field">
            <span>Search</span>
            <span className="wizard-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  runSearch(e.target.value);
                }}
                placeholder="AIESEC Western, or an LC ID"
                autoFocus
              />
            </span>
          </label>
          <div className="wizard-results">
            {searching && <p className="muted-note"><Loader2 size={13} className="spin" /> Searching…</p>}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="muted-note">No LCs found. Check the spelling or create a new LC instead.</p>
            )}
            {results.map((r) => (
              <div key={r.id} className="wizard-result">
                <div>
                  <strong>{r.name}</strong>
                  <small className="muted-note">
                    {[r.school, r.country].filter(Boolean).join(" · ")}
                    {r.lcIdentifier ? ` · ID ${r.lcIdentifier}` : ""}
                  </small>
                </div>
                <button className="button secondary" onClick={() => submitRequest(r.id, r.name)} disabled={isPending}>
                  Request to join
                </button>
              </div>
            ))}
          </div>
          <div className="wizard-actions">
            <button className="button ghost" onClick={back.join}>
              <ArrowLeft size={15} /> Back
            </button>
            <button className="button ghost" onClick={() => choose("create")}>
              Create a new LC instead
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- Requested ------ */}
      {screen === "requested" && (
        <div className="wizard-step wizard-centered">
          <span className="wizard-badge-icon"><Clock size={26} /></span>
          <h2>Request sent</h2>
          <p className="wizard-sub">
            Your request to join <strong>{requestedLcName}</strong> is pending approval from an admin. You’ll get access as
            soon as they approve it — feel free to check back later.
          </p>
          <button className="button primary" onClick={() => router.refresh()}>
            Refresh status
          </button>
        </div>
      )}

      {/* -------------------------------------------------- Create --------- */}
      {screen === "create" && (
        <div className="wizard-step">
          <h2>Create your LC</h2>
          <p className="wizard-sub">This scopes all your records and makes you the LCP owner.</p>
          <label className="book-field">
            <span>LC name *</span>
            <input value={lc.name} onChange={(e) => setLc({ ...lc, name: e.target.value })} placeholder="AIESEC Western" />
          </label>
          <label className="book-field">
            <span>School / University</span>
            <input value={lc.school} onChange={(e) => setLc({ ...lc, school: e.target.value })} placeholder="Western University" />
          </label>
          <div className="settings-row">
            <label className="book-field">
              <span>Country *</span>
              <input value={lc.country} onChange={(e) => setLc({ ...lc, country: e.target.value })} placeholder="Canada" />
            </label>
            <label className="book-field">
              <span>State / Province</span>
              <input value={lc.stateProvince} onChange={(e) => setLc({ ...lc, stateProvince: e.target.value })} placeholder="Optional" />
            </label>
          </div>
          <label className="book-field">
            <span>EXPA committee ID</span>
            <input value={lc.expaCommitteeId} onChange={(e) => setLc({ ...lc, expaCommitteeId: e.target.value })} placeholder="e.g. 1590" />
            <small className="muted-note">We’ll use this to auto-connect EXPA and pull your data. You can add it later too.</small>
          </label>
          <div className="wizard-actions">
            <button className="button ghost" onClick={back.create}>
              <ArrowLeft size={15} /> Back
            </button>
            <button
              className="button primary"
              onClick={submitCreate}
              disabled={isPending || lc.name.trim().length < 2 || lc.country.trim().length < 2}
            >
              {isPending ? <Loader2 size={15} className="spin" /> : <>Create workspace <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>
      )}

      {/* -------------------------------------------------- Invite --------- */}
      {screen === "invite" && (
        <div className="wizard-step">
          <span className="wizard-badge-icon success"><Check size={24} /></span>
          <h2>Workspace created</h2>
          <p className="wizard-sub">
            {expaConnected ? "EXPA is connected. " : ""}Invite your team now, or skip and do it later from Settings.
          </p>
          <div className="wizard-invite-row">
            <span className="wizard-search">
              <Mail size={15} />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="teammate@aiesec.org"
                type="email"
              />
            </span>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <button className="button secondary" onClick={addInvite} disabled={isPending || !inviteEmail.trim()}>
              <Plus size={15} /> Invite
            </button>
          </div>
          {invites.length > 0 && (
            <ul className="wizard-invite-list">
              {invites.map((i, idx) => (
                <li key={idx}>
                  <UserPlus size={14} />
                  <span>{i.email}</span>
                  <small className="muted-note">{i.role}</small>
                  <a href={`${siteUrl}/invite/${i.token}`} target="_blank" rel="noreferrer" className="muted-note">invite link</a>
                </li>
              ))}
            </ul>
          )}
          <div className="wizard-actions">
            <span />
            <button className="button primary" onClick={finish} disabled={isPending}>
              {invites.length > 0 ? "Go to dashboard" : "Skip for now"} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
