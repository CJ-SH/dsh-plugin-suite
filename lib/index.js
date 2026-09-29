/**
 * dsh-plugin-suite — host half.
 *
 * This package owns no capability. It exists so the self-made plugins in this workspace have one
 * place to be looked at: their configuration panels are contributed by the plugins themselves (see
 * the browser half), and the parts that cannot be seen from inside a plugin — which web providers
 * this composition actually registered and whether each one reports itself usable, and which agent
 * presets are declared — are read here and served on one read-only route.
 *
 * Everything on that route is a READ. Nothing here writes configuration, and nothing here decides
 * policy: a plugin's configuration keeps belonging to that plugin's own row, which is what keeps a
 * broken hub from becoming a broken workspace.
 *
 * `web` and `agentPresets` are deliberately SOFT dependencies (`ctx.inject`). A hub that refused to
 * load without them could never report the one thing it is for — that a capability is missing.
 *
 * @module dsh-plugin-suite
 */
export const name = 'dsh-plugin-suite'

/**
 * `webServer` owns the status route; `connection` answers the trust fence every reply asks first.
 * The two status sources are not listed here on purpose — see the module doc.
 */
export const inject = ['connection', 'webServer']

/** The one path this half serves. */
export const ROUTE_PATH = '/plugin-suite/status'

/**
 * Read one provider registry without trusting it.
 *
 * `available()` is the seam's own cheap local probe, so calling it is exactly what a consumer
 * would do — but it belongs to another plugin, so a throw is reported as "unusable" for that
 * provider rather than propagated into the hub's answer.
 *
 * @param web - the web seam, or `undefined` when this composition mounts none.
 * @param kind - which registry to read.
 * @returns one entry per registered provider, sorted by id.
 */
export function providerStatus(web, kind) {
  try {
    const registry = kind === 'search' ? web?.searchProviders : web?.fetchProviders
    if (!(registry instanceof Map)) return []
    return [...registry.entries()]
      .map(([id, provider]) => {
        let available = null
        try {
          available = typeof provider?.available === 'function' ? provider.available() === true : null
        } catch {
          available = false
        }
        return { id: String(id), available }
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  } catch {
    return []
  }
}

/**
 * Read the declared preset ids.
 *
 * `known: false` is the honest answer when this composition mounts no preset registry at all —
 * which is a different fact from "the registry exists and does not list `ptc-bash`", and the page
 * renders them differently.
 *
 * @param agentPresets - the preset registry service, or `undefined`.
 * @returns whether the registry was readable, and the ids it declared.
 */
export function presetStatus(agentPresets) {
  try {
    const declared = typeof agentPresets?.list === 'function' ? agentPresets.list() : undefined
    if (!Array.isArray(declared)) return { known: false, ids: [] }
    const ids = declared
      .map((entry) => (typeof entry === 'string' ? entry : entry?.id))
      .filter((id) => typeof id === 'string' && id.length > 0)
      .sort()
    return { known: true, ids }
  } catch {
    return { known: false, ids: [] }
  }
}

/**
 * Assemble the whole answer.
 *
 * @param sources - the optional services, each `undefined` when this composition mounts none.
 * @returns the read-only status board.
 */
export function buildStatus(sources) {
  const presets = presetStatus(sources?.agentPresets)
  return {
    search: providerStatus(sources?.web, 'search'),
    fetch: providerStatus(sources?.web, 'fetch'),
    presets,
    ptcBashPreset: presets.known && presets.ids.includes('ptc-bash'),
  }
}

/** The trust fence, then method, then the answer — the same order the sibling plugins use. */
function handle(ctx, sources, req, res) {
  const refusal = refusalOf(ctx, req)
  if (refusal !== undefined) {
    res.writeHead(refusal, { 'cache-control': 'no-store' })
    res.end()
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'cache-control': 'no-store' })
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ ok: true, value: buildStatus(sources) }))
}

/**
 * Ask the connection seam whether this request may be served.
 *
 * A composition without that seam is answered `503` rather than served: an unauthenticated status
 * route would leak which providers exist and how they are configured.
 *
 * @returns the status to answer with, or `undefined` to continue.
 */
function refusalOf(ctx, req) {
  try {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.requestRejection !== 'function') return 503
    const rejection = connection.requestRejection(req)
    return typeof rejection === 'number' ? rejection : undefined
  } catch {
    return 503
  }
}

/** Mount the optional status sources and the one route. Nothing here may throw. */
export function apply(ctx) {
  const sources = { web: undefined, agentPresets: undefined }

  // Both are soft: the hub must stay mounted in a composition that lacks one of them, because
  // reporting that absence is the point.
  for (const [key, service] of [['web', 'web'], ['agentPresets', 'agentPresets']]) {
    try {
      ctx.inject([service], (sourceCtx) => {
        try {
          sourceCtx.effect(() => {
            sources[key] = sourceCtx[service]
            return () => {
              sources[key] = undefined
            }
          }, `plugin-suite: ${key} status`)
        } catch (error) {
          console.error(`[plugin-suite] ${key} status unavailable: ${messageOf(error)}`)
        }
      })
    } catch (error) {
      console.error(`[plugin-suite] ${service} injection failed: ${messageOf(error)}`)
    }
  }

  // A route that cannot register (a duplicate path) degrades to "no status board" rather than a
  // row that throws, which would take its own plugin tree entry down with it.
  try {
    ctx.effect(
      () => ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        handler: (req, res) => handle(ctx, sources, req, res),
      }),
      'plugin-suite: status route',
    )
  } catch (error) {
    console.error(`[plugin-suite] status route unavailable: ${messageOf(error)}`)
  }
}

/** @returns an error's message without assuming it is an `Error`. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}
