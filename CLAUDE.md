# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Reverse Brute-force Demo is an educational tool that compares, in one virtual environment in the browser, how brute force, dictionary attacks and password spraying (reverse brute force) fare against defenses like account lockout. It runs entirely client-side against a group of virtual users and does not connect to any real system. It is part of the "100 Security Tools with Generative AI" series (Day 060).

## Architecture

A static single-page app with plain scripts (no build, no dependencies, no CDN):

```
index.html            # Settings, three attack tabs, help modal; meta CSP is 'self' only
style.css             # Color tokens for light/dark (OS setting or manual), layout, responsive
js/rbf-core.js        # RbfCore: COMMON_PASSWORDS (50), LIMITS, mulberry32, bruteForcePassword,
                      #   makeEnvironment (seeded, tryLogin with lockout, now injected),
                      #   bruteForcePlan / dictionaryPlan / reverseBrutePlan (+ totals), validate
js/messages.js        # RbfMessages: ja/en dictionary (t), HELP (how the help modal is built)
js/i18n.js            # RbfI18n: language detection (?lang= -> stored -> navigator), data-i18n
js/theme.js           # RbfTheme: light/dark toggle
js/theme-init.js      # Applies the saved theme before drawing
js/app.js             # UI only: APG tabs, help modal (focus move/trap/restore), seed, runBF/runDict/runRBF
test/                 # node --test (core, html, messages, i18n, contrast, format, readme)
```

## Key Implementation Details

- The three attacks differ by whether they concentrate on one user (brute force, dictionary) or spread across many (password spraying). This is why account-level lockout works against the first two but not the third
- Password spraying tries each user once per round; if rounds < threshold, no account reaches the lockout threshold, so it slips past lockout
- `reverseBrutePlan` actually shards: `span = min(batch, userCount)` users per round, rotating by round. Smaller `batch` means fewer attempts (200 users x 3 rounds: batch 200 -> 600, batch 20 -> 60)
- Weak users: user 0 gets a brute-force-findable password (BF_TARGET_INDEX = 4200, 'aaaaagfo'); users from 1 get the top of the dictionary (dict[0] = '123456'); the rest get strong passwords (seeded, not in the dictionary). No `Math.random` in app.js
- Dictionary of 50 common passwords from rockyou / NCSC Top 100,000 bundled in SecLists (MIT)
- Facts align with primary sources: lockout alone cannot stop spraying (NIST SP 800-63B Rev.4 asks for throttling and blocklists of leaked/common passwords, not composition rules); MITRE ATT&CK T1110.003 (spraying) vs T1110.004 (credential stuffing); 26^8 ~= 208.8 billion, and "21 seconds" is an offline, unlimited-guessing framing
- Tabs follow WAI-ARIA APG (id, aria-controls, aria-selected updated, arrow keys, roving tabindex); the help modal has role="dialog", aria-modal, focus move in, trap, and restore on close
- Static text is in `js/messages.js`; HTML holds the Japanese defaults with `data-i18n`. Rendering uses textContent only. localStorage (language, theme) is read/written inside try/catch

## Development Commands

```bash
npm test                      # node --test, Node.js 22+, no dependencies
python -m http.server 8000    # then open http://localhost:8000/ (file:// also works)
```

## Important Notes

- Educational simulation that runs entirely in the browser; unauthorized access to real systems is illegal
- No real authentication happens; the attempt rate and elapsed time are a rough representation
- Deployed via GitHub Pages: https://ipusiron.github.io/reverse-bruteforce-demo/
