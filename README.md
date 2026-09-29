# dsh-plugin-suite

One Settings page that gathers the **configuration panels** of this workspace's self-made plugins.

Nothing else. The page owns no capability of its own, and — deliberately — performs **no request of
its own**, so it has no failure path: whatever the plugins contribute is what it renders.

## Why it exists

dsh 0.2 changed where a plugin's configuration lives, and every failure in that migration was
silent: a row whose `apply()` throws is only a boot-log warning, a renamed seat simply never
renders, and a preset that stopped being discovered stays on disk looking correct. `npm test` stayed
green through all of it.

This package is the "one place" half of the answer. The other half — noticing when something is
*not* there — is the boot log's job, and the spec in `.trellis/spec/guides/dsh-0.2-plugin-contract.md`
records what to check after every dsh upgrade.

## How plugins join

The page registers one Settings navList entry (`settings.section`, id `my-plugins`) and declares one
child list slot:

```js
children: { 'plugin-suite.panel': { kind: 'list', scope: 'root' } }
```

A plugin detects that slot and hands its panel over:

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

## What was cut

An earlier revision also carried a status board — provider availability and declared presets, fed by
the host half's `GET /plugin-suite/status`. That route still exists, is read-only, is fenced like the
sibling plugins' routes, and was verified returning correct data:

```json
{ "search": [{ "id": "searxng", "available": true }],
  "fetch":  [{ "id": "jina", "available": true }, { "id": "http", "available": true }] }
```

The board was removed anyway: it was this page's only failure path, and a management surface that
renders "unavailable" — or worse, a *misleading* "service unavailable" — on a healthy workspace costs
more than the information is worth. Hang it back on the route when there is a reason to.

## Install

Already selected in the `web` profile. `dsh: plugin tree failed to load` on the row means the range
in `peerDependencies` does not match the running dsh — that gate is intentional.

Do **not** install these bundles with `dsh plugin --profile web add`: verify the profile's
`dsh.profile.bundles` afterwards, because that path has been observed leaving the selection in a
state the next boot reports as `did not activate`. The plugin manager (GUI, or `install_bundle`)
returns `application` and `warnings` for the operation itself — read those.

## Verify

```sh
npm test
```

`test/host.test.mjs` drives the status readers against hostile inputs (an absent seam, a non-`Map`
registry, a provider whose `available()` throws) and the route through its real contract: fence, then
method, then answer. `test/client.test.mjs` loads the bundle through a stubbed module loader and runs
`apply` against a slot registry that models the real declaration lifetime — a stub that invokes the
inject callback unconditionally is what hides a renamed seat, so this file does not use one, and it
asserts that `apply` contributes **nothing** when no seat is declared.
