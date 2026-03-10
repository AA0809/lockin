# LockIn App — Project Status & Handoff Document

## Overview
LockIn is a personal self-improvement tracking app built with React/Vite + Supabase. The user is a high-level guitarist who plays technical styles (metal, Polyphia-style). Final form is a web app + Android APK (via Capacitor). Currently in active development, running locally at localhost:5175.

## Tech Stack
- **Frontend**: React + Vite, Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Routing**: Custom tab-based navigation (no React Router)
- **Deployment target**: Web + Android via Capacitor (future)

## Design System
- Clean, minimal, sharp corners (no border-radius)
- Font: Inter
- Colors: #111 (primary), #999 (secondary text), #ebebeb (borders), #f9f9f9 (backgrounds)
- No excessive formatting, no emojis
- Consistent component patterns across all modules

## File Structure
```
src/
  components/
    gym/
      ActiveSession.jsx
      GymHistory.jsx
      PresetManager.jsx
    guitar/
      GuitarShared.jsx       — shared components and helpers
      Practice.jsx           — practice session logging
      Repertoire.jsx         — song library
      Techniques.jsx         — technique tracking
      spotify.js             — Spotify API service
    ui/
      SubTabs.jsx            — subtab component (expects {id, label}[] + activeTab/setActiveTab props)
  pages/
    GymPage.jsx
    GuitarPage.jsx
  lib/
    supabase.js
  App.jsx
```

## App Navigation
Top-level modules: Home, Gym, Guitar, Study, Projects, Guitar (more planned).
Each module has SubTabs. SubTabs component API:
```jsx
<SubTabs tabs={[{id: 'practice', label: 'Practice'}]} activeTab={tab} setActiveTab={setTab} />
```

---

## MODULE 1: GYM (Complete)

### Features
- **Presets**: Create/edit/delete workout presets with exercises. Strength exercises have default set count. Cardio exercises have target type (time/distance) and target value stored in hrs+min format (total minutes in DB).
- **Active Session**: Start from preset or freeform/cardio. Timer removed (unreliable in background). Timestamp-based duration not implemented for gym (not needed — gym logs work vs time).
- **History**: Sessions sorted recent first. Filter by All/Cardio/Freeform/preset name. Expandable detail view.

### Exercise Categories
- `weights` — requires reps AND weight (decimals allowed). Min value 1.
- `calisthenics` — requires reps only, no weight field
- `treadmill` — duration (hrs+min), speed OR distance (mutually exclusive), incline optional
- `distance` — duration, distance required
- `timeonly` — duration only

### Duration Input Pattern (Gym + Guitar)
Separate hrs and mins integer inputs. Stored as total minutes in DB.
Speed and distance mutually exclusive for treadmill (selecting one clears the other).

### Database Tables (Gym)
- `workout_presets` (id, user_id, name)
- `preset_exercises` (id, preset_id, name, category, order_index, default_sets, target_type, target_value)
- `workout_sessions` (id, user_id, preset_id, name, date)
- `session_exercises` (id, session_id, name, category, order_index)
- `exercise_sets` (id, session_exercise_id, set_number, reps, weight_kg, completed)
- `cardio_entries` (id, session_exercise_id, duration_minutes, distance_km, speed, incline)
- `exercise_library` (id, user_id, name, category) — auto-populated on save

### Known Issues / TODO
- Stats tab not yet built (deferred)
- Weekly schedule with visual reminders (future)

---

## MODULE 2: GUITAR (Partially Complete — Active Development)

### Subtabs
1. **Practice** — session logging with blocks
2. **Repertoire** — song library
3. **Techniques** — technique tracking

### GuitarPage.jsx
```jsx
const TABS = [
  { id: 'practice', label: 'Practice' },
  { id: 'repertoire', label: 'Repertoire' },
  { id: 'techniques', label: 'Techniques' },
]
```

---

### Practice Tab

#### Session Flow
- Start session → timestamp recorded in `guitar_sessions.started_at`
- "Session Active" pill visible (no clock shown — no pressure)
- Pause/Resume — tracks paused time in refs, subtracts from total
- End session → summary modal with total time (calculated from timestamps), star rating (1-5), one-line review
- Blocks saved on session end

