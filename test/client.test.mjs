/**
 * Browser-half self-check. The bundle is loaded through a stubbed module loader, and `apply` runs
 * against a slot registry that models the REAL declaration-lifetime contract of `slots.inject` —
 * the callback runs only while the slot declaration is live. A stub that invokes the callback
 * unconditionally is what hides a seat that dsh renamed, so this file does not use one.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const results = []
const check = (label, actual, expected) => {
  results.push({ label, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected })
}

const packageDir = fileURLToPath(new URL('..', import.meta.url))

// ── bundle contract ─────────────────────────────────────────────────────────────────────

const requested = []
let registration = null
globalThis.window = {
  __ModuleLoader__: {
    load: (value) => {
      registration = value
    },
  },
}
// Node 24 defines `navigator` as a getter-only global, so it has to be redefined rather than set.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true })

const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
await import('../lib/client.js')

check('bundle: registers under the package name', registration.id, manifest.name)
check('bundle: the factory is callable', typeof registration.factory, 'function')

const reactStub = {
  createElement: (type, props, children) => ({ type, props, children }),
  useCallback: (fn) => fn,
  useEffect: () => {},
  useState: (initial) => [initial, () => {}],
}

const exported = registration.factory((specifier) => {
  requested.push(specifier)
  if (specifier === 'react') return reactStub
  throw new Error(`unexpected require: ${specifier}`)
})

check('bundle: requires only react', requested, ['react'])
check('bundle: exports apply and inject', [typeof exported.apply, Array.isArray(exported.inject)], ['function', true])
check('bundle: declares the services it reads',
  ['slots', 'locale'].every((name) => exported.inject.includes(name)), true)

// ── slot registration ───────────────────────────────────────────────────────────────────

function makeHarness({ declared = [] } = {}) {
  const seats = []
  const injectors = []
  const locales = []
  const live = new Set(declared)
  const api = {
    declare(name) {
      if (live.has(name)) return
      live.add(name)
      for (const entry of injectors) {
        if (entry.key === name && entry.disposer === undefined) entry.disposer = entry.callback() ?? (() => {})
      }
    },
    cellsIn: (name) => seats.filter((seat) => seat.options.name === name),
  }
  const ctx = {
    slots: {
      inject: (key, callback) => {
        const entry = { key, callback, disposer: undefined }
        injectors.push(entry)
        if (live.has(key)) entry.disposer = callback() ?? (() => {})
        return () => {
          if (entry.disposer !== undefined) entry.disposer()
          entry.disposer = undefined
        }
      },
      register: (options, component) => {
        seats.push({ options, component })
        return () => {
          const index = seats.findIndex((seat) => seat.options === options)
          if (index >= 0) seats.splice(index, 1)
        }
      },
    },
    locale: {
      register: (ns, dictionaries) => {
        locales.push({ ns, dictionaries })
        return () => {}
      },
      getLocale: () => ({ active: 'zh' }),
    },
    configForms: { describe: () => [{ ns: 'web-search' }] },
  }
  return { ctx, api, seats, locales }
}

const harness = makeHarness()
let applyError = null
try {
  exported.apply(harness.ctx)
} catch (error) {
  applyError = error
}
check('apply: does not throw', applyError, null)

// The page may not exist before the section slot does — that is why the whole registration,
// including the child declaration, lives inside the injection.
check('seat: nothing is registered before the section slot exists', harness.seats.length, 0)

harness.api.declare('settings.section')
check('seat: exactly one page is registered', harness.seats.length, 1)
const seat = harness.seats[0]
check('seat: it is a Settings navList entry', seat.options.name, 'settings.section')
check('seat: identified by its own id', seat.options.id, 'my-plugins')
check('seat: ordered among the Settings pages', seat.options.order, 140)
check('seat: it carries a locale for its copy', seat.options.locale, 'my-plugins')
check('seat: its nav label resolves', typeof seat.options.label === 'function' ? seat.options.label() : null, '插件配置')
check('seat: registers a component', typeof seat.component, 'function')

// The child slot is the whole integration surface: the sibling plugins wait on THIS declaration
// to hand their panels over, so dropping it silently disables the hub's reason to exist.
check('slot: the page declares the aggregation slot',
  seat.options.children?.['plugin-suite.panel'], { kind: 'list', scope: 'root' })
check('slot: the aggregation slot has no other children',
  Object.keys(seat.options.children ?? {}), ['plugin-suite.panel'])
check('locale: one namespace is registered', harness.locales.map((entry) => entry.ns), ['my-plugins'])
check('locale: both dictionaries are supplied',
  Object.keys(harness.locales[0].dictionaries).sort(), ['en', 'zh'])

const zhKeys = Object.keys(harness.locales[0].dictionaries.zh).sort()
const enKeys = Object.keys(harness.locales[0].dictionaries.en).sort()
check('locale: the dictionaries have identical key sets', zhKeys, enKeys)
check('locale: no dictionary entry is blank',
  Object.values(harness.locales[0].dictionaries.zh).every((value) => typeof value === 'string' && value.length > 0), true)

// ── the page renders the aggregation slot, and nothing else ─────────────────────────────

// The page performs no request of its own: an earlier revision carried a status board fed by the
// host route, and that fetch was the page's only failure path. What is asserted here is that the
// page is now purely a renderer of what the plugins contribute.
const tree = seat.component({ t: (key) => key, renderSlot: (name) => ({ slot: name }) })
// A lone child arrives bare rather than as an array; normalise, so what is asserted is the shape of
// the page rather than the arity of createElement's third argument.
const sections = Array.isArray(tree.children) ? tree.children : [tree.children]
check('page: it renders one section', sections.length, 1)
check('page: that section renders the aggregation slot',
  JSON.stringify(sections[0].children[1]), JSON.stringify({ slot: 'plugin-suite.panel' }))
check('page: it asks for no service that could fail',
  [exported.inject.includes('configForms'), exported.inject.includes('connection')], [false, false])

// ── packaging contract ──────────────────────────────────────────────────────────────────

check('manifest: the browser half is exported', manifest.exports['./client'], './lib/client.js')
check('manifest: the runtime peer is pinned to the 0.2 line', manifest.peerDependencies['@deepseek-ai/dsh'], '^0.2.0-rc.1')

const failed = results.filter((entry) => !entry.ok)
for (const entry of failed) {
  console.log('FAIL  ' + entry.label)
  console.log('      actual:   ' + JSON.stringify(entry.actual))
  console.log('      expected: ' + JSON.stringify(entry.expected))
}
console.log(`client: ${results.length - failed.length}/${results.length} assertions passed`)
process.exitCode = failed.length === 0 ? 0 : 1
