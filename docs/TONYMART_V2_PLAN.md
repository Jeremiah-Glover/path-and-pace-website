# TonyMart v2 — Build Plan & Spec

*Status: DRAFT for review (Jeremiah + Tony). No code written yet — approve/adjust before build.*
*Source: meeting notes, 2026-06-13. Decisions captured: real Firebase backend, elevated e-reader mode, video placeholders for now, plan-first.*

---

## 0. The foundational decision (read this first)

Today's app is a **single 1.8MB HTML file** exported from a no-code tool. It uses a
custom `<sc-*>` template format with the entire app — markup, styles, and the
controller logic — packed into one escaped JavaScript string. That was perfect for a
prototype. It is **the wrong foundation for what these notes describe.**

What the notes ask for is a real product:
- user accounts + first-time-only sign-up (auth)
- "how others voted," live chapter-room headcount, an open forum (multi-user, real-time)
- remembering reading position, saved highlights, chapter progress (persistence)
- social-shareable cards, two distinct experience modes, killing the whole pop-up system

**Recommendation: treat the current file as the approved design/prototype reference, and
rebuild on a maintainable foundation we control.** Proposed stack:

- **Frontend:** a small modern app (Vite + vanilla TS or lightweight React) — same look,
  same soft themes/colors, but editable like a normal codebase.
- **Backend:** **Firebase** — Auth, Firestore (data), Realtime Database (presence),
  Storage (videos later), Security Rules.
- **Hosting:** stay on **Cloudflare Pages** (Firebase web SDK works anywhere). The
  hidden `/tonymart` route and "unlisted" behavior carry over unchanged.

> If we instead keep editing the bundle, every feature below gets 3–5× harder and more
> fragile, and real-time/auth is impractical. Flagging clearly so it's a conscious call.

**Open decision D0:** Re-platform (recommended) vs. keep extending the bundle.

---

## 1. Product shape

First launch → **one-time thank-you video** → fork into two modes:

| Mode | For whom | Has account? |
|---|---|---|
| **Interactive** ("the shift") | Wants the gamified TonyMart world | Yes — sign up |
| **E-reader** ("the book") | Just wants to read, beautifully | TBD — see D5 |

Both share the same 12-chapter book content; they differ in everything around it.

---

## 2. Onboarding flow

1. **First-launch-only thank-you video** (placeholder player now; real file later).
   - Persisted "seen" flag so returning users skip it.
