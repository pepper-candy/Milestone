# PROJECT_PLAN.md

* **Project:** MILESTONE — *Kickstart your journey. Every step counts.*
* **Stack:** Next.js 15 (App Router) + TypeScript + Tailwind CSS + Supabase + Vercel Blob
* **Date:** 2026-07-14

---

## 📋 1. Project Overview

MILESTONE is a 50-day gamified reward tracker for a Secondary 3 student transitioning to Secondary 4. Users log in via invitation code, track tasks across 6 categories (Math S2-S4, English Writing/Vocab/Speaking, Community Projects), earn EXP + Gems, unlock milestone rewards, and complete community exploration with GPS + photo proof.

**Core principles:**
- Invitation-code based login (no email/password signup)
- Nickname required on first login; cannot be changed later
- Avatar optional (defaults to app icon)
- Session timer with environmental check (desk photo + location at start/end)
- Stamp/Gem system: 20 EXP = 1 Gem, milestones at 15/20/25/30/33/40 Gems
- Location + photo proof for community projects

---

## 🗂️ 2.1. Project Structure

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx              # Invitation code login
│   │   └── setup/
│   │       └── page.tsx              # Nickname + avatar (first login)
│   ├── (dashboard)/
│   │   ├── page.tsx                  # Home: timer + progress + tasks
│   │   ├── tasks/
│   │   │   └── page.tsx              # Full task list (6 categories)
│   │   ├── milestones/
│   │   │   └── page.tsx              # Visual milestone path
│   │   ├── shop/
│   │   │   └── page.tsx              # Prize redemption
│   │   ├── community/
│   │   │   └── page.tsx              # GPS + photo upload
│   │   └── resources/
│   │       └── page.tsx              # OneDrive links + PDFs
│   ├── api/
│   │   ├── auth/
│   │   │   └── route.ts              # Login handler
│   │   ├── session/
│   │   │   └── route.ts              # Start/end session with location
│   │   ├── upload/
│   │   │   └── route.ts              # Vercel Blob image upload
│   │   └── tasks/
│   │       └── route.ts              # Task CRUD
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                           # Reusable UI (Button, Card, etc.)
│   ├── timer/
│   │   ├── SessionTimer.tsx          # Timer with start/pause/end
│   │   └── EnvironmentalCheck.tsx    # Photo + location capture
│   ├── progress/
│   │   └── MilestonePath.tsx         # Visual road with markers
│   ├── tasks/
│   │   └── TaskList.tsx              # Categorized task list
│   └── shop/
│       └── PrizeGrid.tsx             # Unlocked/locked prizes
├── lib/
│   └── supabase/
│       ├── client.ts                 # Browser client
│       ├── server.ts                 # Server client
│       └── middleware.ts             # Session refresh
├── hooks/
│   ├── useSession.ts                 # Session timer logic
│   └── useGeolocation.ts             # GPS capture
├── types/
│   └── index.ts                      # Database types
└── middleware.ts                     # Auth + session refresh
```
---

## 🗂️ 2.2. Reference File in folder "/ref"
```
accumulative_reward.csv                 # The reward when gem ammount is reached
icon_app_d.png                          # App icon for day mode
icon_app_n.png                          # App icon for night mode
icon_d.png                              # Icon for day mode
icon_n.png                              # Icon for night mode
LOCATION-PROOF-SESSION-TRACKER.md       # Showcast on how to do environmental check for session timer
LOGIN-FLOW.md                           # Showcast on how the login logic are, avatar is missing in this markdown
logo_d.png                              # App Logo for day mode
logo_n.png                              # App Logo for night mode
rating.csv                              # Showing on what the score means
task_exp.csv                            # Task set for the basic of the app, to be import
task_margin.xlsx                        # Sandbox to test out the margin by creator
```
### Note from Creator:
1. conversion between exp and gem is 20 exp = 1 gem
2. tutorial session exp will be *3 of normal session
3. normal session timing will be 0.5exp per hour, in ratio, correct to nearest 0.1
4. as there are children invitation code, and parent invitation code, you may want to separate them
* children: they can strat their normal session and mark a task as complete, turning the task into pending stage.
* parent: they can add task for their children, modify task, and delete task. also they can review and approve a task as complete to turn children pending stage task to claim button to let them get award. Moreover tutorial timer can only be triggered by parents, so that for parents timer, it was having 1.5exp per hour, start and end without environment check.
---

## 🔐 3. Authentication Flow (Invitation Code)
**take ref from LOCATION-PROOF-SESSION-TRACKER.md**
### 3.1 Login Page (`/login`)

**Figma:** [node-id=1-27](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=1-27)

**Behavior:**
1. User enters invitation code (e.g., `CHILD-994`)
2. App transforms to email: `{code}@mvp.local`
3. Password = same code
4. Call `signInWithPassword(email, password)`
5. On success → check if user has nickname set
6. If no nickname → redirect to `/setup`
7. If has nickname → redirect to `/dashboard`

**Error handling:**
- "Invalid code" — code not found in database
- "Already logged in on another device" — single session per user

Turn ON "Single session per user" FAILED as it is not pro account.
Path:

Supabase Dashboard → Authentication → Settings → Single session per user → Toggle ON

⚠️ Note: Some sources mention this may require a Pro plan ($25/month) for full enforcement. On the Free plan, this setting might not work reliably. You can test it — if it doesn't work, you may need to upgrade.

### 3.2 Setup Page (`/setup`)

**Figma:** [node-id=3-78](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=3-78)

**Behavior:**
1. **Nickname** (required): Input field, cannot be empty
2. **Avatar** (optional): Upload image → Vercel Blob → store URL
3. On submit: Update `profiles` table with nickname + avatar_url
4. **Nickname cannot be changed after this point**
5. Welcome message → redirect to `/dashboard`

### Note from Creator:
1. for parent after setup, it will show who their child is, a continue button below.
---

## 🗄️ 4. Database Schema (Supabase)

### 4.1 Table: `profiles`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | References `auth.users.id` |
| `invitation_code` | TEXT | Unique, e.g., "CHILD-994" |
| `nickname` | TEXT | Required, set once |
| `avatar_url` | TEXT | Optional, Vercel Blob URL |
| `is_child` | BOOLEAN | True for child accounts |
| `linked_parents` | TEXT[] | Array of parent codes |
| `created_at` | TIMESTAMP | Default: now() |

### 4.2 Table: `tasks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `task_no` | TEXT | e.g., "Math_S2_E2_P1" |
| `category` | TEXT | "math_s23", "math_s4", "eng_writing", "eng_vocab", "eng_speaking", "community" |
| `exp` | INTEGER | Experience points |
| `gem` | INTEGER | Gems (0-2) |
| `title` | TEXT | Display name |
| `description` | TEXT | Task details |
| `requires_proof` | BOOLEAN | True for community projects |

