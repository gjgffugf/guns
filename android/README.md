# Android 构建模板说明

## 为什么这里看不到 build/ 目录

Godot 4 的 Android 导出走 **Gradle 构建**，要求项目里有 `res://android/build/`
这个 Gradle 工程（由导出模板里的 `android_source.zip` 解包而来）。

- **本机开发**：Godot 菜单 `项目 → 安装 Android 构建模板` 会生成它
- **CI**：工作流里已自动从导出模板解包生成，见
  `.github/workflows/build.yml` 的「安装 Android 构建模板到项目」步骤

这个目录是**生成物**，已在 `.gitignore` 里忽略，不要提交进仓库。
如果本机报「Android build template not installed in the project」，
就是它缺失了，执行上面的菜单项即可。

## 网络权限

联机需要的权限写在 `export_presets.cfg` 里，Godot 会自动合并进最终清单：

    permissions/internet=true
    permissions/access_network_state=true
    permissions/access_wifi_state=true

## 需要自定义清单时（加第三方 SDK 等）

等 CI 生成 `android/build/` 之后，再修改里面的 `AndroidManifest.xml` / `config.gradle`，
并在 `export_presets.cfg` 里指定：

    gradle_build/use_gradle_build=true
    custom_template/release="..."
    custom_template/debug="..."
