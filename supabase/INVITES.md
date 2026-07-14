# Creating invite users (Supabase Auth)

For each invitation code (example CHILD-994):

1. Authentication → Users → Add user
2. Email: `child-994@mvp.local` (lowercase code + @mvp.local)
3. Password: exact invitation code as users will type it (e.g. `CHILD-994`)
4. Auto Confirm User: ON
5. User Metadata (raw JSON):

Child:
```json
{
  "is_child": true,
  "linked_parents": ["PARENT-111"],
  "nickname": "",
  "invitation_code": "CHILD-994"
}
```

Parent:
```json
{
  "is_child": false,
  "linked_children": ["CHILD-994"],
  "nickname": "",
  "invitation_code": "PARENT-111"
}
```

6. After creating the auth user, insert a matching row into `profiles`
   (or let the app upsert on first login).

Also turn OFF "Confirm email" under Authentication → Providers → Email.

Optional: Single session per user (may require Pro).
