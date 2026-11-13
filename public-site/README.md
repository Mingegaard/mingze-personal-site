# M.GAO public website

Canonical website: [gaomingze.com](https://gaomingze.com/).

This is the standalone GitHub Pages entry point. It reuses the personal site's React chat, profile, guestbook, styles, logo, ASCII sharks, and click ripples without starting Harness or exposing local administration.

From this directory:

```sh
npm ci
npm run dev
npm run build
```

The development server uses `http://127.0.0.1:4173`; `dist/` is the static publish output. `base: './'` supports both the custom domain root and a GitHub Pages repository subdirectory. The application uses hash routes for Profile and Guestbook so deep links work without server rewrites.

Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in the browser configuration. Chat and guestbook requests go through the shared guestbook API client's cloud functions. Model credentials and the system prompt stay on the server.

`public/profile-usage.json` may contain a deliberately published usage snapshot. Its default value is `null`, so the profile honestly shows unavailable statistics instead of importing local account information or demonstration usage.

Projects and chat history remain in the current browser. Appearance, language, and sidebar state are also stored locally. Guestbook messages and replies are stored in Supabase.
