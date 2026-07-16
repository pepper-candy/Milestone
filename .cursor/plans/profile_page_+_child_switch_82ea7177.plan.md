---
name: Profile page + child switch
overview: Add a Figma-aligned Profile page (mentor/mentee UI wording) with avatar/nickname editing, invitation codes, linked accounts, and a parent child-selector that persists and drives which child dashboard is shown.
todos:
  - id: add-selected-child-column
    content: Add Supabase migration/schema update for profiles.selected_child_code + parent default backfill
    status: completed
  - id: profile-api
    content: Extend profile API to return linked accounts/selection and update nickname-avatar-selected child
    status: completed
  - id: profile-page-ui
    content: Implement Figma-based /profile UI with mentor/mentee labels and highlighted selected child card
    status: completed
  - id: dashboard-link
    content: Make dashboard header avatar/name navigate to /profile
    status: completed
  - id: subject-filter
    content: Scope parent dashboard subjectUserIds to selected child in user-tasks resolver
    status: completed
  - id: sync-verify
    content: Verify parent-child selection, role views, and cross-device session/task behavior
    status: completed
isProject: false
---

# Implement Profile Page and Parent Child Selector

## Goal
Build a profile screen opened from the dashboard header avatar/name area, matching the Figma design, with:
- mentor/mentee labels in UI (while keeping existing parent/child data model)
- editable nickname + profile photo
- invitation code display and linked mentor/mentee lists
- parent child selection (highlighted chosen card) that controls which single child dashboard is shown

## Implementation Plan

1. **Add persistent selected-child field in Supabase**
- Create migration (new file in `supabase/`) to add `profiles.selected_child_code TEXT NULL`.
- Backfill for parents: if null and `linked_children` non-empty, set first child code.
- Keep using invitation codes for consistency with current schema (`linked_children` / `linked_parents` are text code arrays).
- Update schema snapshot in [`supabase/schema.sql`](supabase/schema.sql) accordingly.

2. **Create profile API surface for read/update**
- Extend [`src/app/api/profile/route.ts`](src/app/api/profile/route.ts) to support:
  - `GET`: return viewer profile plus resolved linked children/parents with nickname/avatar/invitation code and current selected child.
  - `POST`/`PATCH`: update nickname/avatar URL and (for parents) `selected_child_code` with validation that code is in `linked_children`.
- Reuse existing auth and nickname validation pattern already in this route.

3. **Build new profile page UI route**
- Add [`src/app/(dashboard)/profile/page.tsx`](src/app/(dashboard)/profile/page.tsx) and client component(s) under `src/components/profile/`.
- Implement Figma structure from [design node](https://www.figma.com/design/e9Z4kLmfppdgUiY23yw6WK/Untitled?node-id=25-72&t=kUIN77soApnCQhSP-1):
  - top section: role badge + invitation code block(s)
  - linked cards list:
    - parent UI labels: **Mentor / Mentee**
    - selected child card has highlighted border
  - profile edit card: avatar upload + nickname edit and save action
- Keep data semantics unchanged (`is_child`, `linked_children`, `linked_parents`) but map copy text to mentor/mentee.

4. **Wire dashboard header click-through**
- In [`src/components/dashboard/DashboardClient.tsx`](src/components/dashboard/DashboardClient.tsx), make avatar/name region clickable and route to `/profile`.
- Preserve existing drag/progress behavior; only header profile cluster gains navigation interaction.

5. **Apply selected-child filtering to dashboard data loading**
- Update subject resolution in [`src/lib/user-tasks.ts`](src/lib/user-tasks.ts):
  - for parents, if `selected_child_code` exists and valid, return only that child id in `subjectUserIds`.
  - fallback to first linked child when no selection is set.
- This makes tasks/session logs/active session all scoped to one chosen child through existing dashboard loaders.

6. **Keep live sync behavior coherent**
- Ensure family sync subscription in [`src/components/dashboard/DashboardClient.tsx`](src/components/dashboard/DashboardClient.tsx) uses current single selected child subject id.
- On profile selection change, trigger refresh/navigation so dashboard rehydrates with the new child context.

7. **Verification pass**
- Parent flow:
  - open profile from header
  - see linked mentees
  - select a different mentee (highlighted border)
  - return to dashboard and confirm tasks/sessions reflect only that mentee
- Child flow:
  - profile shows mentor links and own invitation code
  - nickname/avatar update persists
- Session behavior:
  - single-child scoped active session still works across devices for selected child

## Key Files
- [`src/components/dashboard/DashboardClient.tsx`](src/components/dashboard/DashboardClient.tsx)
- [`src/lib/user-tasks.ts`](src/lib/user-tasks.ts)
- [`src/app/api/profile/route.ts`](src/app/api/profile/route.ts)
- [`src/app/(dashboard)/profile/page.tsx`](src/app/(dashboard)/profile/page.tsx) (new)
- [`src/components/profile/*`](src/components/profile/) (new)
- [`supabase/schema.sql`](supabase/schema.sql)
- `supabase/<new migration>.sql` (new)