### 4.3 Table: `user_tasks`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References `profiles.id` |
| `task_id` | UUID | References `tasks.id` |
| `status` | TEXT | "pending", "completed", "verified" |
| `completed_at` | TIMESTAMP | When completed |
| `proof_data` | JSONB | { photo_url, latitude, longitude, notes } |

### 4.4 Table: `sessions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References `profiles.id` |
| `started_at` | TIMESTAMP | Server time |
| `ended_at` | TIMESTAMP | Server time |
| `duration_seconds` | INTEGER | Calculated |
| `start_photo_url` | TEXT | Desk photo at start |
| `end_photo_url` | TEXT | Desk photo at end |
| `start_latitude` | DECIMAL | GPS at start |
| `start_longitude` | DECIMAL | GPS at start |
| `end_latitude` | DECIMAL | GPS at end |
| `end_longitude` | DECIMAL | GPS at end |
| `exp_earned` | INTEGER | 1 EXP per 2 hours |

### 4.5 Table: `milestones`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `gem_threshold` | INTEGER | 15, 20, 25, 30, 33, 40 |
| `title` | TEXT | "Satisfactory", "Good", etc. |
| `prize_name` | TEXT | "Spotify Premium (1 Month)" |
| `prize_description` | TEXT | Details |
| `icon` | TEXT | Emoji or image URL |

