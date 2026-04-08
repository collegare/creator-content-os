# Creator Content OS V2 by Collegare Studio

A premium content strategy operating system for creators who want to stop posting randomly and start building a content business with intention.

---

## What's New in V2

V2 transforms Creator Content OS from a content planner into a full strategy operating system:

- **Strategy Intelligence Engine** — rules-based analytics that score your strategy health, analyze your content mix, and generate personalized insight cards from your actual data
- **Content Analyzer** — 15 content types, 10 analysis categories, built-in concept generator
- **Performance Tracker** — multi-platform stat tracking with Chart.js visualizations (line + stacked bar)
- **Monetization Hub** — 6 revenue streams with stage-based readiness scoring and personalized roadmap
- **Quarterly Plan** — goal setting across 6 areas with snapshot metrics
- **Upgraded Prompt Studio** — categorized prompts with filtering
- **Settings & Data** — creator profile, platform connection architecture (future-ready), JSON export/import
- **V1 → V2 Migration** — existing data carries over automatically

---

## File Structure

```
creator-content-os/
├── index.html        — Full app structure, all 9 sections and modals
├── styles.css        — Complete design system (Collegare Studio brand)
├── script.js         — All interactive functionality, localStorage persistence, Chart.js
├── ARCHITECTURE.md   — What works now vs what needs backend/API integrations
└── README.md         — This file
```

---

## Deploy to Vercel

### Option A: Drag and Drop (fastest)
1. Go to [vercel.com](https://vercel.com) and log in
2. Click **Add New → Project**
3. Choose **Import** or drag-and-drop the `creator-content-os` folder
4. Vercel auto-detects it as a static site — no build settings needed
5. Click **Deploy**
6. Your app is live at `your-project.vercel.app`

### Option B: Via GitHub
1. Push the `creator-content-os` folder to a GitHub repo
2. Go to Vercel → **Add New → Project → Import Git Repository**
3. Select the repo
4. Framework preset: **Other** (static site)
5. Build command: leave blank
6. Output directory: `.` (root)
7. Click **Deploy**

### Option C: Vercel CLI
```bash
npm i -g vercel
cd creator-content-os
vercel
```
Follow the prompts. No build step needed.

---

## Custom Domain

After deploying, go to **Project Settings → Domains** in Vercel and add your custom domain (e.g. `contentos.collegarestudio.com`).

---

## How to Customize

### Colors
Open `styles.css` and edit the CSS variables at the top:
```css
--color-primary:       #6b1309;   /* Main brand color (deep red) */
--color-primary-hover: #8b2114;   /* Hover state */
--color-primary-light: #f3e8e6;   /* Light tint for backgrounds */
--color-bg:            #eeede9;   /* Page background (cream) */
--color-text:          #2d2926;   /* Body text + sidebar bg */
```

### Typography
The app uses **Be Vietnam Pro** from Google Fonts. To change it, update the `<link>` tag in `index.html` and the `font-family` in `styles.css`.

### Branding Text
- Sidebar brand: search for `Creator Content OS` and `by Collegare Studio` in `index.html`
- Footer: search for `sidebar-footer-text` in `index.html`
- Page titles and subtitles: each section's `page-title` and `page-subtitle` in `index.html`

### Content & Prompts
All prompt text, workflow steps, strategy data, and monetization streams are defined as JavaScript arrays at the top of their respective sections in `script.js`. Edit the text directly.

---

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full breakdown of:
- What is fully functional now (everything in the static release)
- What requires backend, APIs, or auth (social sync, AI analysis, accounts)
- Recommended architecture path: Static → Edge Functions + DB → Full SaaS
- Data model mapping from localStorage to future database tables

---

## Tech Stack
- Pure HTML, CSS, JavaScript (no frameworks, no dependencies)
- Chart.js 4.4.1 (CDN) for data visualizations
- Google Fonts (Be Vietnam Pro)
- Phosphor Icons (lightweight icon set)
- localStorage for data persistence
- Static deployment — works on any hosting platform

---

## V3 Roadmap

1. **Instagram API Integration** — auto-pull post performance, follower count, reach, saves
2. **TikTok Analytics Sync** — auto-populate views, watch time, trending data
3. **YouTube Data API** — subscriber count, video performance, retention metrics
4. **AI-Powered Content Analyzer** — paste a link for automated analysis powered by Claude AI
5. **Content Calendar View** — visual drag-and-drop calendar across platforms
6. **Team Collaboration** — invite team members, assign content, leave comments
7. **PDF/CSV Export** — export plans, performance data, and reviews
8. **Notion Integration** — two-way sync with Notion databases
9. **Smart Recommendations** — AI suggestions for what to post next
10. **Backend + Auth** — user accounts, cloud sync, multi-device access
11. **Mobile App** — native mobile experience for on-the-go planning

---

Built with intention by Collegare Studio.
