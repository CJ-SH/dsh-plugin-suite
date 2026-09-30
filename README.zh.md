# dsh-plugin-suite

[English](README.md) | 中文

dsh-plugin-suite 在设置里提供一处入口，把本工作区自制插件的**配置面板**收在一起。

## 功能

- 在设置侧栏提供一个「插件配置」入口，各插件的配置面板集中在这一页。
- 面板由插件自己交进来：本包不认识任何插件名，新增插件不需要改动本包。
- 本页不发自己的请求，因此没有失败路径：插件交什么，它就渲染什么。
- 各插件的配置仍归各自的插件行管理，本页只提供入口。
- dsh 0.2 之后配置失效是静默的，本页给出唯一一处查看入口。

## 安装

### 从 GitHub 安装（推荐）

```bash
dsh plugin --profile web add github:CJ-SH/dsh-plugin-suite
```
### 从本地目录安装

```bash
dsh plugin --profile web add ./dsh-plugin-suite
```

本包在 `web` profile 中已默认选中；在别处安装后请回查 profile 的 `dsh.profile.bundles`。

## 使用

打开 **设置 → 插件配置**：页面显示一个「配置」标题，下面排列各插件交来的配置面板；没有插件交面板时页面会明说「还没有插件把配置面板交给这里。」，而不是留白。

插件没装本 hub 时各自出现在自己的设置页；装了本 hub 后把面板交到这里并让出独立页面，配置项仍在各插件自己的配置行里读写。

## 卸载

```bash
dsh plugin --profile web remove dsh-plugin-suite
```

## 技术说明

- 需要 dsh `^0.2.0-rc.1`（`peerDependencies`）与 Node `^22.19.0 || >=24.0.0`。
- 界面文案随 dsh 语言中英切换（locale 命名空间 `my-plugins`）。
- 页面不显示状态板；只读状态路由 `GET /plugin-suite/status` 仍在，供其他插件读取。
- 卸载后各插件恢复独立设置页；本 hub 不保存任何配置。

## 深入阅读

契约、排障与内部结构见 [docs/design-notes.md](docs/design-notes.md)。

## License

MIT
