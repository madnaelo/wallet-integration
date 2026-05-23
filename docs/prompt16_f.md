# Prompt 16: Keep Token Menus Above Quote Panels

The destination token dropdown can overlap the trade summary area on desktop.
When it opens, the menu must remain visually above the trade summary widget so
the user can search and choose tokens without the panel covering the menu.

## Scope

- Preserve the existing token picker behavior and layout.
- Give an open token picker an explicit stacking state.
- Ensure the swap form panel stacks above the trade summary panel while menus
  are open.
- Keep the fix CSS-focused unless a small component class hook is needed.
- Verify both source and destination token pickers on desktop-width layouts.

## Safety Guidance

- Do not use extreme global z-index values that could cover modals.
- Do not change token search, ranking, or quote logic while fixing layering.
- Do not make the trade summary unclickable except where an open token menu is
  intentionally above it.
