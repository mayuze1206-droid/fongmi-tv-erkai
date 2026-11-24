// [PUBLIC_COMPONENT] QuickJS Spider 适配器：把自有片源 REST API 映射成 CatVod 标准结构
// 依据：FongMi/CatVodSpider 官方 QuickJS 示例（examples/javascript/spider.js）+ development.md
// 用法：放到 App 可访问路径，config.json 的 site.api 指向本文件，type=3
// 只需保证后端符合 docs/01-片源API契约.md，本文件无需改动即可复用

import { Spider, page } from "catvod";

const PAGE_SIZE = 20;
const REQUEST_TIMEOUT_MS = 15000;

export default class MySource extends Spider {
    options = {};

    init(extend = "") {
        // 配置与代码分离：baseUrl / apiKey 全部来自 config 的 ext
        this.options = parseOptions(extend);
        this.options.baseUrl = trimTrailingSlash(this.options.baseUrl || "");
        if (!this.options.baseUrl) throw new Error("ext.baseUrl 不能为空");
    }

    // ---------- 首页：分类 + 筛选 ----------
    homeContent(filter) {
        const resp = this.get("/categories");
        const result = { class: [] };
        const categoryItems = Array.isArray(resp.data) ? resp.data : [];
        for (const cat of categoryItems) {
            const item = {
                type_id: stringValue(cat.id),
                type_name: stringValue(cat.name),
            };
            if (cat.style && typeof cat.style === "object") {
                item.type_flag = "0";
            }
            result.class.push(item);
        }
        if (filter) {
            result.filters = {};
            for (const cat of categoryItems) {
                const rows = Array.isArray(cat.filters)
                    ? cat.filters.map(toFilterRow).filter(Boolean)
                    : [];
                if (rows.length) result.filters[stringValue(cat.id)] = rows;
            }
        }
        return result;
    }

    homeVideoContent() {
        // 首页推荐：取第一个分类的第一页
        const resp = this.get("/vods", { tid: "", pg: "1" });
        return { list: dataList(resp).map((v) => this.toCard(v)) };
    }

    // ---------- 分类列表（含筛选） ----------
    categoryContent(tid, pg, filter, extend) {
        // 单一出口：所有筛选参数收拢到一个 params 对象
        const params = { tid: stringValue(tid), pg: stringValue(pg) };
        const selected = isObject(extend) ? extend : {};
        params.filter = JSON.stringify(selected);
        const resp = this.get("/vods", params);
        const pageInfo = isObject(resp.data) ? resp.data : {};
        const items = dataList(resp).map((v) => this.toCard(v));
        return {
            list: items,
            page: toInt(pageInfo.page, 1),
            pagecount: toInt(pageInfo.pagecount, 1),
            limit: toInt(pageInfo.limit, PAGE_SIZE),
            total: toInt(pageInfo.total, items.length),
        };
    }

    // ---------- 详情 + 选集 ----------
    detailContent(ids) {
        const id = stringValue(ids && ids[0]);
        if (!id) return { list: [] };
        const resp = this.get("/vod/" + encodeURIComponent(id));
        const detail = resp.data;
        if (!isObject(detail)) return { list: [], msg: "未找到该影片" };

        const vod = this.toCard(detail);
        vod.type_name = stringValue(detail.area);
        vod.vod_year = stringValue(detail.year);
        vod.vod_area = stringValue(detail.area);
        vod.vod_director = stringValue(detail.director);
        vod.vod_actor = stringValue(detail.actor);
        vod.vod_content = stringValue(detail.content);

        // 线路用 $$$ 分隔；每条线路内集数用 # 分隔；每集形如 "名称$播放ID"
        const lines = Array.isArray(detail.lines) ? detail.lines : [];
        const flags = [];
        const plays = [];
        for (const line of lines) {
            flags.push(stringValue(line.name) || "默认线路");
            const eps = Array.isArray(line.episodes) ? line.episodes : [];
            plays.push(eps.map((e) => safeLabel(stringValue(e.name)) + "$" + stringValue(e.pid)).join("#"));
        }
        vod.vod_play_from = flags.join("$$$");
        vod.vod_play_url = plays.join("$$$");
        return { list: [vod] };
    }

