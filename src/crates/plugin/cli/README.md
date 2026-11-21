<!-- Modified for Ovload on 2026-10-27: workspace integration. -->

# Codex Proxy Plugin CLI

`cpr-plugin` 校验并规范化作者清单、收集声明的资源，生成可安装归档及 SHA-256 校验文件。
输出合同与 [SDK 版本](../sdk/README.md)一致

## 安装

从仓库根目录安装到本地工具目录：

```bash
cargo +1.99.1 install --locked --path src/crates/plugin/cli --root /path/to/local-tools
```

Add `/path/to/local-tools/bin` to `PATH`, or use the executable's full path. Follow the workspace [development checks](../../../../docs/DEVELOPMENT.md).

## 打包

先构建目标平台的插件二进制；插件提供管理页面时，还需构建页面静态资源。打包命令传入作者清单、二进制和所需的资源目录映射，通过 `cpr-plugin package --help` 查看完整参数：

```bash
cpr-plugin package \
  --manifest /path/to/plugin/plugin.json \
  --binary /path/to/plugin/target/x86_64-unknown-linux-gnu/release/plugin \
  --target x86_64-unknown-linux-gnu \
  --resource-map web=web/dist \
  --output-dir /path/to/output
```

`--resource-map web=web/dist` 将包内 `web/` 前缀映射到作者清单所在目录下的 `web/dist/`。
可重复传入不同前缀，源目录必须位于项目内；没有对应资源时省略该参数，未使用的映射会被拒绝。
未映射的资源按清单中的相对路径读取，只收集 `resources` 声明的文件

输出为 `<插件 ID>-<版本>-<目标 triple>.tar.gz` 及同名 `.tar.gz.sha256`；归档根目录直接包含 `plugin.json`、可执行文件和声明资源。
输入清单及生成后的清单均不得超过 64 KiB，压缩包上限为 32 MiB，展开归档上限为 128 MiB

作者清单不填写 `package`；字段省略规则、能力版本和挂载阶段见 [SDK 扩展项声明](../sdk/docs/manifest.md#扩展项简写)。
CLI 生成规范化后的 `plugin.json`，补入协议版本、目标平台和文件摘要。打包成功只证明输入符合包合同，实际启动与能力仍需在目标宿主验证

支持 `x86_64-unknown-linux-gnu`、`aarch64-unknown-linux-gnu` 和 `aarch64-apple-darwin`。
Runnable examples are maintained in the upstream `codex-proxy-plugins` repository under `examples/workbench`. This tool does not build source code, upload packages or enable plugins.

### 图标资源

在作者清单的 `icon` 中指定图标，并在 `resources` 中登记对应路径与 MIME 类型，配置方式见
[SDK 插件图标](../sdk/docs/manifest.md#插件图标)。图标与其他声明资源一样参与打包和摘要计算，
无需额外命令参数；工具保留文件原始内容，宿主安装时验证图标内容与资源限制

## 开发

The `ovload-plugin-cli` package belongs to the repository's root Cargo workspace.
It shares the toolchain, lockfile and checks, and depends internally only on `ovload-plugin-sdk`.

```bash
cargo +1.99.1 run --manifest-path Cargo.toml -p ovload-plugin-cli --locked -- package --help
RUST_MIN_STACK=16777216 cargo +1.99.1 test --manifest-path Cargo.toml -p ovload-plugin-cli --locked
```
