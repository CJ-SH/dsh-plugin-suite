# dsh-plugin-suite design notes

The [README](../README.md) is for people who install and use this page; this file is for anyone
changing it. Every claim here was checked against the repository itself — the source, the two
self-checks and the manifest are the evidence — and facts are stated with the names they have in
code (`settings.section`, `plugin-suite.panel`, `/plugin-suite/status`).

## Contract

### The seat: one Settings navList entry and one aggregation child slot

The browser half registers exactly one seat:

| | |
|---|---|
| slot | `settings.section` (declared by the settings shell) |
| id | `my-plugins` |
| order | `140` |
| label | `插件配置` (zh) / `Plugin Configuration` (en) |
| locale namespace | `my-plugins` |
| children | `{ 'plugin-suite.panel': { kind: 'list', scope: 'root' } }` |

A plugin detects the child slot and hands its panel over:

```js
// Standing on its own by default…
ctx.slots.inject('settings.section', () => {
  mountOwnPage()
  // …and standing down for as long as a hub is installed.
  ctx.slots.inject('plugin-suite.panel', () => {
    dropOwnPage()
    const cell = ctx.slots.register({ name: 'plugin-suite.panel', id, order, label, locale }, Panel)
    return () => { cell(); mountOwnPage() }
  })
})
```

Both registrations sit inside `slots.inject` for the same reason: registering into an **undeclared**
slot throws (`slot "<id>" is not declared`), and that takes the whole browser half down — which the
UI reports only as `did not activate`. The hub watch is nested inside the section watch because
"stand down for the hub" is only a meaningful choice once the page has a seat to stand in.

**This package knows no plugin by name.** Panels arrive from the plugins, so adding one changes
nothing here.

### The route: `GET /plugin-suite/status`

The host half owns one exact route, `ROUTE_PATH = '/plugin-suite/status'`, registered on
`webServer`. It is a pure read: nothing there writes configuration and nothing there decides
policy.

Every answer asks the trust fence first — the same shape the sibling plugins use:

| Situation | Answer |
|---|---|
| `connection.requestRejection(req)` returns a number | that status (`401`/`403`), `cache-control: no-store` |
| the `connection` seam is missing, or `requestRejection` is not a function, or it throws | `503` |
| any non-`GET` method | `405` with `allow: GET` |
| an allowed `GET` | `200`, `content-type: application/json; charset=utf-8`, `cache-control: no-store` |

The fence is asked before the method and before anything is served: an unauthenticated status route
would leak which providers exist and how they are configured. Answering `503` rather than serving
is deliberate when the seam is absent.

The body is `{ ok: true, value: { … } }`:

```jsonc
{
  "search": [{ "id": "searxng", "available": true }],   // sorted by id
  "fetch":  [{ "id": "jina", "available": true }, { "id": "http", "available": true }],
  "presets": { "known": true, "ids": ["minimal", "ptc", "ptc-bash"] },
  "ptcBashPreset": true
}
```

- `search` / `fetch` read `web.searchProviders` / `web.fetchProviders` (a `Map`). A provider's
  `available` is `true`, `false` or `null` — `null` means the provider declares no `available()`
  probe, which is a different fact from "unusable". A probe that **throws** is reported as that
  provider being unusable (`false`), never propagated into the hub's answer; an absent seam or a
  non-`Map` registry reports `[]`.
- `presets` reads `agentPresets.list()`. `known: false` is the honest answer when this composition
  mounts no readable registry at all — deliberately distinct from "the registry is fine and simply
  does not list `ptc-bash`" (`known: true` with the id absent).
- `ptcBashPreset` is `presets.known && presets.ids.includes('ptc-bash')`.

### Why the page no longer shows the status board

An earlier revision also carried a status board — provider availability and declared presets, fed
by the route above. The route still exists, is read-only, is fenced like the sibling plugins'
routes, and was verified returning correct data:

```json
{ "search": [{ "id": "searxng", "available": true }],
  "fetch":  [{ "id": "jina", "available": true }, { "id": "http", "available": true }] }
```

The board was removed anyway: it was this page's only failure path, and a management surface that
renders "unavailable" — or worse, a *misleading* "service unavailable" — on a healthy workspace
costs more than the information is worth. **The page now performs no request of its own**, which is
what makes it failure-free; hang the board back on the route when there is a reason to.

## Operations and troubleshooting

- **Installing this bundle.** It is already selected in the `web` profile. `dsh plugin --profile
  web add` **has been observed leaving the selection in a state the next boot reports as `did not
  activate`**; after any install, verify the profile's `dsh.profile.bundles`. The plugin manager
  (GUI, or `install_bundle`) returns `application` and `warnings` for the operation itself — read
  those.
- **`dsh: plugin tree failed to load` on the row** means the range in `peerDependencies`
  (`@deepseek-ai/dsh: ^0.2.0-rc.1`) does not match the running dsh. That gate is intentional: dsh
  0.2 denies a row whose gated peer range the runtime does not satisfy, rather than mounting a
  plugin whose seats have moved.
