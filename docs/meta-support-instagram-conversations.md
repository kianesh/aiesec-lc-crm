# Meta support write-up — `/conversations` returns an empty list on both Instagram APIs

Paste this into the [Developer Community Forum](https://developers.facebook.com/community/)
under **Instagram Platform** (Meta closed the bug tool for Messenger Platform →
Instagram Messaging → Conversation; the forum is the channel they redirect to).

Sensitive identifiers are left out on purpose — it is a public forum. Offer them
privately if a Meta engineer asks.

---

**Title:** Instagram `/conversations` returns 200 with an empty `data` array on
both Instagram Login and Facebook Login, with a full permission set

**Body:**

An Instagram Business account with conversations visible in the app returns an
empty list from the Conversations API on *both* Instagram API flavours. Every
prerequisite in the docs is satisfied and the calls succeed — they just come
back empty.

**Setup**

- Instagram professional account, `account_type: BUSINESS` (confirmed via `/me`,
  switched from `MEDIA_CREATOR` while testing — no change)
- Linked to a Facebook Page; the Page is owned by a business portfolio
- App in Development mode, Standard Access, the account holds the Instagram
  Tester role and has accepted the invite
- Instagram app → Settings → Messages and story replies → Connected tools →
  **Allow access to messages is ON**
- Conversations are in the **Primary** inbox, not Requests, and include threads
  received after every step above
- Graph API v21.0

**Attempt 1 — Instagram API with Instagram Login (`graph.instagram.com`)**

Token permissions (from `/me/permissions`): `instagram_business_basic`,
`instagram_business_manage_messages`, `instagram_business_manage_comments`,
`instagram_business_manage_insights`, `instagram_business_content_publish`.

```
GET /v21.0/me?fields=id,username,account_type
→ 200 {"id":"<ig-id>","username":"<handle>","account_type":"BUSINESS"}

GET /v21.0/me/conversations?platform=instagram&fields=participants,messages{id,created_time}
→ 200 {"data":[]}

GET /v21.0/me/conversations?fields=participants,messages{id,created_time}
→ 200 {"data":[]}
```

The same token successfully returns account insights and recent media, so it is
valid and the insights scope demonstrably works.

**Attempt 2 — Instagram API with Facebook Login (`graph.facebook.com`)**

Granted: `instagram_basic`, `instagram_manage_messages`,
`instagram_manage_comments`, `instagram_manage_insights`,
`instagram_content_publish`, `pages_show_list`, `pages_read_engagement`,
`business_management`. The Page and the Instagram account were both explicitly
selected during Facebook Login for Business consent.

```
GET /v21.0/{page-id}/conversations?platform=instagram&fields=participants,messages{id,created_time}
→ 200 {"data":[]}
```

**Questions**

1. Is there a condition beyond the documented ones under which
   `/conversations` returns an empty set rather than an error — for a Business
   account, with `*_manage_messages` granted, Connected Tools enabled, and
   threads in Primary?
2. Does a Page created *after* the conversations already existed permanently
   lack visibility of them, and if so is that documented anywhere? Threads
   received after the Page link was established are also absent, which argues
   against this being purely historical.
3. Does Development mode / Standard Access silently return an empty set instead
   of an error for `/conversations`? The docs say Standard Access is sufficient
   for accounts you manage, and the account holds an accepted Tester role.

Happy to share app ID, Page ID, IG user ID and exact timestamps privately.

---

## What was ruled out before writing this

Each of these was measured, not assumed:

| Hypothesis | Result |
|---|---|
| Missing `instagram_business_manage_messages` | Present on the token |
| Token expired / wrong account | Valid; `/me` returns the right handle |
| Stored IG user id wrong | Was off by one from a JSON precision bug — fixed, now matches `/me` |
| `platform=instagram` filtering results | Same empty result with and without it |
| Creator account unsupported | Switched to BUSINESS; no change |
| Connected Tools toggle off | Verified ON |
| Threads sitting in Requests >30 days | Confirmed in Primary |
| Instagram-Login flavour broken | Facebook-Login flavour returns empty too |
| Page not linked to Instagram | Business Suite shows both, follower count reads through |
| Page not in a business portfolio | Page is owned by a portfolio, and that portfolio was granted |
