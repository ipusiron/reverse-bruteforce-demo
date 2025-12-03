# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an educational web-based demonstration tool that visualizes the difference between traditional brute-force attacks and reverse brute-force attacks (password spraying) against account lockout policies. The tool is designed purely for educational purposes to help understand attack patterns and defense strategies.

## Architecture

The application is a static single-page web application with:
- **index.html**: Main HTML structure with simulation controls, attack mode tabs, and results display
- **script.js**: Core simulation logic implementing both attack modes and environment generation
- **style.css**: Light-themed styling with CSS variables and gradient accents

Key components in script.js:
- **Environment Simulation** (`makeEnvironment()`): Creates virtual users with weak/strong passwords and implements account lockout mechanisms via a simulated server object
- **Attack Modes**:
  - Brute-force (`#btnRunBF`): Sequential password generation (aaaaaaaa, aaaaaaab...) targeting single user
  - Dictionary attack (`#btnRunDict`): Uses `COMMON_PASSWORDS` array against single user
  - Reverse brute-force (`#btnRunRBF`): Tests common passwords across all users in rounds
- **Real-time Visualization**: Progress bars, KPI metrics, activity logs with smart auto-scroll

Password assignment logic (line 28-49): User ID 0 gets a brute-force-crackable password (~4200 attempts), other weak users get dictionary passwords starting from index 2.

## Development Commands

This is a static website with no build process required. To run locally:

```bash
# Open directly in browser
start index.html  # Windows
open index.html   # macOS

# Or serve with any static server
python -m http.server 8000
# Then navigate to http://localhost:8000
```

For GitHub Pages deployment, the site is automatically served from the main branch.

## Security Context

This is an educational security demonstration tool. When working with this codebase:
- The tool simulates attacks but does not perform actual authentication attempts
- All "attacks" are against a locally simulated environment created in JavaScript
- The demonstration is designed to educate about password spraying/reverse brute-force techniques and their defenses
- No actual credentials or real systems are involved