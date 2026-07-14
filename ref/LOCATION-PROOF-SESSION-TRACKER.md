# LOCATION-PROOF-SESSION-TRACKER.md

## Project Summary
#### We are building a system where mobile users submit their exact GPS coordinates and a live compressed photo to prove they are at a specific location. The system tracks session consistency (start, stop, duration) using a secure anti-cheat server clock baseline to verify how long the user remains at the verified location. Administrators can see these submissions pop up as clickable pins on an interactive live map.

---

## ⚙️ Core Architecture & Anti-Cheat Mechanics

1. **Anti-Cheat Time Synchronization:** To prevent users from altering their device system clocks, the application establishes a true baseline by fetching the initial `createdAt` session timestamp and the current time (`serverNowTime`) directly from Vercel's server.
2. **Monotonic Browser Ticking:** The frontend calculates the initial elapsed seconds and increments the live clock using `performance.now()` instead of `Date.now()`. This forces the timer to stay perfectly accurate even if the local device time is manually changed while looking at the page.
3. **Location Consistency Tracking:** When a session starts or stops, the current location coordinates are cross-checked to evaluate consistency against the starting coordinates to confirm the user has remained on-site for the duration of the session tracking interval.

---

## 🛠️ Step-by-Step Implementation Guide

### 1. External Infrastructure Setup
* **Database (Supabase):** Create a table called `location_proofs` with columns for `latitude` (decimal), `longitude` (decimal), `photo_url` (text), and `created_at` (timestamp). Maintain a `sessions` table tracking `userId` and `createdAt` profiles.
* **Storage (Vercel Blob):** Activate Vercel Blob in your project storage dashboard to obtain a read/write token.
* **Environment Variables:** Bind `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `BLOB_READ_WRITE_TOKEN` to your Vercel deployment.

### 2. Backend Server & API Setup (Next.js App Router)
* **Secure Time Dispatch:** Query user session intervals from the database and inject server timestamps directly into the page layer to establish a unified baseline.
* **File Handling Endpoint:** Configure an API handler with a disabled default body-parser to allow binary multipart images to stream efficiently.
* **Storage Upload & Entry:** Pass image binaries to Vercel Blob using `put()`, then store the returned public link alongside floating-point GPS coordinates inside the Supabase table.

### 3. Frontend User Interface Logic
* **GPS Lock:** Request high-accuracy positions using `navigator.geolocation.getCurrentPosition`.
* **Camera Capture:** Trigger the smartphone's native rear-facing camera instantly utilizing `<input type="file" capture="environment" accept="image/*">`.
* **Canvas Compression:** Downscale raw incoming images via an HTML5 `<canvas>` component to 75% quality to reduce 10MB payloads below 1MB, preventing Vercel function payload errors.
* **Transmission & Clock:** Pack spatial data and compressed blobs into a `FormData()` payload for submission, while running the custom monotonic state interval to display active tracking time.

### 4. Admin Map Dashboard
* **Data Fetching:** Establish a secure GET endpoint returning all data logs from the `location_proofs` table.
* **Map Rendering:** Mount a **Leaflet.js** map container in your admin dashboard.
* **Pin Dropping:** Map across rows to drop markers at verified coordinates, configuring popup bubbles containing custom `<img>` elements linking to the uploaded storage graphics.
