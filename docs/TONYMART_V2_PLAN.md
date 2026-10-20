# TonyMart v2 — Build Plan & Spec

*Status: DRAFT for review (Jeremiah + Tony). No code written yet — approve/adjust before build.*
*Source: meeting notes, 2026-06-13. Decisions captured: real Firebase backend, elevated e-reader mode, video placeholders for now, plan-first.*

---

## 0. The foundational decision (read this first)

**UPDATED:** This is now a **native mobile app — iOS first, Android later** (not a website).

Today's app is a **single 1.8MB HTML file** exported from a no-code tool (a custom
`<sc-*>` template format with all markup, styles, and logic packed into one escaped JS
string). It was perfect for a prototype. **A bundled no-code web export cannot become a
quality native app**, so "rebuild on a proper foundation" is no longer a question — it's
required. The current file becomes our **approved design/prototype reference.**

The real decision is now **which cross-platform stack**, so that shipping iOS first does
**not** mean an Android rewrite later:

- **React Native (Expo) + Firebase — recommended.** One codebase → iOS now, Android
  later; first-class Firebase SDKs; over-the-air updates; matches this team's JS/web
  background.
- **Flutter + Firebase — strong alternative.** Single codebase iOS+Android; superb for
  the premium reading typography/animations.
- **Native Swift now / Kotlin later — not recommended.** Best iOS polish, but ~doubles
  the work for Android, which contradicts "Android down the road."
- **Capacitor (wrap a web app) — cheap but compromised.** Reuses web work, but the
  premium reading feel and App Store quality suffer; only if speed/cost trumps polish.

**Backend unchanged and reinforced:** Firebase has native iOS/Android SDKs for Auth,
Firestore, Realtime Database, Storage, and **Push notifications (FCM)** — the HoneyBadger
app already uses FCM, so there's in-house precedent.

### What this means for the website
The hidden `/tonymart` web page stays as an **optional landing/teaser** (or a web
fallback reader). The *product* is the app, distributed via **App Store / TestFlight**.

### iOS / App Store considerations to bake in now
- **Apple Developer account** ($99/yr) required; **TestFlight** is ideal for a *private
  early-access* beta — a cleaner version of the "unlisted/hidden" goal than a secret URL.
- **Auth:** if we offer any social login, Apple requires **Sign in with Apple** as an
  option. Anonymous auth is fine.
- **Payments:** any *digital* "premium unlock" must use **Apple In-App Purchase** (30%
  cut). The notes already lean toward removing paywalls/pop-ups — if there's no paid
  content, we sidestep IAP entirely. Needs a decision (see D7).
- **Privacy:** collecting audience info triggers **App Privacy labels**, a **privacy
  policy** (we have `legal.html` to build on), and **ATT** consent if we track across
  apps. Push needs a notification-permission prompt.
- **Offline reading** is natural on native — a real win for the elevated e-reader.

**Open decision D0 (revised):** Which native stack — Expo/React Native (recommended),
Flutter, native Swift+Kotlin, or Capacitor?

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

- **D0 (revised)** — Native stack: Expo/React Native (recommended), Flutter, native
  Swift+Kotlin, or Capacitor?
- **D1** — Exact audience-info fields to collect at sign-up? (name, email, age band,
  location, "how did you hear," consent to contact?)
- **D2** — New Firebase project, or reuse HoneyBadger's?
- **D3** — Social: which platforms (IG / X / TikTok / FB)? Tony's @handle(s)? What's the
  "something" to auto-tag, and the hashtag?
- **D4** — Final in-world name for the Extras tab?
- **D5** — Does E-reader mode require an account, or is it the no-commitment path?
- **D6** — E-reader: paginated page-turns or continuous scroll?
- **D7** — Any paid/premium content? (yes → Apple IAP + 30%; no → no paywall, simpler review)
- **D8** — Distribution: TestFlight private beta first, or straight to public App Store?
- **D9** — Who holds the Apple Developer account / App Store Connect org?
- **Content** — How many decision points per chapter, and are the vote options written?
- **Rooms** — When a user advances and gets locked out, can they still *read* the old
  room, or fully removed? Are rooms permanent or do they expire?

---

## 8. Proposed phased roadmap (each phase = reviewable chunk)

0. **Foundation** — native app scaffold (chosen stack) + Firebase project, auth, push
   setup, theme system ported, Apple Developer account + TestFlight pipeline.
   *(blocks everything)*
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
