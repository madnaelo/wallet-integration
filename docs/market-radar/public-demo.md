# Synthetic Public Demo

/demo#market-radar uses RadarDemo, RadarView and hand-authored marketRadarDemo
fixtures. It does not import collector, engine, exchange adapters, database, wallet
or execution code. Demo preflight's exact dependency allowlist enforces that
boundary; type-only normalized interfaces introduce no runtime dependency.

Three illustrative SOL/USDT scenes show supply score84 ->67 ->43 as price
approaches and supply is consumed. Four illustrative venues with three confirming
are synthetic display data, not claims about actual markets. Sample alerts live
only in React state and disappear on reload. Play/pause respects reduced-motion
styling; users may choose a scene directly.

The demo remains noindex with strict existing CSP (including connect-src none).
No fetch/XHR/WebSocket, storage, wallet access, provider credentials, transactions,
orders or fees are introduced. Same-origin static scripts/images/styles are
necessary page assets, not live market calls.

Browser tests assert these properties at1440,390 and320 pixels, explanations,
state changes, ephemeral alert behavior and no horizontal overflow. Existing
swap-demo/contact tests remain part of the suite. See verification.md for results.
