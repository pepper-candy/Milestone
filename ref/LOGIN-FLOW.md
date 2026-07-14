# LOGIN-FLOW.md

## ⚙️ How It Works (The Background Mechanism)

1. **The Code is the Key:** The user types a unique invitation code (e.g., CHILD-994). Your website code automatically turns this into an email format by appending `@mvp.local` directly after the code (e.g., `child-994@mvp.local`).
2. **Strict Log-In Only (No Auto-Creation):** The app attempts to log the user in using this dynamically formatted email string and the invitation code as the password. Any unregistered code is rejected instantly with an "Invalid code" error.
3. **Pre-Configured Profiles (Multi-Parent Metadata):** You manually create all user accounts in advance. During creation, relationships are embedded directly into the account metadata using an array of invitation codes, keeping permissions tamper-proof:
   * **For a Child:** `{"is_child": true, "linked_parents": ["PARENT-111", "PARENT-222"], "nickname": ""}`
   * **For a Parent:** `{"is_child": false, "linked_children": ["CHILD-994"], "nickname": ""}`
   * **First-Time Trigger:** Upon successful login, the app checks if nickname is empty. If it is, the app pauses and prompts the user to set their own nickname right there on the screen and update back to database. A welcome message is followed.

## 🔒 Device Locking & Session Lifespan

* **Stay Logged In Forever:** Once logged in, Supabase saves the token in the phone's browser storage. The user can close the browser or turn off the phone, and they will stay logged in without ever re-entering the code.
* **The Single-Device Lock:** In the Supabase dashboard, you turn on "Single session per user". If a second device (like a laptop) logs in using that same invitation code, the original phone is instantly kicked out with a prompt and logged out.

## 🚀 What You Need to Configure in Supabase

* Turn **OFF** "Confirm email" under *Authentication > Providers > Email*.
* Turn **ON** "Single session per user" (or "Log out other sessions") in the *Authentication* settings.