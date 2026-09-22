# Draft message to the manager

Plain language, no jargon. Copy the block below into an email. Square
brackets are yours to fill in or cut.

Two things it deliberately does:
- Leads with the tool and the plan, not with an apology. The exposure is
  stated plainly in the middle, without drama.
- Asks for specific, small decisions rather than "what do you think?"

---

**Subject:** Operations dashboard — moving it onto Cassidy-Davies systems

Hi [name],

The operations dashboard has become something the team actually uses, so I
want to get it set up properly rather than leaving it on my own accounts.

Right now the whole thing runs on personal infrastructure — my web domain,
my GitHub account, my Cloudflare account. That was fine while it was a
prototype, but it means two things I'm not comfortable with: the company's
job and financial data sits on a student's personal setup, and if my access
ever lapses the tool goes with it.

I'd like to move it onto Cassidy-Davies systems:

- It would live at an address on the company domain, something like
  dashboard.cassidydavies.co.nz, linked from the website
- Access would need a login — I'd add whoever you nominate, and you'd
  control that list rather than me
- The company would own the account it runs on, so it keeps working
  regardless of who maintains it

One thing you should know while I'm setting this up. When I reviewed the
security properly, I found the dashboard and its underlying spreadsheet were
reachable by anyone who had the web address — no password. That included job
costs and margins, and a set of Profit & Loss exports. I have no reason to
think anyone found it, but I can't prove that either, and you should hear it
from me rather than not at all.

I've already closed the part that let anyone send data *into* the system.
The remaining piece — stopping people reading it — is exactly what the move
above fixes, so I'd like to do it soon rather than patch around it.

To get started I'd need:

1. Someone with access to the Cassidy-Davies domain settings, to point the
   new address at it (a few minutes of their time)
2. Whether the company has a Cloudflare account, or wants one set up — it's
   free at the level we need
3. The names and email addresses of who should be able to log in

Happy to walk through it in person or show you how it works.

[your name]

---

## If asked "how bad was it?"

Straight answers, no hedging:

- **What was reachable:** the dashboard page, the job workbook (job numbers,
  names, costs, margins), and archived Profit & Loss exports.
- **How long:** the repository has been public since July 2026.
- **Any sign someone accessed it?** No evidence either way — static hosting
  of this kind keeps no visitor logs. Assume it was possible, not that it
  happened.
- **Was anything changed or lost?** No. Data flowed one way and the workbook
  history is intact.
- **What is fixed now:** the write path — nobody can send data in or alter
  what the dashboard shows.
- **What is not:** the read path — the address still serves the file to
  anyone who has it. Fixed by the move, or immediately by taking the
  dashboard offline if they would rather.

## If they want it offline today

One command, reversible, takes about a minute. The tool stops working for
everyone until the move is done. Offer it — it should be their call, not a
decision made for them.
