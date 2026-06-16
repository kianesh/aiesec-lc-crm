import { useState, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const EXPA_ENDPOINT = "/v2";

const STAGES = [
  { key: "open",      label: "Open",      short: "OP",  color: "#4f8ef7" },
  { key: "applied",   label: "Applied",   short: "AP",  color: "#7b6cf7" },
  { key: "accepted",  label: "Accepted",  short: "AN",  color: "#00bcd4" },
  { key: "approved",  label: "Approved",  short: "APP", color: "#f7941d" },
  { key: "realized",  label: "Realized",  short: "RE",  color: "#39b54a" },
  { key: "completed", label: "Completed", short: "CO",  color: "#2e7d32" },
  { key: "finished",  label: "Finished",  short: "FI",  color: "#1a5e20" },
];

const PROGRAMS = ["iGV", "oGV", "iGTa", "iGTe", "oGTa", "oGTe", "All"];

function normalizeToken(token) {
  return token.trim().replace(/^Bearer\s+/i, "");
}

function addParam(params, key, value) {
  if (value !== undefined && value !== null && value !== "") {
    params.append(key, value);
  }
}

async function expaGet(token, path, params = {}) {
  const search = new URLSearchParams({ access_token: normalizeToken(token) });
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => addParam(search, key, item));
    else addParam(search, key, value);
  });

  const res = await fetch(`${EXPA_ENDPOINT}${path}?${search.toString()}`);
  let json = null;
  try {
    json = await res.json();
  } catch {
    // Some API failures return an empty body.
  }
  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
}

function extractApplicationBucket(payload) {
  const data = payload?.data || payload?.applications || payload?.opportunity_applications || payload;
  return {
    data: Array.isArray(data) ? data : [],
    paging: payload?.paging || payload?.meta?.paging || payload?.meta || {},
  };
}

function appStatus(app) {
  return app.current_status || app.status || app.status_name || app.process_status || "";
}

function appProgramme(app) {
  const programme = app.opportunity?.programme || app.opportunity?.program || app.programme || app.program;
  return programme?.short_name || programme?.shortName || programme?.name || "";
}

function appCreatedAt(app) {
  return app.created_at || app.createdAt || app.applied_at || app.appliedAt;
}

function countByStage(apps) {
  const counts = {};
  STAGES.forEach(s => counts[s.key] = 0);
  apps.forEach(app => {
    const raw = appStatus(app).toLowerCase();
    const match = STAGES.find(s =>
      raw === s.key || raw === s.short.toLowerCase() || raw.includes(s.short.toLowerCase())
    );
    if (match) counts[match.key] = (counts[match.key] || 0) + 1;
    else counts["open"] = (counts["open"] || 0) + 1;
  });
  return counts;
}

function convRate(a, b) {
  if (!a || !b) return "—";
  return Math.round((b / a) * 100) + "%";
}

// ── Token help modal ──────────────────────────────────────────────
function TokenHelp({ onClose }) {
  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex",
      alignItems:"center", justifyContent:"center", zIndex:100
    }}>
      <div style={{
        background:"#0d1b2a", border:"1px solid #1e3a5f", borderRadius:16,
        padding:"32px 36px", maxWidth:480, width:"90%", color:"#c9d6e3"
      }}>
        <h3 style={{color:"#4f8ef7", marginTop:0, fontFamily:"'DM Mono', monospace"}}>
          How to get your EXPA token
        </h3>
        <ol style={{lineHeight:2, paddingLeft:20}}>
          <li>Open <b>expa.aiesec.org</b> and log in</li>
          <li>Open DevTools → <b>Network</b> tab (F12)</li>
          <li>Reload the page or click anything</li>
          <li>Find any <b>graphql</b> request</li>
          <li>Click it → <b>Headers</b> → copy the <code style={{background:"#12263f", padding:"1px 6px", borderRadius:4}}>Authorization</code> value</li>
        </ol>
        <p style={{fontSize:12, color:"#607d8b"}}>
          Tokens expire after ~24h. You can also get it from localStorage key <code>access_token</code> in the browser console.
        </p>
        <button onClick={onClose} style={{
          marginTop:8, padding:"10px 28px", background:"#4f8ef7",
          border:"none", borderRadius:8, color:"#fff", cursor:"pointer",
          fontWeight:600, fontSize:14
        }}>Got it</button>
      </div>
    </div>
  );
}

