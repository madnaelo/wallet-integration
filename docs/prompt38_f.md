# Prompt 38 - CI/CD Deployment Hardening And Security Gate Fixes

## Product Need

After pushing the production PWA work, automatic deployment must be trustworthy:
frontend deploy, backend build/publish/deploy, CI, and security gates should all
run cleanly on every push without hiding real security issues or failing on
private-repository tooling limitations.

## Prompt

Push the latest frontend and backend changes, verify the automatic GitHub
Actions deployment pipeline, inspect any failed CI/security/deployment jobs, and
fix the underlying causes. Keep the deployment model production-grade: do not
weaken security gates just to make checks green, and do not expose secrets in
logs, commits, or documentation.

## Implementation Guidance

- Pull failing GitHub Actions logs and identify concrete root causes before
  editing.
- Keep frontend and backend checks separate enough that one failure does not
  hide another.
- Ensure backend Web Push dependencies compile in CI and packaged Docker images.
- Treat dependency and image vulnerability scan failures as real until proven
  otherwise.
- Use a narrow allowlist only for known public blockchain identifiers that
  secret scanners flag as false positives.
- Keep blocking Trivy scans readable in logs; generate SARIF only when GitHub
  code scanning is enabled.
- Verify locally with frontend lint, backend tests, secret scanning, filesystem
  vulnerability scanning, backend Docker build, and backend image scanning.
- Commit and push the remediation, then watch the automatic deployment runs.
