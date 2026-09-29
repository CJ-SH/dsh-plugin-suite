/**
 * dsh-plugin-suite — browser half.
 *
 * One Settings navList page (`settings.section`, id `my-plugins`) that gathers the configuration
 * panels of the workspace's self-made plugins, through the child list slot `plugin-suite.panel`
 * that this page declares.
 *
 * The page knows no plugin by name. Panels arrive from the plugins themselves, so adding one
 * changes nothing here — and, deliberately, this page performs **no request of its own**. An
 * earlier revision also carried a status board (provider availability, declared presets) fed by the
 * host half's `GET /plugin-suite/status`. That route still exists and is verified good, but the
 * board was cut: it was the page's only failure path, and a management surface that renders
 * "unavailable" on a healthy workspace costs more than the information is worth. Hang it back on
 * the route when there is a reason to.
 *
 * Shipped in the module-loader bundle form; `react` is the only module requested.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-suite',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')

    /** Client services this bundle reads; an undeclared read is denied. */
    const inject = ['slots', 'locale']

    /** This page's Settings navList identity, and the child slot the plugins fill. */
    const SECTION_ID = 'my-plugins'
    const SECTION_ORDER = 140
    const PANEL_SLOT = 'plugin-suite.panel'

    // ── copy ────────────────────────────────────────────────────────────────────────────

    const COPY_ZH = {
      title: '插件配置',
      description: '本工作区自制插件的配置入口。',
      panelsHeading: '配置',
      noPanels: '还没有插件把配置面板交给这里。',
    }

    const COPY_EN = {
      title: 'Plugin Configuration',
      description: 'Configuration entry points for this workspace\u2019s self-made plugins.',
      panelsHeading: 'Configuration',
      noPanels: 'No plugin has handed a configuration panel to this page yet.',
    }

    /** @returns a translator bound to the projected namespace, with a hand-kept fallback. */
    function makeCopy(props) {
      const projected = typeof props.t === 'function' ? props.t : null
      const fallback =
        typeof globalThis.navigator?.language === 'string' && globalThis.navigator.language.startsWith('zh')
          ? COPY_ZH
          : COPY_EN
      return (key) => {
        if (projected !== null) {
          const text = readText(projected(key))
          if (text.length > 0) return text
        }
        return fallback[key] ?? key
      }
    }

    /** @returns a printable string, whatever the projection handed back. */
    function readText(value) {
      return typeof value === 'string' ? value : ''
    }

    // ── style ───────────────────────────────────────────────────────────────────────────

    // `--dsw-alias-label-primary` throughout: `--dsw-alias-label-dimmed` renders too faint to read
    // against this page's surface.
    const STYLE = {
      page: { display: 'flex', flexDirection: 'column', gap: '20px', padding: '4px 0' },
      section: { display: 'flex', flexDirection: 'column', gap: '10px' },
      heading: {
        margin: 0,
        fontSize: 'var(--dsh-content-font-size-secondary, 13px)',
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      },
      muted: {
        color: 'var(--dsw-alias-label-primary)',
        opacity: 0.75,
        fontSize: 'var(--dsh-content-font-size-secondary, 13px)',
      },
    }

    /** The page. Owner props for `settings.section` are `{ close }` plus the standard render props. */
    function PluginSuiteSection(props) {
      const t = makeCopy(props)

      return React.createElement('div', { style: STYLE.page },
        React.createElement('div', { style: STYLE.section }, [
          React.createElement('h3', { key: 'h', style: STYLE.heading }, t('panelsHeading')),
          typeof props.renderSlot === 'function'
            ? props.renderSlot(PANEL_SLOT)
            : React.createElement('div', { style: STYLE.muted }, t('noPanels')),
        ]))
    }

    function apply(ctx) {
      try {
        ctx.locale.register(SECTION_ID, { zh: COPY_ZH, en: COPY_EN })
      } catch {
        // A composition without the locale seam still renders: makeCopy falls back by hand.
      }

      // Nothing registers directly: `settings.section` is declared by the settings shell, which may
      // not have loaded yet, and registering into an UNDECLARED slot throws — which would take this
      // whole browser half down. Injecting into the section slot keeps the child declaration honest
      // too: the child exists only while the parent does, so the plugins that wait on
      // `plugin-suite.panel` stand down together with this page instead of holding a slot nobody
      // renders.
      ctx.slots.inject('settings.section', () => {
        try {
          return ctx.slots.register({
            name: 'settings.section',
            id: SECTION_ID,
            order: SECTION_ORDER,
            label: () => navLabel(ctx),
            locale: SECTION_ID,
            children: { [PANEL_SLOT]: { kind: 'list', scope: 'root' } },
          }, PluginSuiteSection)
        } catch {
          return () => {}
        }
      })
    }

    /** Nav text follows the active locale; the owner re-reads this thunk on every projection. */
    function navLabel(ctx) {
      try {
        return String(ctx.locale.getLocale().active).startsWith('zh') ? COPY_ZH.title : COPY_EN.title
      } catch {
        return COPY_ZH.title
      }
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