### 4.6 Table: `user_milestones`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | References `profiles.id` |
| `milestone_id` | UUID | References `milestones.id` |
| `unlocked_at` | TIMESTAMP | When unlocked |
| `claimed` | BOOLEAN | Whether prize claimed |

---

## 🧮 5. Scoring Logic

### 5.1 Task Completion

Each task has `exp` and `gem` values (see `task_exp.csv`).

**Task contribution:**
```
contribution = (gem × 20) + exp
```

**Total effective gems:**
```
total_gems = (total_exp_earned / 20) + total_gems_earned
```

### 5.2 Milestone Thresholds
**ref to  accumulative_reward.csv**

| Threshold | Title | Prize |
|-----------|-------|-------|
| 15 | Satisfactory | Spotify Premium (1 Month) |
| 18 | — | Meccha Chameleon |
| 21 | — | Volleyball Stuff |
| 24 | — | Spotify Premium (3 Months) |
| 26 | — | 牛氣放題 |
| 28 | — | Apple Pencil |
| 31 | — | Airpods (Any Model) |
| 33 | — | Spotify Premium (11 Months) |
| 40 | Cap | (Hidden bonus) |

### 5.3 Session EXP

- **Study session:** 1 EXP per 2 hours (ratio-based)
- **Tutorial session:** 3× EXP (ratio-based)

---

## ⏱️ 6. Session Timer + Environmental Check
**ref from LOCATION-PROOF-SESSION-TRACKER.md**
### 6.1 Timer Flow

1. User clicks **"Kickstart"** → Start session
2. App requests:
   - **Desk photo** (via camera)
   - **GPS location** (high accuracy)
3. Timer starts counting (monotonic, using `performance.now()` to prevent device clock tampering)
4. User studies — timer runs in background
5. User clicks **"End Session"** → Stop timer
6. App requests:
   - **Desk photo** (end)
   - **GPS location** (end)
7. App calculates:
   - Duration (server-verified)
   - Location consistency (start vs end)
   - EXP earned (1 per 2 hours)
8. **End Session Calculation Page** shows summary

### 6.2 Anti-Cheat

- Server timestamp baseline (Vercel server time)
- Monotonic browser clock (`performance.now()`)
- Location consistency check (start vs end coordinates)
- Photo required at both start and end



## 🎨 8. Design System (Cozy Theme)
**please stick to figma design**
* Arrival invitation code page: https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=1-27&t=u4D2c0EtgGzraQVy-1 
* Setup page: https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=3-78&t=u4D2c0EtgGzraQVy-1
* Main app design and timer page: https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=11-3679&t=u4D2c0EtgGzraQVy-1

### 8.1 Colors

| Role | Hex | Usage |
|------|-----|-------|
| Background | #FFFFFF | Page bg |
| Card bg | #FCDDA6 | Soft cream |
| Primary accent | #D4AFFB | Buttons, highlights |
| Secondary accent | #DFEEF3 | Headers, progress |
| Text primary | #000000 | Headings |
| Text secondary | #6B6B6B | Subtitles |
| Glow | #F5C34B | Milestones, rewards |
| Success | #A8C4A0 | Completed tasks |

### 8.2 Logo
use logo_d.png as the main

