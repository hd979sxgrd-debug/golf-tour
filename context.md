# Project Context – Golf Scorer

- Full-stack golf scoring app (React + Netlify Functions + Neon PostgreSQL)
- Frontend: Vite + React + TailwindCSS
- Backend: Netlify Functions (TypeScript) — connects to Neon Postgres via `pg` and `NETLIFY_DATABASE_URL`
- Current schema: players, teams, courses, matches, hole_scores

## Recent progress
- Match input and view pages implemented
- Saving scores to DB works (score.ts fixed to handle GET + POST)
- ScoringPage acts as adapter between MatchInputPage and MatchViewPage
- UI for MatchViewPage working correctly
- PublicBoard (public view) still shows incorrect team scores — needs fix

## Outstanding issues
1. PublicBoard shows wrong or outdated scores.
2. Need to refine mobile-friendly layout for input/view.
3. Add live refresh or polling for public view.
4. Review database consistency: ensure hole_scores joins correctly by player_id.
