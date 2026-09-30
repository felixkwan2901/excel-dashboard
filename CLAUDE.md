# Cassidy-Davies dashboard — notes for Claude

- **Completed jobs / Completed insights / Monthly claims work:** read `docs/HANDOFF-completed-jobs.md` first. The numbers there were settled with the owner line by line — change how things look, not what they calculate.
- Ask before pushing, deploying, or running `wrangler deploy`. The owner sets secrets themselves; never ask for one in chat.
- Local preview (`npx vite --port 5199 --strictPort`) uses the real KV and workers — don't change dropdowns or upload while testing.
