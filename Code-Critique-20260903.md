# Claude Code on Foundry EZDeploy: Code Critique

Date: September 3, 2026

Scoring: 10 means implement promptly; 1 means do not implement.

This document records the recommendations that are not part of the active planning exercise. Items 2, 4, and 6 are intentionally excluded because they are being developed into implementation plans.

## 1. Engine defaults versus wizard recommendations

**Score:** 4/10  
**Current status:** Not implemented; the `lean` and `full` compatibility profiles remain supported and documented.

The engine profiles are explicitly a legacy compatibility path, while the wizard already generates exact `--model` selections. Changing legacy profiles whenever recommendations change would undermine their compatibility purpose, but retaining them indefinitely creates maintenance and messaging overhead. Deprecate profiles, direct all new users toward exact selections, and remove profiles only in a future major release.

## 3. Launcher and engine version coupling

**Score:** 9/10  
**Current status:** Not implemented; there is no launcher/engine compatibility constant, tag, GitHub release, or changelog.

Separately downloaded launchers and engines currently have no compatibility contract, making version skew a real reliability risk. Add a schema-version constant to the wizard-generated launcher and engine, with an explicit mismatch error rather than an eventual unknown-argument failure. Publish tagged releases containing matching wizard, engine, and catalog artifacts, supported by a concise changelog and compatibility policy.

## 5. ShellCheck

**Score:** 7/10  
**Current status:** Not implemented; CI currently runs Bash syntax checks and regression tests but not ShellCheck.

The Bash engine is large and performs quoting-sensitive array, JSON, REST, and script-generation work that `bash -n` cannot meaningfully analyze. Introduce ShellCheck incrementally, beginning with checked-in Bash and narrowly documented exclusions for intentional heredoc expansion. Extend it to generated installers after the fake-Azure deployment fixture produces those files, rather than assuming source-only linting covers generated code.

## 7. Wizard test architecture

**Score:** 4/10  
**Current status:** Not implemented; the current Node test slices the inline script at `renderModelCards();` and uses a hand-built DOM mock.

The current test harness is brittle because it depends on a literal initialization boundary and a narrowly mocked DOM. Moving directly to jsdom would add npm dependencies, a lockfile, package installation, browser API polyfills, and ongoing dependency maintenance, so it is not a zero-install change. First expose explicit initialization and pure rendering functions for testing; adopt jsdom or browser automation later only if meaningful DOM behavior remains untested.

## 8. Wizard UX, README, and hosting

**Score:** 7/10  
**Current status:** Partially implemented; the wizard has responsive styling and safety disclosures, but still uses `alert()`, retains `scoutTheme`, has no screenshot or concise five-step quick start, and is not hosted on GitHub Pages.

Implement inline field-associated validation, rename `scoutTheme` to `theme` with temporary backward compatibility, and add a five-step README summary near the top. A maintained screenshot is useful but optional because model cards and warnings will change as catalog metadata evolves. Defer GitHub Pages until launcher/engine version coupling, tagged releases, catalog provenance, and prominent unofficial-project warnings are in place, then deploy Pages only from versioned release artifacts rather than mutable `main`.

## 9. Gitleaks and secret scanning

**Score:** 9/10  
**Current status:** Not implemented; the repository uses a custom regex scan that excludes tests and workflow files.

The current hand-maintained scan covers too few credential patterns and excludes locations where committed secrets would still be exposed. Add Gitleaks with full-history scanning, a pinned action version, read-only permissions, and a narrow allowlist for demonstrated test fixtures. Retain the lightweight targeted scan temporarily because it provides fast project-specific checks while Gitleaks supplies broader maintained detection.

## 10. Installer SHA-256 logging

**Score:** 3/10  
**Current status:** Not implemented; generated installers download to temporary files and execute them without logging a digest.

Calculating a hash after download records artifact identity but does not verify authenticity without an independently trusted expected digest or signature. Logging it could support retrospective troubleshooting, but it must not be presented as an integrity guarantee. Defer this until Anthropic publishes signed installers or trusted checksums, or add it only as explicitly labeled audit metadata.
