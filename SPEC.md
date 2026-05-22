# AIESEC LC CRM — High-Fidelity Wireframe Generation

You are designing a high-fidelity, production-grade wireframe for an internal-facing CRM and operations dashboard built for AIESEC Local Committees. Output as a multi-page React artifact using Tailwind + shadcn/ui patterns. Use placeholder neutrals for now — brand colors, typography, and logos will be swapped in afterward (see "Brand Token Placeholders" below).

## Reference Aesthetic
Take inspiration from: Linear (information density + keyboard-first), GoHighLevel (unified conversations inbox), Notion (clean panel-based layouts), Vercel dashboard (data viz polish), Attio (modern CRM). 
**Avoid**: generic Bootstrap aesthetics, overly playful UI, excessive gradients, AI-slop "glassmorphism."

## Brand Token Placeholders
Use these CSS variables throughout — do NOT hardcode colors:
```css
--brand-primary: #2563eb;       /* placeholder, user will override */
--brand-primary-fg: #ffffff;
--brand-accent: #f59e0b;        /* placeholder */
--brand-surface: #ffffff;
--brand-surface-muted: #f8fafc;
--brand-border: #e2e8f0;
--brand-text: #0f172a;
--brand-text-muted: #64748b;
--font-display: 'Inter', sans-serif;  /* placeholder */
--font-body: 'Inter', sans-serif;     /* placeholder */
```
Logo placement: render `<div data-slot="logo-mark" />` (32×32) and `<div data-slot="logo-wordmark" />` (auto×24) where logos belong.

## Application Architecture
Persistent left sidebar nav (collapsible to icon-only at <1280px), top header with workspace switcher + global search + notifications + avatar menu, content area, optional right detail drawer.

## Screens to Design (ALL required)

### 1. Authentication Flow
- **Sign-in page**: email + magic link, "Join an LC" CTA, "Create new LC" CTA
- **Invitation acceptance**: shows LC name, inviting member, role being granted, accept/decline
- **LC creation wizard**: 3 steps — LC details (name, entity, country, EXPA committee ID), brand setup (logo upload, colors), invite teammates
- **Join LC search**: search public LCs, request access flow

### 2. Dashboard (Home)
KPI cards row (Approvals, Applications, Realizations, Finishes — pulled from EXPA), trend charts (funnel conversion over 90 days), recent activity feed, upcoming scheduled posts, unread conversations count, team activity. Use Recharts patterns.

### 3. EXPA Analytics
Multi-tab layout:
- **Pipeline**: funnel visualization (Opens → Applied → Accepted → Approved → Realized → Finished)
- **People**: searchable/filterable table of EPs (Exchange Participants) and members
- **Opportunities**: grid of open opportunities with status badges
- **Performance**: LC vs. national benchmarks, member leaderboard

### 4. CRM Contacts
GoHighLevel-style: left sidebar of saved views/segments, main table (sortable columns, bulk actions, inline editing), right-side detail panel when row selected showing full contact profile, activity timeline, custom fields, tags, source (imported from Notion/Drive/EXPA/manual).

### 5. Conversations (Unified Inbox) — most complex screen
Three-column layout exactly like GoHighLevel:
- **Left**: inbox list with filters (All / Instagram DM / Email / Facebook / WhatsApp / Unread / Assigned to me). Each row: avatar, name, channel icon, last message preview, timestamp, unread indicator.
- **Middle**: active conversation thread, channel icon at top, message bubbles with channel-specific styling (Instagram = gradient bubble, email = formal card with subject line, etc.), composer at bottom with channel selector, template picker, attachment, schedule send.
- **Right**: contact context panel — profile, conversation history, linked EXPA record, internal notes, tags, assign to teammate.

### 6. Social Media Planner
- **Calendar view** (month/week toggle) with draggable post cards color-coded by platform
- **Post composer modal**: platform selector (multi-select for cross-posting), media uploader, caption editor with character counts per platform, hashtag suggester, preview cards showing how the post will render on each platform, schedule picker, save-as-draft vs. publish-now
- **Queue view**: chronological list of scheduled posts with edit/delete/duplicate
- **Analytics tab**: per-platform engagement metrics, top posts, follower growth charts, best-time-to-post heatmap

### 7. Email Composer & Campaigns
- Single send view (rich text editor, recipient picker from CRM, template variables like `{{first_name}}`, schedule send)
- Campaign view (audience segment, A/B subject test, send analytics: opens, clicks, bounces)
- Templates library (saved reusable templates)

### 8. Integrations Hub
Grid of connector cards: Notion, Google Drive, Gmail, Instagram/Meta, LinkedIn, EXPA, Mailgun. Each card shows: logo, name, connection status (Connected/Disconnected with last sync time), Configure button. Clicked card opens detail panel for OAuth flow + sync settings + field mapping (e.g., "Map Notion DB columns → CRM contact fields").

### 9. Settings
Tabbed: Profile, LC Settings, Team & Roles (with permission matrix), Branding (logo + color overrides — this is where brand tokens get edited), Notifications, API Keys, Billing.

### 10. Empty / Loading / Error States
At least one example of each: empty conversations inbox, loading skeleton for EXPA dashboard, error state for failed integration sync, success toast for sent email.

## Interaction & UX Details
- Command palette (⌘K) accessible from every screen — show its UI
- Slide-over drawers (not modals) for most "detail" or "create" flows
- Inline editing on tables (click cell → input)
- Toasts bottom-right
- Keyboard shortcuts shown next to actions in tooltips
- Avatar groups for assigned teammates
- Status badges with consistent color semantics (green = active, amber = pending, red = error, slate = draft)

## Component Inventory to Include
Buttons (primary/secondary/ghost/destructive + icon-only), inputs (text/textarea/select/multi-select/date/file), tables, cards, badges, tabs, breadcrumbs, dropdown menus, modals, slide-overs, toasts, tooltips, avatars, progress bars, skeletons, empty states, charts (line, bar, funnel, donut).

## Output Format
Single React artifact with internal client-side routing (or visible nav between fake routes via state). Each major screen should be reachable. Use mock data that feels real (realistic AIESEC LC names like "AIESEC Western", real-sounding member names, plausible EXPA numbers). Include the design system reference page at `/styleguide` showing all components in one view for handoff.

Make it look like a $50M-funded SaaS product, not a student project.