- **Day mode:** Cream (#FCDDA6) + Sky Blue (#DFEEF3) path, Black text, White bg
- **Concept:** Road with 3 milestone markers, farthest glows like castle stone door

---

## 🔧 9. Supabase Setup Commands

### 9.1 Environment Variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
BLOB_READ_WRITE_TOKEN=your-vercel-blob-token
```

### 9.2 SQL Migration (Run in Supabase SQL Editor)

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_code TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  avatar_url TEXT,
  is_child BOOLEAN DEFAULT true,
  linked_parents TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT now()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_no TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  exp INTEGER NOT NULL,
  gem INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  description TEXT,
  requires_proof BOOLEAN DEFAULT false
);

-- User tasks
CREATE TABLE user_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  completed_at TIMESTAMP,
  proof_data JSONB,
  UNIQUE(user_id, task_id)
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  started_at TIMESTAMP NOT NULL,
  ended_at TIMESTAMP,
  duration_seconds INTEGER,
  start_photo_url TEXT,
  end_photo_url TEXT,
  start_latitude DECIMAL(10,8),
  start_longitude DECIMAL(11,8),
  end_latitude DECIMAL(10,8),
  end_longitude DECIMAL(11,8),
  exp_earned INTEGER DEFAULT 0
);

-- Milestones
CREATE TABLE milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gem_threshold INTEGER UNIQUE NOT NULL,
  title TEXT NOT NULL,
  prize_name TEXT,
  prize_description TEXT,
  icon TEXT
);

-- User milestones
CREATE TABLE user_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP DEFAULT now(),
  claimed BOOLEAN DEFAULT false,
  UNIQUE(user_id, milestone_id)
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_milestones ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- User tasks: users can read/update their own
CREATE POLICY "Users can read own tasks" ON user_tasks
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON user_tasks
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON user_tasks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Sessions: users can read/insert/update their own
CREATE POLICY "Users can read own sessions" ON sessions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- User milestones: users can read/update their own
CREATE POLICY "Users can read own milestones" ON user_milestones
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own milestones" ON user_milestones
  FOR UPDATE USING (auth.uid() = user_id);
```

---

## 🚀 10. Cursor Implementation Steps

### Step 1: Initialize Project (Done)

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"
npm install @supabase/supabase-js @supabase/ssr
```

### Step 2: Set Up Supabase Clients

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Server Component — middleware handles refresh
          }
        },
      },
    }
  )
}
```

Create `src/middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect to login if not authenticated and not on auth pages
  const isAuthPage = request.nextUrl.pathname.startsWith('/login') ||
                     request.nextUrl.pathname.startsWith('/setup')
  if (!user && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

### Step 3: Build Login Page

**Figma:** [node-id=1-27](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=1-27)

**Logic:**
- Input: invitation code
- Transform to email: `{code}@mvp.local`
- Password = same code
- Call `signInWithPassword`
- Check profile for nickname → redirect accordingly

### Step 4: Build Setup Page

**Figma:** [node-id=3-78](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=3-78)

**Logic:**
- Nickname input (required)
- Avatar upload (optional) → Vercel Blob
- Update `profiles` table
- Nickname cannot be changed later

### Step 5: Build Dashboard

**Figma:** [node-id=11-3679](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=11-3679)

**Components:**
1. **Session Timer:** Start/Pause/End with environmental check
2. **Milestone Path:** Visual road with markers + progress bar
3. **Today's Tasks:** 3-5 tasks with EXP/Gem display

### Step 6: Build Remaining Pages

- `/tasks` — Full categorized task list
- `/milestones` — Visual path with all markers
- `/shop` — Prize grid (unlocked/locked)
- `/community` — GPS + photo upload
- `/resources` — OneDrive links

### Step 7: Seed Data

Insert tasks from `task_exp.csv` into `tasks` table.
Insert milestones into `milestones` table.

---

## 📦 11. Deployment (Vercel)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `BLOB_READ_WRITE_TOKEN`
4. Deploy

---

## ✅ 12. Ready for Cursor

Copy this entire document into a `PROJECT_PLAN.md` file in your project root. Then in Cursor:

1. **Open Composer** (`Cmd+I` / `Ctrl+I`)
2. **Enable Plan Mode** (`Shift+Tab`)
3. **Prompt:** *"Follow the PROJECT_PLAN.md to build the MILESTONE app. Start with Step 3 (Login Page) and work through each step sequentially."*

Cursor will now build the app step by step following this plan. 🚀