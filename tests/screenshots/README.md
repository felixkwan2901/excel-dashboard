# Screenshot tests

Every page of the dashboard, dark and light, on a laptop (1440×900) and a phone
(iPhone 13), compared pixel for pixel with the baselines in `__screenshots__/`.
A sticky column that stops sticking, a header that shrinks or a table that
grows past its box shows up as a diff.

    npm run test:screens            # build, then compare with the baselines
    npm run test:screens:update     # build, then accept what's on screen now as the new baselines
    npx playwright show-report      # after a failure: side-by-side diffs

What's held still so a diff means the code changed:
- the data: `fixtures/` is a frozen copy of the public data files (update it
  deliberately with `npm run test:screens:fixtures`, then update the baselines);
- the clock (1 Oct 2026, noon NZ), so "last updated" and "this month" don't move;
- the upload worker (not signed in, every KV key empty) and the weather (none);
- the clock and weather widgets are masked.

Baselines are per OS (`-darwin` vs `-linux` in the file name is handled by
Playwright's project folders): the CI workflow (`screenshots.yml`) generates and
commits Linux baselines the first time it runs, and compares after that. After a
deliberate look change, refresh the Linux set with
`gh workflow run screenshots.yml -f update=true`. On a
Mac, run `npm run test:screens:update` once to create the local set.
