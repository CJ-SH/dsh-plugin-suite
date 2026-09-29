/**
 * Host-half self-check. Dependency-free: the two readers are asserted against hostile and absent
 * inputs, and `apply` runs against a hand-built cordis context stub so the no-throw contract and
 * the trust fence are measured rather than assumed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const results = []
const check = (label, actual, expected) => {
  results.push({ label, ok: JSON.stringify(actual) === JSON.stringify(expected), actual, expected })
}

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const m = await import('../lib/index.js')

// ── provider status ─────────────────────────────────────────────────────────────────────

const usable = { available: () => true }
const unusable = { available: () => false }
const explosive = { available: () => { throw new Error('nope') } }

check('providers: an absent seam reports nothing', m.providerStatus(undefined, 'search'), [])
check('providers: a non-Map registry reports nothing', m.providerStatus({ searchProviders: [] }, 'search'), [])
check('providers: search ids come back sorted with their availability',
  m.providerStatus({ searchProviders: new Map([['searxng', usable], ['deepseek-official', unusable]]) }, 'search'),
  [{ id: 'deepseek-official', available: false }, { id: 'searxng', available: true }])
check('providers: the fetch registry is read separately',
  m.providerStatus({ searchProviders: new Map([['searxng', usable]]), fetchProviders: new Map([['jina', usable]]) }, 'fetch'),
  [{ id: 'jina', available: true }])
// `available()` belongs to another plugin; a throw must be reported as that provider being
// unusable rather than escaping into the hub's answer.
check('providers: a throwing available() is reported, not propagated',
  m.providerStatus({ searchProviders: new Map([['boom', explosive]]) }, 'search'),
  [{ id: 'boom', available: false }])
check('providers: a provider with no probe says so with null, not false',
  m.providerStatus({ searchProviders: new Map([['opaque', {}]]) }, 'search'),
  [{ id: 'opaque', available: null }])

// ── preset status ───────────────────────────────────────────────────────────────────────

check('presets: an absent registry is "unknown", which is not "empty"', m.presetStatus(undefined), { known: false, ids: [] })
check('presets: a throwing registry is "unknown"', m.presetStatus({ list: () => { throw new Error('x') } }), { known: false, ids: [] })
check('presets: a non-array answer is "unknown"', m.presetStatus({ list: () => 'nope' }), { known: false, ids: [] })
check('presets: string entries are accepted',
  m.presetStatus({ list: () => ['ptc', 'standard'] }), { known: true, ids: ['ptc', 'standard'] })
check('presets: object entries are read by id and sorted',
  m.presetStatus({ list: () => [{ id: 'ptc-bash' }, { id: 'minimal' }, { id: 'ptc' }] }),
  { known: true, ids: ['minimal', 'ptc', 'ptc-bash'] })
check('presets: blank ids are dropped',
  m.presetStatus({ list: () => ['ptc', '', { id: 7 }] }), { known: true, ids: ['ptc'] })

// ── the assembled board ─────────────────────────────────────────────────────────────────

const board = m.buildStatus({
  web: { searchProviders: new Map([['searxng', usable]]), fetchProviders: new Map([['jina', usable]]) },
  agentPresets: { list: () => [{ id: 'ptc' }] },
})
check('board: search and fetch are reported', [board.search, board.fetch],
  [[{ id: 'searxng', available: true }], [{ id: 'jina', available: true }]])
check('board: a missing ptc-bash preset is visible', [board.presets.known, board.ptcBashPreset], [true, false])
check('board: a declared ptc-bash preset is reported',
  m.buildStatus({ agentPresets: { list: () => [{ id: 'ptc-bash' }] } }).ptcBashPreset, true)
// The distinction the page renders differently: no registry at all must not read as
// "the registry is fine and simply does not list ptc-bash".
check('board: an unreadable registry never claims the preset is missing',
  [m.buildStatus({}).presets.known, m.buildStatus({}).ptcBashPreset], [false, false])

// ── apply must not throw, and must fence ────────────────────────────────────────────────

function fakeContext() {
  const registered = { routes: [], injections: [] }
  const state = { connection: { requestRejection: () => undefined } }
  const ctx = {
    effect: (fn) => {
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    inject: (deps, callback) => {
      registered.injections.push(deps[0])
      callback({
        effect: ctx.effect,
        web: { searchProviders: new Map([['searxng', usable]]), fetchProviders: new Map() },
        agentPresets: { list: () => [{ id: 'ptc' }] },
      })
    },
    get: (name) => (name === 'connection' ? state.connection : undefined),
    webServer: {
      register: (route) => {
        registered.routes.push(route)
        return () => {}
      },
    },
  }
  return { ctx, state, registered }
}

const applied = fakeContext()
let applyError = null
try {
  m.apply(applied.ctx, {})
} catch (error) {
  applyError = error
}
check('apply: does not throw on a well-formed context', applyError, null)
check('apply: takes the two status sources as soft injections', applied.registered.injections, ['web', 'agentPresets'])
check('apply: owns exactly one exact route',
  applied.registered.routes.map((route) => `${route.kind} ${route.path}`), ['exact /plugin-suite/status'])

// The handler closes over the row's own context, so the fence is driven through the fake context.
function invoke({ method = 'GET', rejection = undefined, noSeam = false } = {}) {
  const answer = { status: undefined, headers: undefined, body: undefined }
  applied.state.connection = noSeam ? undefined : { requestRejection: () => rejection }
  applied.registered.routes[0].handler({ method }, {
    writeHead: (status, headers) => { answer.status = status; answer.headers = headers },
    end: (body) => { answer.body = body },
  })
  return answer
}

const ok = invoke()
check('route: an allowed GET answers 200', ok.status, 200)
check('route: the answer is JSON', ok.headers['content-type'], 'application/json; charset=utf-8')
check('route: the answer is never cached', ok.headers['cache-control'], 'no-store')
check('route: the answer carries the status board', JSON.parse(ok.body).value.search, [{ id: 'searxng', available: true }])
check('route: a non-GET is refused with Allow', (() => {
  const refused = invoke({ method: 'POST' })
  return [refused.status, refused.headers.allow]
})(), [405, 'GET'])
check('route: the fence is asked before anything is served', invoke({ rejection: 403 }).status, 403)
// An unauthenticated status route would leak which providers exist; refuse rather than serve.
check('route: a composition without the fence seam answers 503', invoke({ noSeam: true }).status, 503)

// A route that cannot register must degrade, not throw.
const realConsoleError = console.error
console.error = () => {}
const broken = fakeContext()
broken.ctx.webServer = { register: () => { throw new Error('duplicate path') } }
broken.ctx.inject = () => { throw new Error('no such service') }
let brokenError = null
try {
  m.apply(broken.ctx, {})
} catch (error) {
  brokenError = error
}
check('apply: degrades instead of throwing when every surface is unavailable', brokenError, null)
console.error = realConsoleError

// ── packaging contract ──────────────────────────────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
check('manifest: the bundle id is the package name', manifest.name, 'dsh-plugin-suite')
check('manifest: the loader patch is declared', manifest.dsh.bundle.patch, './cordis.patch.yml')
check('manifest: the browser half is exported', manifest.exports['./client'], './lib/client.js')
// dsh 0.2 denies a row whose gated peer range the runtime does not satisfy, so this field is the
// compatibility gate rather than decoration.
check('manifest: the runtime peer is pinned to the 0.2 line', manifest.peerDependencies['@deepseek-ai/dsh'], '^0.2.0-rc.1')
check('manifest: display metadata ships with the plugin',
  [manifest.icon, manifest.exports['./locale/*.json'], manifest.files.includes('locale')],
  ['./icon.svg', './locale/*.json', true])

const patchText = readFileSync(join(packageDir, 'cordis.patch.yml'), 'utf8')
check('patch: inserts exactly the plugin row',
  /- insert:\s*\n\s*- id: plugin-suite\s*\n\s*name: 'dsh-plugin-suite'/.test(patchText), true)
check('patch: widens no shipped row', patchText.includes('- id: connection'), false)

const failed = results.filter((entry) => !entry.ok)
for (const entry of failed) {
  console.log('FAIL  ' + entry.label)
  console.log('      actual:   ' + JSON.stringify(entry.actual))
  console.log('      expected: ' + JSON.stringify(entry.expected))
}
console.log(`host: ${results.length - failed.length}/${results.length} assertions passed`)
process.exitCode = failed.length === 0 ? 0 : 1
