# 自有片源后端 API 契约 v1

> 这是「一起设计」的核心产出：定义你的后端要提供哪些接口、返回什么结构。Spider 适配层严格按这份契约取数。
> 设计原则：接口单一职责、统一响应结构、错误码集中定义、入参可校验、字段对齐 CatVod 语义减少映射损耗。

---

## 约定

- 传输：`HTTP/1.1`，`Content-Type: application/json; charset=utf-8`
- 认证：可选，通过 Spider 的 `ext.apiKey` 传入，后端用 `X-Api-Key` 请求头校验（不用则忽略）
- 分页：`pg` 从 `1` 开始；`pagecount` 为总页数；`limit` 为每页条数

## 统一响应包装

所有接口都包一层：

```json
{
  "code": 0,
  "msg": "ok",
  "data": { }
}
```

错误码集中定义（禁止散落魔法数字）：

| code | 含义 |
|---|---|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 认证失败 |
| 2001 | 资源不存在 |
| 5000 | 服务内部错误 |

失败时 `data` 可为 `null`，`msg` 给出可读提示。

---

## 接口清单

### 1. 分类与筛选 `GET /api/v1/categories`

返回首页分类 + 每个分类的筛选项。对应 Spider 的 `homeContent(filter)`。

```json
{
  "code": 0,
  "msg": "ok",
  "data": [
    {
      "id": "movie",
      "name": "电影",
      "style": { "type": "rect", "ratio": 0.75 },
      "filters": [
        {
          "key": "sort", "name": "排序", "init": "latest",
          "value": [
            { "n": "最新", "v": "latest" },
            { "n": "最热", "v": "hot" }
          ]
        },
        {
          "key": "year", "name": "年份", "init": "all",
          "value": [
            { "n": "全部", "v": "all" },
            { "n": "2026", "v": "2026" },
            { "n": "2025", "v": "2025" }
          ]
        }
      ]
    },
    {
      "id": "tv",
      "name": "剧集",
      "style": { "type": "rect", "ratio": 0.75 },
      "filters": []
    }
  ]
}
```

字段说明：

| 字段 | 必须 | 说明 |
|---|---|---|
| `id` | 是 | 分类 ID，作为 `categoryContent(tid)` 的 tid |
| `name` | 是 | 分类显示名 |
| `style` | 否 | 卡片样式：`type` = rect/oval/list，`ratio` 宽高比 |
| `filters` | 否 | 筛选项；`key` 对应筛选参数名，`value[].v` 是提交值 |

### 2. 分类列表 `GET /api/v1/vods?tid=&pg=&filter=`

`filter` 是 JSON 对象字符串，如 `{"sort":"hot","year":"2026"}`。对应 `categoryContent(tid, pg, filter, extend)`。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "list": [
      {
        "id": "v001",
        "name": "示例影片一",
        "pic": "https://cdn.example.com/poster/v001.jpg",
        "remarks": "HD/1080P",
        "year": "2026"
      }
    ],
    "page": 1,
    "pagecount": 5,
    "limit": 20,
    "total": 95
  }
}
```

### 3. 详情与选集 `GET /api/v1/vod/{id}`

返回影片元数据 + 多线路选集。对应 `detailContent(ids)`。**这是线路编码的关键**。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "id": "v001",
    "name": "示例影片一",
    "pic": "https://cdn.example.com/poster/v001.jpg",
    "year": "2026",
    "area": "中国大陆",
    "director": "某某",
    "actor": "演员甲、演员乙",
    "content": "影片简介文本。",
    "remarks": "更新至12集",
    "lines": [
      {
        "name": "主线路",
        "episodes": [
          { "name": "第1集", "pid": "v001|0|0" },
          { "name": "第2集", "pid": "v001|0|1" }
        ]
      },
      {
        "name": "备用线路",
        "episodes": [
          { "name": "第1集", "pid": "v001|1|0" }
        ]
      }
    ]
  }
}
```

`pid` 是**播放 ID**，约定格式：`{影片id}|{线路索引}|{集索引}`。Spider 把它编码进 `vod_play_url`，播放时再解析出来调播放接口。这样 App 只在播放那一刻才请求真实地址，避免列表里暴露直链。

### 4. 搜索 `GET /api/v1/search?kw=&pg=`

返回结构与「分类列表」的 `data` 完全一致（`list/page/pagecount/limit/total`）。对应 `searchContent(key, quick, pg)`。

### 5. 播放解析 `GET /api/v1/play?pid={pid}`

按 `pid` 返回真实播放信息。对应 `playerContent(flag, id, vipFlags)`。

```json
{
  "code": 0, "msg": "ok",
  "data": {
    "url": "https://cdn.example.com/video/v001_1.m3u8",
    "parse": 0,
    "header": { "User-Agent": "Mozilla/5.0", "Referer": "https://example.com/" },
    "subs": [
      { "name": "简体中文", "url": "https://cdn.example.com/sub/v001.srt", "lang": "zh", "format": "srt", "flag": 1 }
    ]
  }
}
```

| 字段 | 必须 | 说明 |
|---|---|---|
| `url` | 是 | 直链（m3u8/mp4）。若需 App 嗅探，设 `parse: 1` 且 url 传网页地址 |
| `parse` | 否 | 0 = 直接播放（默认），1 = 交给 App 嗅探 |
| `header` | 否 | 播放请求头，对象 |
| `subs` | 否 | 外挂字幕数组；`flag` 1 = 默认选中 |

---

## 你需要在后端保证的三件事

1. **稳定 pid**：`pid` 在影片生命周期内不要变，否则历史记录/收藏会对不上（CatVod 用 `vod_id` 识别，Spider 里用影片 id 作 vod_id）。
2. **分页准确**：`pagecount` 必须是真实总页数；App 以 `page < pagecount` 决定是否加载下一页。总数未知时至少给准 `page` 和 `pagecount`。
3. **不返回敏感信息**：播放鉴权 token 不要出现在列表/详情里，只在 `/play` 动态生成。
