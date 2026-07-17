# MILESTONE

**Kickstart your journey. Every step counts.**

Live app: [https://my-stone.vercel.app](https://my-stone.vercel.app)

MILESTONE is a gamified mentor–mentee study tracker. Families (or tutors) share invitation codes — no email signup. Mentees complete tasks and study sessions; mentors verify work, shape the prize path, and cheer progress as EXP turns into Gems and milestone rewards unlock.

---

## What’s inside (major features)

### Invitation-code login

- Enter a **5-character code** and swipe to enter — the code is your login.
- **Start as a Mentor** creates a new parent account with a fresh code.
- First visit: pick a **nickname** and optional **avatar** (defaults to the app icon).

### Mentor & mentee roles


| Mentor (parent)              | Mentee (child)                    |
| ---------------------------- | --------------------------------- |
| Invite mentees or co-mentors | Complete tasks and claim rewards  |
| Switch active mentee         | View prize path (read-only)       |
| PASS pending work            | Run study sessions with GPS check |
| Edit tasks & prize path      | See linked mentors on Profile     |


### Dashboard (the main home)

Everything important lives on one dashboard — tasks, progress, prize path, and the study timer.

#### Tasks

- Lists: **Your Tasks**, **Locked** (prerequisites), **Finished**
- Categories across **Math**, **English** (Writing / Vocab / Speaking), and **Community**
- Expand a card for full detail (aim, requirements, files)
- **Mentee:** mark done → waits for mentor → **Claim** EXP/Gems after PASS
- **Mentor:** PASS pending work; create / edit / remove available tasks; **Import sample template** from the shared catalog
- Prerequisites lock later tasks until earlier ones are claimed

#### Prize path (milestones)

- Visual path of gem thresholds → prize names
- **Mentor:** edit stops in a sheet (gems + prize), save for one mentee, or **apply to all mentees**
- Empty paths can seed from the built-in system template
- **Mentee:** read-only view; highlights when a threshold is reached
- Daily inspirational quote on the progress card (tap to shuffle)

#### Study sessions

- Bottom-sheet timer: start → run → end → claim session EXP
- **Mentee:** normal rate with **GPS** (desk photo optional)
- **Mentor:** **tutorial** sessions (3× rate, no environment check), credited to the selected mentee
- Finished sessions show in the Finished log alongside completed tasks
- Linked accounts stay in sync for live task/session updates

### Profile & family links

- Edit nickname and avatar
- **Mentor:** see mentees, select who you’re coaching, invite new mentee / co-mentor codes, remove unused invites
- **Both:** see linked mentors
- After first mentor setup, a **Save your codes** screen helps you copy mentor + mentee codes / invite link

### Progress economy

- Tasks and sessions grant **EXP**
- **Gems** come from task rewards + converting EXP (about **20 EXP = 1 Gem**)
- Prize path unlocks by **gem thresholds** you (or your mentor) define

---

## Quick start (users)

1. Open [https://my-stone.vercel.app](https://my-stone.vercel.app)
2. Enter your invitation code → swipe to enter
  *(or Start as a Mentor for a new parent account)*
3. Set nickname (+ optional avatar)
4. Mentors: save codes, invite a mentee, then open the dashboard
5. Track tasks, run sessions, unlock prizes along the path

---

## For developers

### Stack

Next.js (App Router) · TypeScript · Tailwind CSS · Supabase Auth + Postgres · Vercel Blob (avatars / session photos)

### Run locally

```bash
npm install
npm run dev
```

`.env.local` (see also `PROJECT_PLAN.md`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `BLOB_READ_WRITE_TOKEN`

---

## License

MIT © 2026 Pepper Candy — see `[LICENSE](./LICENSE)`.