    // ---------- 搜索 ----------
    searchContent(key, quick, pg = "1") {
        const kw = stringValue(key).trim();
        if (!kw) return { list: [], page: 1, pagecount: 1, limit: PAGE_SIZE };
        const resp = this.get("/search", { kw, pg: stringValue(pg) });
        const pageInfo = isObject(resp.data) ? resp.data : {};
        const items = dataList(resp).map((v) => this.toCard(v));
        return {
            list: items,
            page: toInt(pageInfo.page, 1),
            pagecount: toInt(pageInfo.pagecount, 1),
            limit: toInt(pageInfo.limit, PAGE_SIZE),
            total: toInt(pageInfo.total, items.length),
        };
    }

    // ---------- 播放：解析 pid 换真实地址 ----------
    playerContent(flag, id, vipFlags) {
        const pid = stringValue(id);
        if (!pid) return { parse: 0, msg: "无效的播放 ID" };
        const resp = this.get("/play", { pid });
        const playInfo = resp.data;
        if (!isObject(playInfo) || !stringValue(playInfo.url)) {
            return { parse: 0, msg: stringValue(resp.msg) || "未获取到播放地址" };
        }
        const result = {
            parse: toInt(playInfo.parse, 0),
            url: stringValue(playInfo.url),
        };
        if (isObject(playInfo.header)) result.header = playInfo.header;
        if (Array.isArray(playInfo.subs) && playInfo.subs.length) result.subs = playInfo.subs;
        return result;
    }

    // ---------- 内部工具（单一出口，不散落） ----------
    // 统一 GET + 认证 + 响应拆包，所有接口只走这里
    get(path, params) {
        const url = this.options.baseUrl + path + buildQuery(params);
        const headers = {};
        if (this.options.apiKey) headers["X-Api-Key"] = stringValue(this.options.apiKey);
        const resp = this.net.json(url, { headers, timeout: REQUEST_TIMEOUT_MS });
        if (!isObject(resp) || toInt(resp.code, -1) !== 0) {
            throw new Error(stringValue(resp && resp.msg) || "接口请求失败: " + path);
        }
        return resp;
    }

    // 数据项 → CatVod 卡片（列表/搜索/首页共用，单一出口）
    toCard(v) {
        const card = {
            vod_id: stringValue(v.id),
            vod_name: stringValue(v.name),
            vod_pic: stringValue(v.pic),
            vod_remarks: stringValue(v.remarks),
        };
        if (v.year) card.vod_year = stringValue(v.year);
        // 海报比例交给 Spider 控制：改这里即可全局调整竖版/横版，无需改 Java
        const style = isObject(v.style) ? v.style : { type: "rect", ratio: 0.75 };
        card.style = { type: stringValue(style.type) || "rect", ratio: Number(style.ratio) || 0.75 };
        return card;
    }
}

// ---------- 纯函数工具 ----------
function parseOptions(ext) {
    if (ext === "" || ext == null) return {};
    let value;
    try { value = JSON.parse(ext); } catch (e) { throw new Error("ext 必须是 JSON 对象"); }
    if (!isObject(value)) throw new Error("ext 必须是 JSON 对象");
    return value;
}

function buildQuery(params) {
    if (!isObject(params)) return "";
    const parts = [];
    for (const key of Object.keys(params)) {
        const val = params[key];
        if (val == null || val === "") continue;
        parts.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(val)));
    }
    return parts.length ? "?" + parts.join("&") : "";
}

function toFilterRow(raw) {
    if (!isObject(raw) || !stringValue(raw.key)) return null;
    const values = Array.isArray(raw.value)
        ? raw.value.filter((x) => isObject(x)).map((x) => ({ n: stringValue(x.n), v: stringValue(x.v) }))
        : [];
    return { key: stringValue(raw.key), name: stringValue(raw.name), init: stringValue(raw.init), value: values };
}

function dataList(resp) {
    const payload = resp.data;
    if (Array.isArray(payload)) return payload;
    if (isObject(payload) && Array.isArray(payload.list)) return payload.list;
    return [];
}

function safeLabel(value) {
    return value.replace(/\$/g, "＄").replace(/#/g, "＃").trim();
}

function trimTrailingSlash(value) { return value.replace(/\/+$/, ""); }
function toInt(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function stringValue(value) { return value == null ? "" : String(value); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