- **dsh 0.2 moved where a plugin's configuration lives, and every failure in that migration was
  silent**: a row whose `apply()` throws is only a boot-log warning, a renamed seat simply never
  renders, and a preset that stopped being discovered stays on disk looking correct. `npm test`
  stayed green through all of it. This page is the "one place" half of the answer; the other half —
  noticing when something is *not* there — is the boot log's job, and what to check after every dsh
  upgrade is recorded in the parent workspace's `.trellis/spec/guides/dsh-0.2-plugin-contract.md`.
- **The page is empty.** No plugin has declared into `plugin-suite.panel`, or the child slot
  declaration is gone. The page says so in words (`No plugin has handed a configuration panel to
  this page yet.`) instead of rendering blank.

## Internals

| File | Role |
|---|---|
| `lib/index.js` | Host half. `inject = ['connection', 'webServer']`; `web` and `agentPresets` are deliberately **soft** dependencies read with `ctx.inject` (`providerStatus`, `presetStatus`, `buildStatus`); owns `ROUTE_PATH` and the fence (`refusalOf`). A hub that refused to load without them could never report the one thing it is for — that a capability is missing. `apply` may not throw: a duplicate route path or a failing injection degrades (logged, no status board) instead of taking the plugin tree entry down with it. |
| `lib/client.js` | Browser half. Shipped in the module-loader bundle form (`window.__ModuleLoader__.load`), `react` is the only module requested; client services are `slots` and `locale`. Registers the locale namespace `my-plugins` (zh + en dictionaries, hand-kept fallback by `navigator.language`), then the `settings.section` seat inside `slots.inject`. |
| `cordis.patch.yml` | The bundle patch: exactly one new loader row (`id: plugin-suite`, `name: 'dsh-plugin-suite'`). No shipped row is touched, and `connection`'s `inject` is not widened — the host half registers its own route and asks for the fence per request, so nothing here can be silently taken away by a patch collision. |
| `icon.svg`, `locale/en.json`, `locale/zh.json` | Display metadata the shell reads without activating the plugin. |
| `test/host.test.mjs`, `test/client.test.mjs` | The two self-checks; see below. |

Packaging: `files` ships `lib`, `locale`, `icon.svg`, `cordis.patch.yml`, `README.md`,
`README.zh.md`, `docs`, `LICENSE`. `main`/`exports` point at the host half and `./client` at the
browser half.

Known drift: the `description` field still says the page gathers configuration panels **and a
read-only status board**; the board was cut from the page (the route survives). That field is left
untouched on purpose this round — it changes when the English README rewrite lands.

## Development and verification

No dependencies and no build step: the browser half is written directly in the form the shell
consumes, and the host half imports nothing beyond `node:` builtins.

```sh
npm test
```

which is `node test/host.test.mjs && node test/client.test.mjs`. Both files print
`host: N/M assertions passed` / `client: N/M assertions passed` and set a non-zero exit code on
failure. Run them from a checkout: `files` ships only the runtime artifacts, not `test/`.

- `test/host.test.mjs` drives `providerStatus`/`presetStatus`/`buildStatus` against hostile and
  absent inputs (an absent seam, a non-`Map` registry, a provider whose `available()` throws, a
  provider with no probe, a registry that throws, a non-array listing, blank ids), runs `apply`
  against a hand-built cordis context stub so the **no-throw** contract is measured rather than
  assumed, drives the route through its real contract (fence → method → answer: `200` / `405` +
  `allow` / `403` / `503`), and pins the packaging facts (bundle id = package name, patch path,
  `./client` export, the peer pin, the display metadata, and that the patch inserts exactly the
  plugin row and widens no shipped row).
- `test/client.test.mjs` loads the bundle through a stubbed module loader and runs `apply` against
  a slot registry that models the real **declaration-lifetime** contract of `slots.inject` — the
  callback runs only while the slot declaration is live. A stub that invokes the inject callback
  unconditionally is exactly what hides a renamed seat, so this file does not use one. It asserts
  that nothing is registered before `settings.section` exists; that exactly one page then appears
  with the right id/order/locale/label (`插件配置`); that the aggregation child slot is declared;
  that the two locale dictionaries have identical key sets and no blank entry; and that the page
  renders the aggregation slot and asks for no service that could fail.

## Provenance and license

MIT (the manifest declares `"license": "MIT"`; author `HenTaiCJN`) —
<https://github.com/CJ-SH/dsh-plugin-suite>.
The manifest lists `LICENSE` in `files`, and the file is now present (`MIT License`, © 2026
HenTaiCJN) — it was added during the README task, right after the gap was found. The
npm-publish routes (`dsh plugin --profile web add dsh-plugin-suite` and `npm pack` tgz files) are
not documented in the README: this package is not on npm yet, so only the repository routes are
real.
