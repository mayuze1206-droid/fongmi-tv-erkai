"""
自有片源后端参考实现（FastAPI），对应 docs/01-片源API契约.md
[SPECIAL_VARIANT] 说明：本文件的 MOVIES 为内存示例数据，仅用于本地联调 Spider；
落地时把 get_xxx 的数据来源替换为你的数据库/爬虫结果即可，接口结构与 Spider 无需改动。

启动：  uvicorn server:app --host 0.0.0.0 --port 8000
依赖：  pip install fastapi uvicorn
验证：  curl "http://127.0.0.1:8000/api/v1/categories"
"""
from typing import Any

from fastapi import FastAPI, Header, Query
from pydantic import BaseModel

app = FastAPI(title="自有片源 API", version="1.0")

# 错误码集中定义，禁止散落魔法数字
CODE_OK = 0
CODE_BAD_PARAM = 1001
CODE_AUTH = 1002
CODE_NOT_FOUND = 2001
CODE_SERVER = 5000

# ---------------- 示例数据（落地时替换为真实数据源） ----------------
CATEGORIES: list[dict[str, Any]] = [
    {
        "id": "movie", "name": "电影",
        "style": {"type": "rect", "ratio": 0.75},
        "filters": [
            {"key": "sort", "name": "排序", "init": "latest",
             "value": [{"n": "最新", "v": "latest"}, {"n": "最热", "v": "hot"}]},
            {"key": "year", "name": "年份", "init": "all",
             "value": [{"n": "全部", "v": "all"}, {"n": "2026", "v": "2026"}, {"n": "2025", "v": "2025"}]},
        ],
    },
    {"id": "tv", "name": "剧集", "style": {"type": "rect", "ratio": 0.75}, "filters": []},
]

# 影片基础字段与 lines 选集分离，播放时才生成真实地址
_MOVIE_BASE = {
    "id": "v001", "name": "示例影片一",
    "pic": "https://example.com/poster/v001.jpg",
    "remarks": "HD/1080P", "year": "2026", "area": "中国大陆",
    "director": "示例导演", "actor": "演员甲、演员乙",
    "content": "这是一条用于接口联调的示例数据。",
}
_LINES = [
    {"name": "主线路", "episodes": [
        {"name": "第1集", "pid": "v001|0|0"},
        {"name": "第2集", "pid": "v001|0|1"},
    ]},
    {"name": "备用线路", "episodes": [
        {"name": "第1集", "pid": "v001|1|0"},
    ]},
]


# ---------------- 统一响应包装（单一出口） ----------------
def ok(data: Any) -> dict[str, Any]:
    return {"code": CODE_OK, "msg": "ok", "data": data}


def fail(code: int, msg: str) -> dict[str, Any]:
    return {"code": code, "msg": msg, "data": None}


def paginate(items: list[dict[str, Any]], pg: int, limit: int = 20) -> dict[str, Any]:
    """对完整清单切片分页；pagecount 必须真实，App 据此判断加载下一页。"""
    total = len(items)
    pagecount = max(1, (total + limit - 1) // limit)
    pg = max(1, min(pg, pagecount))
    start = (pg - 1) * limit
    return {
        "list": items[start:start + limit],
        "page": pg,
        "pagecount": pagecount,
        "limit": limit,
        "total": total,
    }


# 请求参数用 DTO 承载，校验集中在参数层
class VodQuery(BaseModel):
    tid: str = ""
    pg: int = 1
    filter: dict[str, str] = {}


# ---------------- 接口 ----------------
@app.get("/api/v1/categories")
def categories(x_api_key: str | None = Header(default=None, alias="X-Api-Key")):
    # 认证放在接口层；未配置 apiKey 时不做校验（对应 config 里 apiKey 留空）
    return ok(CATEGORIES)


@app.get("/api/v1/vods")
def vods(tid: str = "", pg: int = 1, filter: str = "{}"):
    if pg < 1:
        return fail(CODE_BAD_PARAM, "pg 必须 >= 1")
    import json
    try:
        filters = json.loads(filter) if filter else {}
    except (ValueError, TypeError):
        return fail(CODE_BAD_PARAM, "filter 必须是 JSON 对象字符串")

    # 示例：只有一条数据；真实实现按 tid / filters 查询数据库
    items = []
    if tid in ("", "movie", "tv"):
        items = [{k: _MOVIE_BASE[k] for k in ("id", "name", "pic", "remarks", "year")}
                 | {"style": {"type": "rect", "ratio": 0.75}}]
    return ok(paginate(items, pg))


@app.get("/api/v1/vod/{vid}")
def vod_detail(vid: str):
    if vid != _MOVIE_BASE["id"]:
        return fail(CODE_NOT_FOUND, "未找到该影片")
    return ok({**_MOVIE_BASE, "lines": _LINES})


@app.get("/api/v1/search")
def search(kw: str = "", pg: int = 1):
    if not kw.strip():
        return ok(paginate([], pg))
    matched = []
    if kw in _MOVIE_BASE["name"]:
        matched = [{k: _MOVIE_BASE[k] for k in ("id", "name", "pic", "remarks", "year")}
                   | {"style": {"type": "list"}}]
    return ok(paginate(matched, pg))


@app.get("/api/v1/play")
def play(pid: str = Query(...)):
    """按 pid = {影片id}|{线路索引}|{集索引} 动态生成播放地址与鉴权头。"""
    parts = pid.split("|")
    if len(parts) != 3:
        return fail(CODE_BAD_PARAM, "pid 格式错误")
    vid, line_idx, ep_idx = parts
    if vid != _MOVIE_BASE["id"]:
        return fail(CODE_NOT_FOUND, "影片不存在")
    # [SPECIAL_VARIANT] 示例直链；落地时按你的存储/鉴权生成，token 只在此处出现
    url = f"https://cdn.example.com/video/{vid}_{line_idx}_{ep_idx}.m3u8"
    return ok({
        "url": url,
        "parse": 0,
        "header": {"User-Agent": "Mozilla/5.0", "Referer": "https://example.com/"},
        "subs": [{"name": "简体中文", "url": f"https://cdn.example.com/sub/{vid}.srt",
                  "lang": "zh", "format": "srt", "flag": 1}],
    })
