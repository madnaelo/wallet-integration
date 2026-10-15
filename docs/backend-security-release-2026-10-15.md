# Backend Release Gate: October 15, 2026

## Trigger And Scope

PR #58 passed its CI and security checks, was authorized for merge/release, and
merged as `41e77b0118fc1f6379b62bb9f657ca8937a6c91b`. Master CI
[38748292818](https://github.com/madnaelo/wallet-integration/actions/runs/38748292818)
and Security [38748293017](https://github.com/madnaelo/wallet-integration/actions/runs/38748293017)
passed. Release [38748751948](https://github.com/madnaelo/wallet-integration/actions/runs/38748751948)
stopped at the backend container scan, before staging or changing production.

The scan found CVE-2026-107227/CVE-2026-107230 in Async HTTP Client 2.16.1
and CVE-2026-47884/CVE-2026-47890 in Spring MVC 6.2.19. This is dependency
exposure, not proof of an exploited application. Spring classifies its two
advisories as MEDIUM/LOW, while the scanner reports CRITICAL. The documented
XsltView/SSE fragment preconditions are not implemented by this REST application.
We retain the release gate rather than suppressing the advisories.

## Resolution

- Spring Boot 4.0.8 manages patched Framework 7.0.9. Override its default Tomcat
  11.0.24 with the current same-series patch 11.0.27: the new PR runtime gate
  correctly caught CVE-2026-65182/CVE-2026-65905/CVE-2026-68525 in that default
  container version before merge. The official
  Framework 6.2.20 fix is enterprise-only; no paid support was purchased. Use the
  supported Boot baseline, not Framework 7 forcibly inserted into Boot 3.
- Keep Java 17 and existing JSON/provider/persistence contracts. Use Boot's
  Jackson 2 compatibility module and patched Jackson 2.21.7. Explicitly select
  Jackson 2 for HTTP converters and exclude Jackson 3 starters. This is a
  transitional supported compatibility bridge, not a permanent Jackson 3 migration.
  A future Jackson 3 migration needs signed-payload and persisted-JSON regression
  testing, not an automated package-name substitution.
- Use the modular MVC, REST-client and Flyway starters. Retain every existing
  migration unchanged. Move private error settings to `spring.web.error`.
- Exclude unused Async HTTP Client (and its Netty tree) from web-push. Inspection
  of the actual 5.1.2 bytecode confirms our `PushService.sendAsync` path uses Apache
  HttpAsyncClient with its close callback, not `PushAsyncService`. Encryption,
  VAPID signing, timeout handling and device-expiry behavior remain unchanged.
- Enforcer prevents accidental reintroduction of Async HTTP Client or Jackson 3
  into this compatibility build. No vulnerability exception is added.
- Run the backend runtime-image scan in PR CI as well as the release job; the
  earlier source-only security job did not catch these packaged dependencies.

## Regression Evidence

New tests cover MVC JSON-node round trips, exact large amount strings/decimals,
ISO timestamps, malformed/invalid request rejection, auto-configured provider
client decoding and production configuration keys. No application component scan,
developer configuration imports, database or external provider is used by these
compatibility tests.

Local `mvn verify`: 234 cases, 216 passed and 18 isolated-database cases skipped;
SpotBugs reported zero findings. Those skipped cases must run in hosted CI's
disposable PostgreSQL database. Local Docker was not running, so the new hosted
runtime-image gate is required rather than claiming a local container scan.

Push tests generate ephemeral test keys and send encrypted requests only to a
loopback fixture, checking 201 delivery, 410 endpoint disabling, AES128GCM/VAPID
headers and absence of the excluded client. No real browser notification or
email is sent. Existing backend, isolated PostgreSQL/Flyway, frontend, browser,
security and release gates must all pass for the final revision; PR/release
receipts retain those exact results.

## Official References

- [Spring CVE-2026-47884](https://spring.io/security/cve-2026-47884/)
- [Spring CVE-2026-47890](https://spring.io/security/cve-2026-47890/)
- [Boot 4 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
- [JSON compatibility documentation](https://docs.spring.io/spring-boot/4.0/reference/features/json.html)
- [Async HTTP Client releases](https://github.com/AsyncHttpClient/async-http-client/releases)
- [Tomcat 11 security fixes](https://tomcat.apache.org/security-11.html)

Provider policy, revenue evidence, commercial terms, regulatory records, private
Radar permissions, contact persistence and production rollback protections are
not changed by this repair.