// ── Funnel SVG ────────────────────────────────────────────────────
function FunnelViz({ stageCounts, total }) {
  const maxCount = Math.max(...STAGES.map(s => stageCounts[s.key] || 0), 1);
  const barW = 520;

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${barW + 160} ${STAGES.length * 52 + 20}`}
        style={{ width: "100%", maxWidth: barW + 160, display: "block", margin: "0 auto" }}>
        {STAGES.map((stage, i) => {
          const count = stageCounts[stage.key] || 0;
          const w = total ? Math.max((count / maxCount) * barW, count ? 24 : 0) : 0;
          const y = i * 52 + 10;
          const prevCount = i > 0 ? (stageCounts[STAGES[i - 1].key] || 0) : count;
          const rate = i > 0 ? convRate(prevCount, count) : "—";
          return (
            <g key={stage.key}>
              {/* label left */}
              <text x={70} y={y + 20} textAnchor="end" fill="#607d8b"
                fontSize={11} fontFamily="'DM Mono', monospace">{stage.short}</text>
              <text x={70} y={y + 34} textAnchor="end" fill="#c9d6e3"
                fontSize={12} fontFamily="sans-serif">{stage.label}</text>

              {/* bar */}
              <rect x={80} y={y} width={w} height={40} rx={6}
                fill={stage.color} opacity={0.85} />

              {/* count */}
              <text x={80 + w + 8} y={y + 25} fill={stage.color}
                fontSize={15} fontWeight="700" fontFamily="'DM Mono', monospace">{count}</text>

              {/* conversion badge */}
              {i > 0 && (
                <text x={barW + 130} y={y + 25} textAnchor="end"
                  fill={count && prevCount ? "#4f8ef7" : "#37474f"}
                  fontSize={11} fontFamily="'DM Mono', monospace">{rate}</text>
              )}
            </g>
          );
        })}
        {/* header */}
        <text x={barW + 130} y={6} textAnchor="end" fill="#37474f"
          fontSize={10} fontFamily="sans-serif">conv.</text>
      </svg>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────
function Stat({ label, value, sub, color }) {
  return (
    <div style={{
      background:"#0d1b2a", border:`1px solid ${color}33`,
      borderRadius:12, padding:"18px 22px", flex:"1 1 140px"
    }}>
      <div style={{fontSize:11, color:"#607d8b", textTransform:"uppercase",
        letterSpacing:1, fontFamily:"'DM Mono', monospace", marginBottom:6}}>{label}</div>
      <div style={{fontSize:28, fontWeight:700, color, fontFamily:"'DM Mono', monospace"}}>{value}</div>
      {sub && <div style={{fontSize:11, color:"#455a64", marginTop:4}}>{sub}</div>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────
export default function App() {
  const [token,      setToken]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [showHelp,   setShowHelp]   = useState(false);
  const [user,       setUser]       = useState(null);
  const [allApps,    setAllApps]    = useState([]);
  const [program,    setProgram]    = useState("All");
  const [page,       setPage]       = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [fetching,   setFetching]   = useState(false);

  const load = useCallback(async () => {
    if (!token.trim()) { setError("Please paste your EXPA token."); return; }
    setLoading(true); setError("");
    try {
      setUser({ full_name: "EXPA User" });
      // fetch all pages
      const collected = [];
      let pg = 1, total = 1;
      while (pg <= total && pg <= 20) {
        const bucket = extractApplicationBucket(await expaGet(token, "/applications", {
          page: pg,
          per_page: 100,
        }));
        collected.push(...(bucket?.data || []));
        total = bucket?.paging?.total_pages || 1;
        setTotalPages(total);
        setPage(pg);
        pg++;
      }
      setAllApps(collected);
    } catch (e) {
      setError("Could not connect to EXPA: " + e.message +
        ". Check that your access token is current and has application read permissions.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // filter by program
  const apps = program === "All"
    ? allApps
    : allApps.filter(a =>
        appProgramme(a).toLowerCase().includes(program.toLowerCase())
      );

  const stageCounts = countByStage(apps);
  const total = apps.length;

  // bar chart data (weekly trend by created_at — bucketed)
  const weekMap = {};
  apps.forEach(a => {
    const createdAt = appCreatedAt(a);
    if (!createdAt) return;
    const d = new Date(createdAt);
    const wk = `${d.getFullYear()}-W${Math.ceil(d.getDate()/7)}`;
    weekMap[wk] = (weekMap[wk] || 0) + 1;
  });
  const trendData = Object.entries(weekMap).sort(([a],[b]) => a.localeCompare(b))
    .slice(-12).map(([wk, count]) => ({ wk, count }));

  const realized   = stageCounts["realized"]  || 0;
  const accepted   = stageCounts["accepted"]  || 0;
  const approved   = stageCounts["approved"]  || 0;
  const applied    = stageCounts["applied"]   || 0;

  const isLoggedIn = !!user;

  // ── Login screen ─────────────────────────────────────────────────
  if (!isLoggedIn) return (
    <div style={{
      minHeight:"100vh", background:"#060d18",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"system-ui, sans-serif", padding:24
    }}>
      {showHelp && <TokenHelp onClose={() => setShowHelp(false)} />}
      <div style={{width:"100%", maxWidth:480}}>
        {/* logo */}
        <div style={{ textAlign:"center", marginBottom:40 }}>
          <div style={{
            display:"inline-block", padding:"10px 24px",
            background:"linear-gradient(135deg,#037ef3,#4f8ef7)",
            borderRadius:12, marginBottom:16
          }}>
            <span style={{color:"#fff", fontWeight:900, fontSize:20, letterSpacing:2}}>
              AIESEC
            </span>
          </div>
          <h1 style={{color:"#e8f0fe", margin:"0 0 6px", fontSize:22, fontWeight:700}}>
            EXPA Pipeline Analytics
          </h1>
          <p style={{color:"#455a64", margin:0, fontSize:13}}>
            Funnel + outreach insights for your LC
          </p>
        </div>

        {/* token input */}
        <div style={{
          background:"#0d1b2a", border:"1px solid #1e3a5f",
          borderRadius:16, padding:"28px 28px 24px"
        }}>
          <label style={{display:"block", color:"#607d8b", fontSize:12,
            fontFamily:"'DM Mono',monospace", letterSpacing:1,
            textTransform:"uppercase", marginBottom:8}}>
            EXPA Access Token
          </label>
          <textarea
            rows={3}
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="Paste your Authorization token from EXPA..."
            style={{
              width:"100%", background:"#060d18", border:"1px solid #1e3a5f",
              borderRadius:8, padding:"12px 14px", color:"#c9d6e3",
              fontSize:12, fontFamily:"'DM Mono',monospace",
              resize:"vertical", outline:"none", boxSizing:"border-box"
            }}
          />
          {error && (
            <div style={{
              marginTop:10, padding:"10px 14px", background:"#1a0a0a",
              border:"1px solid #c62828", borderRadius:8,
              color:"#ef9a9a", fontSize:12, lineHeight:1.5
            }}>{error}</div>
          )}
          <div style={{display:"flex", gap:10, marginTop:16}}>
            <button onClick={load} disabled={loading} style={{
              flex:1, padding:"13px 0",
              background: loading ? "#1e3a5f" : "linear-gradient(135deg,#037ef3,#4f8ef7)",
              border:"none", borderRadius:10, color:"#fff",
              fontWeight:700, fontSize:15, cursor: loading ? "default" : "pointer",
              transition:"opacity .2s"
            }}>
              {loading ? `Loading (page ${page}/${totalPages})…` : "Connect to EXPA →"}
            </button>
            <button onClick={() => setShowHelp(true)} style={{
              padding:"13px 18px", background:"transparent",
              border:"1px solid #1e3a5f", borderRadius:10,
              color:"#607d8b", cursor:"pointer", fontSize:13
            }}>?</button>
          </div>
        </div>

        <p style={{textAlign:"center", color:"#263238", fontSize:11, marginTop:16}}>
          Token stays local — not stored or sent anywhere except EXPA
        </p>
      </div>
    </div>
  );

  // ── Dashboard ─────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight:"100vh", background:"#060d18",
      color:"#c9d6e3", fontFamily:"system-ui, sans-serif", padding:"0 0 48px"
    }}>

      {/* topbar */}
      <div style={{
        background:"#0d1b2a", borderBottom:"1px solid #1e3a5f",
        padding:"16px 28px", display:"flex", alignItems:"center",
        justifyContent:"space-between", flexWrap:"wrap", gap:12
      }}>
        <div style={{display:"flex", alignItems:"center", gap:16}}>
          <div style={{
            padding:"6px 16px", background:"linear-gradient(135deg,#037ef3,#4f8ef7)",
            borderRadius:8, fontWeight:900, fontSize:13, letterSpacing:2, color:"#fff"
          }}>AIESEC</div>
          <div>
            <div style={{fontWeight:700, color:"#e8f0fe"}}>
              {user?.home_lc?.name || "Your LC"}
            </div>
            <div style={{fontSize:11, color:"#455a64"}}>
              {user?.full_name} · EXPA Pipeline Analytics
            </div>
          </div>
        </div>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          {PROGRAMS.map(p => (
            <button key={p} onClick={() => setProgram(p)} style={{
              padding:"6px 14px", border:"none", borderRadius:20, fontSize:12,
              background: program === p ? "#4f8ef7" : "#12263f",
              color: program === p ? "#fff" : "#607d8b",
              cursor:"pointer", fontWeight: program === p ? 700 : 400,
              transition:"all .15s"
            }}>{p}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:"24px 28px" }}>

        {/* stat row */}
        <div style={{display:"flex", gap:14, flexWrap:"wrap", marginBottom:28}}>
          <Stat label="Total Applications" value={total} color="#4f8ef7"
            sub={`${program} program`} />
          <Stat label="Applied → Accepted" value={convRate(applied, accepted)} color="#00bcd4"
            sub={`${accepted} accepted`} />
          <Stat label="Accepted → Approved" value={convRate(accepted, approved)} color="#f7941d"
            sub={`${approved} approved`} />
          <Stat label="Approved → Realized" value={convRate(approved, realized)} color="#39b54a"
            sub={`${realized} realized`} />
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, alignItems:"start"}}>

          {/* Funnel */}
          <div style={{
            background:"#0d1b2a", border:"1px solid #1e3a5f",
            borderRadius:16, padding:"24px 20px"
          }}>
            <div style={{marginBottom:20}}>
              <h2 style={{margin:0, color:"#e8f0fe", fontSize:16, fontWeight:700}}>
                Pipeline Funnel
              </h2>
              <p style={{margin:"4px 0 0", fontSize:12, color:"#455a64"}}>
                Applications by stage · {program}
              </p>
            </div>
            <FunnelViz stageCounts={stageCounts} total={total} />
          </div>

          {/* Right col */}
          <div style={{display:"flex", flexDirection:"column", gap:20}}>

            {/* Bar chart */}
            <div style={{
              background:"#0d1b2a", border:"1px solid #1e3a5f",
              borderRadius:16, padding:"24px 20px"
            }}>
              <h2 style={{margin:"0 0 4px", color:"#e8f0fe", fontSize:16, fontWeight:700}}>
                Application Trend
              </h2>
              <p style={{margin:"0 0 16px", fontSize:12, color:"#455a64"}}>
                New applications by week (last 12 weeks)
              </p>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={trendData} barSize={18}>
                    <XAxis dataKey="wk" tick={{fill:"#455a64", fontSize:9}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fill:"#455a64", fontSize:10}} axisLine={false} tickLine={false} width={28} />
                    <Tooltip
                      contentStyle={{background:"#0d1b2a", border:"1px solid #1e3a5f", borderRadius:8, fontSize:12}}
                      labelStyle={{color:"#607d8b"}} itemStyle={{color:"#4f8ef7"}} />
                    <Bar dataKey="count" radius={[4,4,0,0]}>
                      {trendData.map((_, i) => <Cell key={i} fill="#4f8ef7" opacity={0.7 + i * 0.025} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{height:160, display:"flex", alignItems:"center",
                  justifyContent:"center", color:"#263238", fontSize:13}}>
                  No date data available
                </div>
              )}
            </div>

            {/* Stage breakdown table */}
            <div style={{
              background:"#0d1b2a", border:"1px solid #1e3a5f",
              borderRadius:16, padding:"24px 20px"
            }}>
              <h2 style={{margin:"0 0 16px", color:"#e8f0fe", fontSize:16, fontWeight:700}}>
                Stage Breakdown
              </h2>
              <table style={{width:"100%", borderCollapse:"collapse", fontSize:13}}>
                <thead>
                  <tr>
                    {["Stage","Count","% of Total","Conv. from prev."].map(h => (
                      <th key={h} style={{textAlign:"left", color:"#455a64",
                        fontWeight:500, paddingBottom:10, fontSize:11,
                        fontFamily:"'DM Mono',monospace"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STAGES.map((s, i) => {
                    const count = stageCounts[s.key] || 0;
                    const prev = i > 0 ? (stageCounts[STAGES[i-1].key] || 0) : count;
                    return (
                      <tr key={s.key} style={{borderTop:"1px solid #12263f"}}>
                        <td style={{padding:"9px 0"}}>
                          <span style={{display:"inline-block", width:10, height:10,
                            borderRadius:2, background:s.color, marginRight:8}} />
                          <span style={{color:"#c9d6e3"}}>{s.label}</span>
                        </td>
                        <td style={{color:s.color, fontFamily:"'DM Mono',monospace",
                          fontWeight:700}}>{count}</td>
                        <td style={{color:"#455a64", fontFamily:"'DM Mono',monospace"}}>
                          {total ? Math.round((count/total)*100) + "%" : "—"}
                        </td>
                        <td style={{color: count && prev ? "#4f8ef7" : "#263238",
                          fontFamily:"'DM Mono',monospace"}}>
                          {i > 0 ? convRate(prev, count) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

          </div>
        </div>

        {/* raw status notice */}
        {total > 0 && (
          <div style={{
            marginTop:20, padding:"12px 18px", background:"#0a1520",
            border:"1px solid #12263f", borderRadius:10,
            color:"#37474f", fontSize:11, fontFamily:"'DM Mono',monospace"
          }}>
            {total} applications loaded · status field mapping may vary by EXPA schema version ·
            unknown statuses bucketed into Open
          </div>
        )}

        {total === 0 && (
          <div style={{
            marginTop:20, padding:"20px", background:"#0d1b2a",
            border:"1px solid #1e3a5f", borderRadius:12, textAlign:"center",
            color:"#455a64"
          }}>
            No applications found. Try switching programs or check that your token has LC-level permissions.
          </div>
        )}
      </div>
    </div>
  );
}
