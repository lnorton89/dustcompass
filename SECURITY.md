# Security Policy

Dust Compass is a static, offline-first web app. This policy covers the deployed app at [lnorton89.github.io/dustcompass](https://lnorton89.github.io/dustcompass/) and the current `master` branch. It does not make a promise about support for historical releases or forks.

## Reporting a vulnerability

Please do **not** publish vulnerability details, proof-of-concept code, secrets, personal data, or embargoed coordinates in a public issue.

GitHub private vulnerability reporting is not enabled for this repository. Until a private reporting channel is available, use this fallback:

1. Open a new [GitHub issue](https://github.com/lnorton89/dustcompass/issues/new) titled `Security contact requested`.
2. Include only a request for a private channel—do not include the vulnerability, affected URL, screenshots, logs, coordinates, or reproduction steps.
3. The maintainer will reply with a private way to continue the report.

Once a private channel is established, include a clear description of the impact, affected app or `master` commit, reproduction steps, and any suggested mitigation. Please allow the maintainer reasonable time to investigate and fix the issue before public disclosure.

## What to report

Security reports are especially welcome for issues that could:

- expose an API key, token, build secret, or other credential;
- bypass the data embargo or reveal withheld camp, art, or event coordinates;
- enable cross-site scripting, unsafe deep links, or another way to run untrusted content in the app;
- compromise service-worker behavior, offline-cache integrity, or the delivered static assets;
- compromise dependencies, the build pipeline, or GitHub Pages deployment; or
- expose a person's location, saved places, browsing data, or other private information.

If you are unsure whether something is a security issue, use the process above and request a private conversation.

## Out of scope

General map corrections, usability problems, feature requests, and questions belong in the normal support channels described in [SUPPORT.md](SUPPORT.md). Do not use this process for an operational or medical emergency: Dust Compass is unofficial and is not an emergency service.

## Handling reports

The maintainer will assess the report, coordinate privately where possible, and make a fix or mitigation available when appropriate. Public discussion may follow after affected users have had a reasonable opportunity to update, but no fixed response or disclosure timeline is promised.