2. **Mode choice:** Interactive vs E-reader (Tony's landing-page pic is the visual target).
3. **Interactive sign-up (first-time only):**
   - Keep the current intro/"Apply" descriptions and vibe.
   - **Collect audience info** → stored on the user profile (Tony's list).
   - Frictionless: anonymous auth first, optional email capture. *(See D1 for fields.)*

---

## 3. Interactive mode — screen by screen

### 3.1 Home / "Today's Shift" (keep + rework)
- **Keep:** Today's Shift, Attendance, soft themes + current colors.
- **Remove the memo box entirely.**
- **Scrolling banner becomes the memo channel** (the marquee carries memo content).
- **Move the chapter box down** into "Today's Shift," at the bottom.
- **Add faint "breathing" background words** — subtle ambient animated text (CSS/canvas,
  no backend).

### 3.2 Read tab
- **Keep:** "Your shift has started."
- **Remember reading position** (resume exact chapter + spot). *(Firestore: per user.)*
- **Replace the video** in-chapter with the interactive decision beat.
- **Decision point "What would you do?" + show how others voted** — live aggregate
  results bar after voting. *(Firestore vote counters; one vote per user.)*
- **Locker via highlight-to-save:** user selects words/phrases in the text → saved to
  their locker; highlights persist on re-read. *(Firestore: per user.)*
- **End of chapter:** choose **per-chapter chat room** *or* **Continue.**
  - Room is scoped to *that* chapter ("this room is for this part of the book").
  - Show **live headcount** of people in the room. *(Realtime DB presence.)*
  - **Lock the user out of that room once they start the next chapter.**
    *(Enforced in Security Rules, not just UI.)*
- **Remove ALL pop-ups** — memos, paywall, overlays. Replace with inline/banner UI.
- **Cassandra = admin** persona name throughout.

### 3.3 Break room → Community
- Becomes a **global open forum** that **unlocks only after finishing Chapter 12.**
- Gated behind a **Cassandra thank-you video** (placeholder now).
  *(Rule: forum writable only if user.chaptersCompleted includes ch.12.)*

### 3.4 Stats (keep + extend)
- Keep the card.
- **Shareable to social:** export card image, share via device share sheet.
- **Auto-tag Tony + [TBD second tag]**, and **let users add/tag people.**
  > Reality check: platforms don't allow programmatic "tagging" of arbitrary accounts.
  > What we *can* do: generate the image + a **pre-filled caption** with @handles and a
  > hashtag, and let the user @mention people in that caption. *(See D3.)*

### 3.5 Extras → renamed
- **Rename to an in-world name.** Candidates: "The Back Room," "Lost & Found,"
  "The Locker Room," "Supply Closet," "Employee Perks." *(See D4.)*

---

## 4. E-reader mode (elevated, premium)

Not a stripped-down afterthought — a **best-in-class reading experience** that stands on
its own:
- Beautiful typography (refined serif, ideal measure/line-height), generous margins.
- Reading themes: paper / sepia / night (reuse the soft palette).
- Adjustable type size; smooth pagination or elegant scroll; chapter nav + progress.
- **Resume position**; optional offline reading.
- Zero app chrome — no shifts, stats, chat. Just the book, done exquisitely.

**Open decisions:** D5 (does e-reader need an account?), D6 (paginated vs scroll).

---

## 5. Cross-cutting principles
- **No pop-ups anywhere.** Banner/inline replaces every interruption.
- **Persist everything:** sign-up, mode, reading position, highlights/locker, chapter
  progress, room access, theme.
- **Keep the calm, soft aesthetic and existing colors.**
- **Cassandra is the single admin voice.**

---

## 6. Firebase architecture (proposed)

**Auth:** Anonymous → optional email link. Profile created on first sign-up.

**Firestore (persistent data):**
- `users/{uid}` — profile, audienceInfo, mode, theme, readingPosition,
  chaptersCompleted[], currentChapter, createdAt.
- `users/{uid}/locker/{wordId}` — saved highlights.
- `users/{uid}/votes/{decisionId}` — dedupe guard.
- `decisions/{decisionId}` — aggregate vote counts (distributed counters).
- `chapterRooms/{chapterId}/messages/{msgId}` — per-chapter chat.
- `forum/messages/{msgId}` — global forum (post-ch.12).

**Realtime Database (presence/headcount):** `presence/{chapterId}/{uid}` with
`onDisconnect` cleanup → live counts.

**Storage:** thank-you videos (later; placeholders now).

**Security Rules (must-haves):**
- Users read/write only their own profile/locker/votes.
- Chapter room writable only while `currentChapter == roomChapter` → enforces lock-out.
- Forum writable only if `chaptersCompleted` includes 12.
- Votes increment-only, one per user.
- Admin (Cassandra) flag via custom claim.

**Open decision D2:** new Firebase project vs. reuse the existing HoneyBadger project.

---

## 7. Open questions for Tony / Jeremiah

- **D0** — Re-platform (recommended) or keep editing the bundle?
- **D1** — Exact audience-info fields to collect at sign-up? (name, email, age band,
  location, "how did you hear," consent to contact?)
- **D2** — New Firebase project, or reuse HoneyBadger's?
- **D3** — Social: which platforms (IG / X / TikTok / FB)? Tony's @handle(s)? What's the
  "something" to auto-tag, and the hashtag?
- **D4** — Final in-world name for the Extras tab?
- **D5** — Does E-reader mode require an account, or is it the no-commitment path?
- **D6** — E-reader: paginated page-turns or continuous scroll?
- **Content** — How many decision points per chapter, and are the vote options written?
- **Rooms** — When a user advances and gets locked out, can they still *read* the old
  room, or fully removed? Are rooms permanent or do they expire?

---

## 8. Proposed phased roadmap (each phase = reviewable chunk)

0. **Foundation** — re-platform scaffold + Firebase project, auth, hosting, theme system
   ported. *(blocks everything)*
1. **Onboarding** — thank-you video (placeholder) → mode fork → first-time sign-up +
   audience capture.
2. **Home** — Today's Shift rework: banner-as-memo, move chapter box, breathing-words bg,
   remove memo box.
3. **Read core** — chapter reader, resume position, remove all pop-ups, Cassandra-as-admin.
4. **Read interactive** — decision points + live vote results; highlight-to-save locker.
5. **Rooms & Community** — per-chapter rooms w/ presence + lock-out; ch.12 gate; forum +
   Cassandra video.
6. **Stats & social** — shareable card + caption/tagging.
7. **Extras rename** + polish pass.
8. **E-reader mode** — the elevated reading experience (can run partly in parallel).

---

*Next step: approve D0 + the open questions, then I'll turn this into a build-ready ticket
list and start Phase 0.*
