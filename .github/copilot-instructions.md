# Fisabil – AI Coding Agent Instructions

## Project Overview
Fisabil is a **React Native (Expo SDK 54)** Arabic-learning app with TypeScript. It uses **Expo Router** (file-based routing), **Supabase** (auth, Postgres, Edge Functions), and **OpenAI APIs** (GPT-4o for OCR/tutor, TTS). The app runs on iOS and Android.

## Architecture & Data Flow
- **Local-first**: All data saves to `AsyncStorage` first, then syncs to Supabase when online. Never block UI on network calls.
- **Sync hooks**: `useSyncManager` (local↔cloud sync) and `useOfflineQueue` (queued actions replayed on reconnect) in `hooks/`.
- **Supabase tables**: `scans`, `vocabulary`, `vocab_cards_progress`, `folders`, `dictations`, `audio_tracks`, `ai_cache`. All use RLS — every query filters by `auth.uid() = user_id`.
- **Edge Functions** (`supabase/functions/`): `extract-vocab`, `add-diacritics`, `tutor-chat`, `verify-store-receipt`. Written in **Deno** with `serve()` pattern. Deploy with `supabase functions deploy <name>`.
- **Context providers** wrap the app in `app/_layout.tsx`: `SubscriptionProvider` → `VoicePreferenceProvider` → `AudioPlaylistProvider` → `LanguageProvider` → `ThemeProvider`.

## Key Conventions

### Routing
- `app/(tabs)/` — main tabs: Scanner (`index.tsx`), Library, Playlist, Tutor, Revision, Settings, Statistics, Subscription
- `app/(auth)/` — auth flow: `login.tsx`, `forgot-password.tsx`, `verify-otp.tsx`, `reset-password.tsx`, `verify-email.tsx`
- Auth guard lives in `hooks/use-auth.ts` — redirects unauthenticated users to `/(auth)/login`

### Internationalization
- All user-facing strings use `t('key.path')` from `useLanguage()` hook. Never hardcode UI text.
- Translations live in `constants/translations.ts` as a single nested object keyed by language code (`fr`, `en`, `de`, `es`, `ru`, `ms`, `ar`). French is the primary/default language.
- When adding a feature, add translation keys for **all 7 languages**.

### Styling
- Inline `StyleSheet.create()` per component — no external style library (no NativeWind/Tamagui).
- Primary green: `#2F6B3D` / `#2E7D32`. Backgrounds are `transparent` (mosque image background in root layout).
- All screens wrap in `KeyboardAvoidingView` with platform-specific behavior (`'padding'` on iOS, `'height'` on Android).

### Environment Variables
All prefixed with `EXPO_PUBLIC_`:
- `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_GOOGLE_VISION_API_KEY`

### Subscription & Daily Limits
- Free tier has daily limits (5 tutor messages, 2 dictations, 1 scan). Premium has none.
- Use `useSubscription()` + `useDailyLimit(featureKey, limit)`. Check `hasFeatureAccess()` before gated actions.
- Bypass limits when `subscription.plan === 'premium_monthly' || 'premium_annual'`.

### Hooks Pattern
- Custom hooks in `hooks/` follow `use-<feature>.ts` naming (kebab-case files, camelCase exports).
- Supabase client imported as `import { supabase } from '@/src/lib/supabase'` — always use the `@/` path alias.
- Debug logging uses `if (__DEV__) console.log(...)` with emoji prefixes (🔐, 📡, ✅, ⚠️, etc.).

## Development Workflow
```bash
npm install              # Install dependencies
npx expo start --clear   # Start dev server (clears cache)
npx expo run:ios         # Native iOS build
npx expo run:android     # Native Android build
```

### Supabase
```bash
supabase start                           # Local dev
supabase functions deploy extract-vocab  # Deploy single edge function
supabase db push                         # Apply migrations
```
Migrations are numbered sequentially in `supabase/migrations/` (e.g., `01_create_vocabulary_table.sql`).

### Production Builds
```bash
eas build --platform ios --profile production
eas submit --platform ios --latest
```
EAS profiles: `development` (debug), `preview` (internal APK), `production` (app-bundle/release).

## File Organization
| Path | Purpose |
|------|---------|
| `src/lib/` | Service modules: Supabase client, OCR, vocabulary extraction, email, OTP |
| `src/utils/` | Utilities: logger, OpenAI TTS |
| `hooks/` | React hooks for all features |
| `contexts/` | React context providers (subscription, audio, voice) |
| `constants/` | Theme colors, translations (3700+ lines) |
| `components/` | Shared UI components |
| `supabase/functions/` | Deno Edge Functions (each in its own folder) |
| `supabase/migrations/` | SQL migration files |