#### Block Types
1. **Song** — mini setlist. Multiple song entries per block. Each entry: song picker, part picker (if song has parts), BPM + percentage (mutually auto-fill based on target BPM), technique tags (auto-populated from selected part's technique_tags, editable), notes.
2. **Exercise** — exercise picker (search/create inline from `guitar_exercises` table), BPM, technique tags (from `guitar_techniques` table), notes.
3. **Creative** — style tags (from `style_tags` table), freeform notes. For improvisation, riff writing, composition. No BPM, no pressure.
4. **Theory** — topic (freeform text), technique tags, summary notes (rich text area for what you learned). These theory notes appear in Techniques tab under the tagged technique.

#### Key Behaviour
- Technique tags on song entries are saved to `exercise_technique_tags` — so practicing a song part logs technique practice too
- When session saved, song BPM auto-updates if new BPM is higher than stored `current_bpm`
- Part BPM also auto-updates

#### Database Tables (Guitar Sessions)
- `guitar_sessions` (id, user_id, date, started_at, ended_at, paused_seconds, total_minutes, rating, review_notes)
- `practice_blocks` (id, session_id, block_type, started_at, ended_at, duration_minutes, notes, order_index)
- `block_song_entries` (id, block_id, song_id, part_id, bpm, percentage, notes)
- `block_exercise_entries` (id, block_id, exercise_id, bpm, notes)
- `exercise_technique_tags` (id, exercise_entry_id, technique_id) — used for BOTH exercise blocks AND song entries (song entries reuse this table)
- `theory_technique_tags` (id, block_id, technique_id)
- `creative_style_tags` (id, block_id, style_tag_id)

---

### Repertoire Tab

#### Song Cards
Grouped into banners: **Learning / Part Learned / To Learn / Learned**

Banner is DERIVED from parts (not the raw `songs.status` field):
```js
function getSongDisplayStatus(song) {
  const parts = song.song_parts || []
  if (parts.length === 0) return { banner: song.status, inProgress: false }
  const allLearned = parts.every(p => p.status === 'learned')
  const anyLearning = parts.some(p => p.status === 'learning')
  const someLearned = parts.some(p => p.status === 'learned')
  if (allLearned && song.full_song_learned) return { banner: 'learned', inProgress: false }
  if (allLearned && !song.full_song_learned) return { banner: 'part_learned', inProgress: false }
  if (someLearned && anyLearning) return { banner: 'part_learned', inProgress: true }
  if (someLearned) return { banner: 'part_learned', inProgress: false }
  if (anyLearning) return { banner: 'learning', inProgress: true }
  return { banner: 'to_learn', inProgress: false }
}
```

"In Progress" marker shown on card when any part is actively being learned.
Filter by difficulty label and style tags.

#### Adding a Song
Two-step modal:
1. Search Spotify (or "+ Add manually")
2. Full form: title/artist (pre-filled), target BPM (manual — Spotify audio-features API was deprecated for client credentials in 2024, so BPM must be entered manually), status, difficulty, style tags, parts with technique tags

#### Spotify Integration
- `src/components/guitar/spotify.js`
- Client credentials flow (no user login needed)
- Env vars: `VITE_SPOTIFY_CLIENT_ID`, `VITE_SPOTIFY_CLIENT_SECRET`
- Used for: song search, cover art, artist/album metadata
- BPM fetch (`getTrackBPM`) returns null — Spotify deprecated audio-features for this auth flow
- `openInSpotify(spotifyId)` — deep links to Spotify app on mobile, web on desktop

#### Song Detail View
- Cover art, title, artist, album, style tags, Spotify link
- Status (manual override) + derived display status from parts
- Difficulty: Comfortable / Challenging / Stretch (text, not integer)
- Stats: date started, date learned, session count
- BPM: target + current with percentage
- Parts list with status per part, technique tags, dates
- Full Song checkbox (unlocks when all parts learned — moves to Learned banner)
- Persistent notes (editable)
- Practice history (chronological list of logged sessions)

#### Parts System
- Parts are optional
- Each part has: name, status (to_learn/learning/learned), current_bpm, target_bpm, date_learned, technique_tags (jsonb array of {id, name})
- No "Full Song" as a part — instead a `full_song_learned` boolean on the song
- Default part name suggestions: Intro, Main Riff, Solo, Everything But Solo, Verse Riff, Bridge, Chorus
- Completely freeform naming also allowed ("Bars 1-16", "Up to the solo", etc.)
- Techniques tagged per part auto-populate when that part is selected in a practice session

#### Difficulty System
- Values: `comfortable`, `challenging`, `stretch` (text column)
- NOT integer — if DB shows integer type, run: `alter table songs drop column difficulty; alter table songs add column difficulty text check (difficulty in ('comfortable', 'challenging', 'stretch'));`

#### Database Tables (Songs)
- `songs` (id, user_id, title, artist, album, cover_art_url, spotify_id, target_bpm, current_bpm, status, difficulty TEXT, full_song_learned BOOLEAN, songsterr_url, notes, date_started, date_learned)
- `song_parts` (id, song_id, name, status, current_bpm, target_bpm, date_learned, technique_tags JSONB)
- `style_tags` (id, user_id, name)
- `song_style_tags` (id, song_id, style_tag_id)
- `guitar_techniques` (id, user_id, name, personal_notes)
- `guitar_exercises` (id, user_id, name, description)

#### Required SQL Fixes (run if not done)
```sql
alter table songs drop column if exists difficulty;
alter table songs add column difficulty text check (difficulty in ('comfortable', 'challenging', 'stretch'));
alter table songs add column if not exists full_song_learned boolean default false;
alter table song_parts add column if not exists technique_tags jsonb default '[]';
```

---

### Techniques Tab

#### Layout
Two sections:
1. **Techniques** — each technique card shows: name, last practiced date, best BPM, personal coaching note. Left border color: neutral if recent, amber if >14 days since last practice.
2. **Creative Practice** — style tags with total time logged and session count.

#### Technique Detail View
- Personal notes (editable, persistent)
- Exercise history (exercise name, date, BPM)
- Theory sessions (date, duration, summary notes from theory blocks)
- BPM history over time

#### Style Detail View
- All creative blocks tagged with this style
- Date, duration, notes for each session

---

## KNOWN BUGS (as of handoff)

### Active
1. **BPM not auto-filling from Spotify** — Spotify deprecated `audio-features` endpoint for client credentials auth. `getTrackBPM()` now returns null. BPM must be entered manually. The form shows "fetching..." momentarily then leaves BPM blank. This is expected behaviour now.

2. **`block_song_entries` 400 errors** — Fixed in latest Repertoire.jsx by changing the select query to explicit columns rather than `*` with nested relation.

3. **Song detail showing wrong status** — Fixed: status picker shows raw DB status (manual override), with a separate "Display:" line showing the derived status from parts. The two were conflated before.

4. **Style tags not appearing in filter** — Fixed: TagInput for style_tags added to AddSongModal form, and style tags now saved on song creation.

---

## MODULES NOT YET BUILT

### Study Module
- Session timer, subject tracking
- Planned but not started

### Projects Module
- Task management, deadlines
- Planned but not started

### Home Dashboard
- Overview of all modules
- Weekly stats, plan, friends feed, goals
- Planned but not started

---

## FUTURE PLANS

### Capacitor/Android Build
- Wrap entire app as native Android APK
- Will enable background timers, native Spotify deep links
- iOS support also planned (user has friends on iPhone)
- Spotify developer app registered with Web API + Android + iOS

### Theory & Creative Tools (Separate App)
- NOT part of LockIn
- Separate tool for theory knowledge base and creative assistance
- LockIn is purely for tracking, not for learning tools

### Guitar Stats
- Deferred — needs data to be meaningful
- Will fold into Home dashboard eventually
- Show: total practice time this week/month, song status breakdown, technique coverage

---

## IMPORTANT CONVENTIONS

### Supabase RLS
All tables have RLS enabled. All policies check `auth.uid() = user_id` or join up to user_id through relations. Always add RLS policies when creating new tables.

### Component Patterns
- No separate CSS files — all Tailwind inline
- Modals use `fixed inset-0 bg-black/30 z-50` overlay
- Number inputs always include: `[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`
- All dates stored as ISO strings, displayed with `toLocaleDateString('en-GB', ...)`
- Duration always stored as total minutes (integer), displayed as X h Y min

### SubTabs API
```jsx
// CORRECT:
<SubTabs tabs={[{id: 'tab1', label: 'Tab 1'}]} activeTab={activeTab} setActiveTab={setActiveTab} />
// WRONG (old pattern, causes invisible tabs):
<SubTabs tabs={['Tab 1']} active={active} onChange={setActive} />
```

### Spotify Notes
- Only client credentials flow — no user OAuth
- Search and metadata work fine
- Audio features (BPM) deprecated for this auth type as of 2024
- Cover art comes from `track.album.images[1]` (medium size)
- Deep link pattern: `spotify:track:{id}` on mobile, `https://open.spotify.com/track/{id}` on desktop

---

## CURRENT STATE SUMMARY
- Gym module: feature complete for MVP, minor stats tab missing
- Guitar Practice tab: built, needs full end-to-end testing
- Guitar Repertoire tab: built, several bugs fixed in latest version
- Guitar Techniques tab: built, needs testing once practice data exists
- All other modules: not started
