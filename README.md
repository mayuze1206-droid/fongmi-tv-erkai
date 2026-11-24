# FongMi/TV 二开方案（盒/机双端）

> 改 UI 品牌、接入**现成片源接口**、带直播，一套方案覆盖电视端与手机端。
> 当前为 **v2**：放弃自建片源后端，改用社区公开接口（App 原生支持，零代码接入）。

---

## 这个项目解决什么

- **不自建后端**：现成采集站接口直接填 `type=1` + API 地址即可用，不需要写服务端。
- **自带爬虫**：社区订阅配置里带 `spider: "./custom_spider.jar"`，App 加载后自动爬分类、列表、选集和播放地址。
- **点播 + 直播**：一份配置同时接入多仓点播订阅、直播源与 EPG 节目单。
- **双端 UI 改造**：按 FongMi/TV 的 `leanback`（电视）/ `mobile`（手机）sourceSet 分别改，不动 `main` 里的业务核心。

## 快速开始

1. 打开 FongMi/TV → 设置 → 配置地址。
2. 填入本仓库的 [`config/现成接口配置.json`](config/现成接口配置.json) 的可访问地址（可放到自己的 GitHub Gist、对象存储或本地服务器）。
3. 确认后 App 自动加载点播站点、直播源和 EPG。
4. 如果只想接一个接口，用 [`config/单站点模板.json`](config/单站点模板.json)，把 `sites[].api` 换成你的接口地址即可。

也可以直接贴现成订阅地址（最省事，但完全依赖对方更新）：

```
https://cdn.jsdelivr.net/gh/liu673cn/box@main/m.json
```

更详细的导入、换源、测速和直播配置步骤见 [`docs/03-现成接口接入指南.md`](docs/03-现成接口接入指南.md)。

## 推荐源（2026-11-24 实测）

稳定性排序：**GitHub 托管（jsDelivr / raw）> 大站直链 > 小站域名**。

| 类型 | 地址 | 实测 |
|---|---|---|
| 点播（多仓，首选） | `https://cdn.jsdelivr.net/gh/liu673cn/box@main/m.json` | 1.4s / 57KB |
| 点播（备用） | `https://raw.liucn.cc/box/m.json` | 1.6s |
| 点播（含爬虫 JAR） | `https://raw.githubusercontent.com/xyq254245/xyqonlinerule/main/XYQTVBox.json` | 0.4s |
| 直播（517 频道） | `https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn.m3u` | 可用 |
| 直播（央视/卫视） | `https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.txt` | 可用 |
| EPG | `https://epg.112114.xyz/pp.xml` | 可用 |

> 任何源都不能保证 100% 秒播。卡不卡取决于采集站线路、运营商网络和时段；多仓订阅的优势是线路多、可随时切换。

## 目录结构

```
fongmi-tv-erkai/
├── README.md                       # 本文件
├── 上传说明.md                      # 上传/推送说明
├── .gitignore
├── config/
│   ├── 现成接口配置.json            # 可直接导入 App 的点播 + 直播 + EPG 配置
│   └── 单站点模板.json              # 单接口最小模板（type=1）
├── docs/
│   ├── 01-片源API契约.md            # （备选）自建后端的接口契约
│   ├── 02-UI改造清单.md             # 双端 UI 改造文件级清单
│   └── 03-现成接口接入指南.md        # 导入 / 换源 / 直播 / 测速
├── spider/
│   ├── spider.js                    # （备选）QuickJS 爬虫适配器
│   └── config.json                  # （备选）Spider 站点配置
└── api/
    └── server.py                    # （备选）FastAPI 参考后端
```

标注「备选」的文件是留给将来想自定义片源/爬虫时用的，当前用现成接口不需要。

## Site.type 速查

| type | 含义 | api 填法 | 是否写代码 |
|---|---|---|---|
| 0 | XML HTTP | 现成 XML 接口 URL | 不用 |
| 1 | JSON HTTP | 现成 JSON 接口 URL | 不用 |
| 4 | HTTP 扩展 JSON（带筛选） | 现成接口 URL | 不用 |
| 3 | Spider 爬虫（JAR / PY / JS） | `csp_类名` / `./x.js` / `./x.py` | 要（或用现成 JAR） |

## UI 改造路线

按改动量从小到大分三层，建议先做 L1：

- **L1 品牌化**：应用名、图标、主题色、启动图（两端各改一次）。
- **L2 视觉风格**：卡片比例/圆角、首页布局、焦点高亮，改 Adapter 与自定义 View。
- **L3 交互与页面**：新增页面、改导航、扫码遥控入口等，改 Activity / Fragment。

铁律：只动 `app/src/leanback/` 和 `app/src/mobile/` 的 UI 层，别碰 `app/src/main/` 的业务核心。完整清单见 [`docs/02-UI改造清单.md`](docs/02-UI改造清单.md)。

## 合规说明

- 本仓库只做**技术接入与连通性实测**，不内置、不提供任何影视内容。
- 配置中引用的接口与直播源均为社区公开维护的第三方资源，其稳定性、内容合法性与版权由源提供方负责。
- 二开仅用于个人学习与技术研究，请勿打包传播或商业分发；请遵守所在地法律法规，支持正版。
