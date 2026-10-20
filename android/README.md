# 关于自定义 Android 构建

这里**故意不放 `android/build/` 目录**。

Godot 4 一旦检测到 `res://android/build/` 存在，就会切换到「自定义构建」模式，
该模式要求额外安装 Android 源码模板并自行维护 gradle 工程，
在 CI 上很容易静默失败（表现就是导出步骤打勾但 apk 不生成）。

本项目走的是引擎内置的 gradle 构建，所需的网络权限等全部写在
`export_presets.cfg` 的 `permissions/*` 里，由 Godot 自动合并进清单：

    permissions/internet=true
    permissions/access_network_state=true
    permissions/access_wifi_state=true

如果以后确实需要自定义清单（比如加第三方 SDK），再放 `android/build/`，
同时在 exporter 里指定 `custom_template/release` 与 `custom_template/debug`。
