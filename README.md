# dsh-plugin-suite

English | [中文](README.zh.md)

dsh-plugin-suite provides one entry point in Settings that gathers the **configuration panels** of this workspace's self-made plugins in one place.

## Features

- Adds a "Plugin Configuration" entry to the Settings sidebar, with every plugin's configuration panel gathered on that one page.
- Panels are contributed by the plugins themselves: this package knows no plugin by name, so adding a plugin requires no change here.
- The page issues no requests of its own, so it has no failure path: whatever the plugins contribute is what it renders.
- Each plugin's configuration is still owned by its own plugin row; this page only supplies the entry point.
- After dsh 0.2, broken configuration fails silently; this page gives you the one place to look.

## Install

### Install from GitHub (recommended)

```bash
dsh plugin --profile web add github:CJ-SH/dsh-plugin-suite
```
### Install from a local directory

```bash
dsh plugin --profile web add ./dsh-plugin-suite
```

This package is already selected in the `web` profile; after installing it elsewhere, double-check the profile's `dsh.profile.bundles`.

## Usage

Open **Settings → Plugin Configuration**: the page shows a "Configuration" heading with the panels contributed by each plugin laid out beneath it; when no plugin has handed a panel over, the page says so plainly — "No plugin has handed a configuration panel to this page yet." — instead of leaving the space blank.

When a plugin does not have this hub installed, it appears on its own Settings page; once the hub is installed, the plugin hands its panel over here and stands down its separate page, while the configuration values are still read and written in that plugin's own configuration rows.

## Uninstall

```bash
dsh plugin --profile web remove dsh-plugin-suite
```

## Technical notes

- Requires dsh `^0.2.0-rc.1` (`peerDependencies`) and Node `^22.19.0 || >=24.0.0`.
- UI copy switches between Chinese and English with dsh's language (locale namespace `my-plugins`).
- The page shows no status board; the read-only status route `GET /plugin-suite/status` still exists for other plugins to read.
- Uninstalling restores each plugin's independent Settings page; this hub stores no configuration.

## Further reading

Contracts, troubleshooting, and internals: see [docs/design-notes.md](docs/design-notes.md).

## License

MIT
