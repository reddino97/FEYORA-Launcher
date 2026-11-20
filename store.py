"""Motore di ricerca prezzi: Steam / Epic Games / Microsoft (Xbox) + IsThereAnyDeal (opzionale).

Ogni store ha piu' strade (fallback). Se una non risponde si prova la successiva e, alla fine,
l'errore preciso (codice HTTP, anti-bot, timeout...) finisce in "errors" e nella diagnostica
(Impostazioni -> Negozio -> Test connessione), cosi' si vede sempre cosa non va.

Strade:
  steam : store.steampowered.com (storesearch / featuredcategories)            - pubblico
  epic  : store.epicgames.com/graphql, poi graphql.epicgames.com/graphql       - pubblico, ma dietro anti-bot
          + feed "giochi gratis" (store-site-backend-static.ak.epicgames.com)   - pubblico
  xbox  : displaycatalog.mp.microsoft.com (autosuggest + products), poi microsoft.com/msstoreapiprod
  itad  : api.isthereanydeal.com (chiave gratuita da isthereanydeal.com/apps)   - ufficiale, copre i 3 store
"""
import re
import time
import unicodedata
import threading
from concurrent.futures import ThreadPoolExecutor

import requests

try:  # opzionale: aiuta con l'anti-bot di Epic
    import cloudscraper  # type: ignore
    _SCRAPER = cloudscraper.create_scraper(browser={"browser": "chrome", "platform": "windows", "mobile": False})
except Exception:  # pragma: no cover
    _SCRAPER = None

TIMEOUT = 9
STORES = ("steam", "epic", "xbox")
STEAM_LANG = {"it": "italian", "en": "english", "es": "spanish", "fr": "french", "de": "german", "pt": "brazilian",
              "ru": "russian", "zh": "schinese", "ja": "japanese", "ko": "koreana", "tr": "turkish", "pl": "polish"}
LOCALES = {"it": "it-IT", "en": "en-US", "es": "es-ES", "fr": "fr-FR", "de": "de-DE", "pt": "pt-BR",
           "ru": "ru-RU", "zh": "zh-CN", "ja": "ja-JP", "ko": "ko-KR", "tr": "tr-TR", "pl": "pl-PL"}
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
}

_cache = {}
_cache_lock = threading.Lock()
_inflight = {}


class StoreError(Exception):
    pass


def clear_cache():
    with _cache_lock:
        _cache.clear()


def cached(key, ttl, fn):
    now = time.time()
    owner = False
    with _cache_lock:
        # Opportunistic bounded cleanup: no background thread is needed.
        for old_key, (expires, _) in list(_cache.items()):
            if now >= expires:
                _cache.pop(old_key, None)
        hit = _cache.get(key)
        if hit:
            return hit[1]
        waiter = _inflight.get(key)
        if waiter is None:
            waiter = threading.Event()
            _inflight[key] = waiter
            owner = True
    if not owner:
        waiter.wait()
        with _cache_lock:
            hit = _cache.get(key)
            if hit:
                return hit[1]
        # The original request failed; retry in this caller so errors remain
        # visible to the existing provider error handling.
        return cached(key, ttl, fn)
    try:
        val = fn()
        with _cache_lock:
            _cache[key] = (time.time() + ttl, val)
        return val
    finally:
        with _cache_lock:
            event = _inflight.pop(key, None)
            if event:
                event.set()


# ---------------------------------------------------------------- opzioni (paese, lingua, chiavi)
def make_opts(settings=None):
    s = settings or {}
    lang = s.get("lang") or "it"
    country = (s.get("store_country") or "IT").upper()
    enabled = s.get("store_enabled") or {}
    return {
        "lang": lang, "country": country, "cc": country.lower(),
        "locale": LOCALES.get(lang, "it-IT"), "steam_lang": STEAM_LANG.get(lang, "english"),
        "itad_key": (s.get("itad_key") or "").strip(),
        "enabled": {k: enabled.get(k, True) is not False for k in STORES},
    }


def _okey(o):
    return (o["country"], o["lang"], bool(o["itad_key"]), tuple(sorted(k for k, v in o["enabled"].items() if v)))


# ---------------------------------------------------------------- HTTP con errori leggibili
def _http(method, url, **kw):
    kw.setdefault("timeout", TIMEOUT)
    headers = dict(BROWSER_HEADERS)
    headers.update(kw.pop("headers", {}) or {})
    use_scraper = kw.pop("scraper", False) and _SCRAPER is not None
    try:
        if use_scraper:
            r = getattr(_SCRAPER, method)(url, headers=headers, **kw)
        else:
            r = getattr(requests, method)(url, headers=headers, **kw)
    except requests.exceptions.Timeout:
        raise StoreError("timeout")
    except requests.exceptions.ConnectionError as e:
        raise StoreError(f"connessione fallita ({type(e).__name__})")
    code = getattr(r, "status_code", 200)
    if code >= 400:
        body = (getattr(r, "text", "") or "")[:300].lower()
        if code in (403, 429, 503) and ("cloudflare" in body or "just a moment" in body or "captcha" in body or code == 403):
            raise StoreError(f"HTTP {code} (bloccato dall'anti-bot del sito)")
        raise StoreError(f"HTTP {code}")
    try:
        return r.json()
    except Exception:
        raise StoreError("risposta non valida (non e' JSON)")


def _get(url, **kw):
    return _http("get", url, **kw)


def _post(url, **kw):
    return _http("post", url, **kw)


# ---------------------------------------------------------------- utilita'
_EDITION = re.compile(
    r"\b(standard|deluxe|ultimate|premium|digital|complete|definitive|gold|game of the year|goty|"
    r"edition|edizione|bundle|pack|collection)\b")


def norm(title):
    s = unicodedata.normalize("NFKD", title or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[\u2122\u00ae\u00a9]", "", s)
    s = _EDITION.sub(" ", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def offer(store, price, original, currency, url, free=False):
    discount = 0
    if price is not None and original and original > price:
        discount = round((original - price) / original * 100)
    return {"store": store, "price": price, "original": original, "currency": currency or "EUR",
            "discount": discount, "free": bool(free), "url": url}


def item(store, title, image, image2, o, poster=None, hero=None):
    return {"store": store, "title": title, "image": image, "image2": image2,
            "poster": poster, "hero": hero, "offer": o}


# ---------------------------------------------------------------- Steam
def _steam_art(appid):
    base = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}"
    return {"image": f"{base}/header.jpg", "image2": f"{base}/capsule_616x353.jpg",
            "poster": f"{base}/library_600x900.jpg", "hero": f"{base}/library_hero.jpg"}


def steam_search(term, o, limit=8):
    j = _get("https://store.steampowered.com/api/storesearch/",
             params={"term": term, "l": o["steam_lang"], "cc": o["cc"]})
    out = []
    for it in (j.get("items") or [])[:limit]:
        if it.get("type") not in (None, "app"):
            continue
        aid = it.get("id")
        pr = it.get("price") or {}
        final, init = pr.get("final"), pr.get("initial")
        of = offer("steam", final / 100 if final is not None else None, init / 100 if init is not None else None,
                   pr.get("currency"), f"https://store.steampowered.com/app/{aid}", free=(final == 0))
        a = _steam_art(aid)
        out.append(item("steam", it.get("name"), a["image"], a["image2"], of, a["poster"], a["hero"]))
    return out


def steam_new(o, limit=12):
    j = _get("https://store.steampowered.com/api/featuredcategories", params={"cc": o["cc"], "l": o["steam_lang"]})
    out, seen = [], set()
    for section in ("new_releases", "specials", "top_sellers"):
        for it in ((j.get(section) or {}).get("items") or []):
            aid = it.get("id")
            if it.get("type", 0) not in (0, None) or aid in seen:
                continue
            seen.add(aid)
            final, init = it.get("final_price"), it.get("original_price")
            of = offer("steam", final / 100 if final is not None else None,
                       init / 100 if init else (final / 100 if final is not None else None),
                       it.get("currency"), f"https://store.steampowered.com/app/{aid}", free=(final == 0))
            a = _steam_art(aid)
            out.append(item("steam", it.get("name"), it.get("header_image") or a["image"], a["image2"], of, a["poster"], a["hero"]))
            if len(out) >= limit:
                return out
    return out


# ---------------------------------------------------------------- Epic Games
_EPIC_QUERY = """query searchStoreQuery($allowCountries: String, $category: String, $count: Int, $country: String!,
 $keywords: String, $locale: String, $sortBy: String, $sortDir: String, $start: Int, $withPrice: Boolean = true) {
  Catalog { searchStore(allowCountries: $allowCountries, category: $category, count: $count, country: $country,
    keywords: $keywords, locale: $locale, sortBy: $sortBy, sortDir: $sortDir, start: $start) {
    elements { title id namespace productSlug urlSlug
      keyImages { type url }
      catalogNs { mappings(pageType: "productHome") { pageSlug pageType } }
      offerMappings { pageSlug pageType }
      price(country: $country) @include(if: $withPrice) {
        totalPrice { discountPrice originalPrice currencyCode currencyInfo { decimals } } } } } } }"""
EPIC_ENDPOINTS = ("https://store.epicgames.com/graphql", "https://graphql.epicgames.com/graphql")


def _epic_slug(el):
    for m in el.get("offerMappings") or []:
        if m.get("pageSlug"):
            return m["pageSlug"]
    for m in ((el.get("catalogNs") or {}).get("mappings") or []):
        if m.get("pageSlug"):
            return m["pageSlug"]
    ps = el.get("productSlug")
    if ps:
        return re.sub(r"/home$", "", ps)
    return el.get("urlSlug")


def _epic_images(el):
    imgs = {i.get("type"): i.get("url") for i in (el.get("keyImages") or []) if i.get("url")}
    pick = lambda order: next((imgs[t] for t in order if imgs.get(t)), None)
    wide = pick(("OfferImageWide", "DieselStoreFrontWide", "Thumbnail"))
    tall = pick(("OfferImageTall", "DieselStoreFrontTall", "Thumbnail"))
    any_ = next(iter(imgs.values()), None)
    return (wide or tall or any_), (tall or wide or any_)


def _epic_parse(els, o):
    out = []
    for el in els:
        tp = ((el.get("price") or {}).get("totalPrice")) or {}
        dec = (tp.get("currencyInfo") or {}).get("decimals", 2)
        div = 10 ** (dec if isinstance(dec, int) else 2)
        d, orig = tp.get("discountPrice"), tp.get("originalPrice")
        slug = _epic_slug(el)
        lang = o["lang"] if o["lang"] != "zh" else "zh-CN"
        url = f"https://store.epicgames.com/{lang}/p/{slug}" if slug else f"https://store.epicgames.com/{lang}/"
        of = offer("epic", d / div if d is not None else None, orig / div if orig is not None else None,
                   tp.get("currencyCode"), url, free=(d == 0))
        wide, tall = _epic_images(el)
        if el.get("title"):
            out.append(item("epic", el.get("title"), wide, tall, of, poster=tall, hero=wide))
    return out


def epic_query(o, keywords="", sort_by=None, count=12):
    variables = {
        "category": "games/edition/base|bundles/games|editors|software/edition/base",
        "keywords": keywords, "country": o["country"], "allowCountries": o["country"], "locale": o["locale"],
        "count": count, "start": 0, "withPrice": True,
    }
    if sort_by:
        variables.update({"sortBy": sort_by, "sortDir": "DESC"})
    last = None
    for url in EPIC_ENDPOINTS:
        for use_scraper in ((True, False) if _SCRAPER is not None else (False,)):
            try:
                j = _post(url, json={"query": _EPIC_QUERY, "variables": variables}, scraper=use_scraper,
                          headers={"Content-Type": "application/json;charset=UTF-8", "Origin": "https://store.epicgames.com",
                                   "Referer": "https://store.epicgames.com/", "Accept-Language": o["locale"]})
                els = (((j.get("data") or {}).get("Catalog") or {}).get("searchStore") or {}).get("elements")
                if els is None:
                    raise StoreError("risposta senza elementi" + (f" ({str(j.get('errors'))[:80]})" if j.get("errors") else ""))
                return _epic_parse(els, o)
            except StoreError as e:
                last = e
    raise last or StoreError("nessuna risposta")


def epic_free(o):
    """Giochi gratis della settimana (feed statico, senza anti-bot)."""
    j = _get("https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions",
             params={"locale": o["locale"], "country": o["country"], "allowCountries": o["country"]})
    els = (((j.get("data") or {}).get("Catalog") or {}).get("searchStore") or {}).get("elements") or []
    live = []
    for el in els:
        promos = (el.get("promotions") or {}).get("promotionalOffers") or []
        if promos and (el.get("price") or {}).get("totalPrice", {}).get("discountPrice") == 0:
            live.append(el)
    return _epic_parse(live, o)


# ---------------------------------------------------------------- Microsoft / Xbox
_MS_CATALOG = "https://displaycatalog.mp.microsoft.com/v7.0"
_MS_SITE = "https://www.microsoft.com/msstoreapiprod/api/autosuggest"


def _ms_url(u):
    if not u:
        return None
    return "https:" + u if u.startswith("//") else u


def ms_products(ids, o):
    ids = [i for i in ids if i][:20]
    if not ids:
        return []
    j = _get(f"{_MS_CATALOG}/products", params={"bigIds": ",".join(ids), "market": o["country"], "languages": o["locale"],
                                               "MS-CV": "DGU1mcuYo0WMMp+F.1"})
    out = []
    for p in (j.get("Products") or []):
        lp = (p.get("LocalizedProperties") or [{}])[0]
        title = lp.get("ProductTitle")
        imgs = lp.get("Images") or []

        def _find(purposes):
            for purpose in purposes:
                pi = next((i for i in imgs if i.get("ImagePurpose") == purpose and i.get("Uri")), None)
                if pi:
                    return _ms_url(pi.get("Uri"))
            return None
        wide = _find(("SuperHeroArt", "TitledHeroArt", "Hero", "BrandedKeyArt", "Screenshot"))
        tall = _find(("Poster", "BoxArt", "Tile", "Logo"))
        price = None
        for sku in (p.get("DisplaySkuAvailabilities") or []):
            for av in (sku.get("Availabilities") or []):
                pr = ((av.get("OrderManagementData") or {}).get("Price")) or {}
                if pr.get("ListPrice") is not None:
                    price = pr
                    break
            if price:
                break
        pid = p.get("ProductId")
        loc = o["locale"]
        url = f"https://www.xbox.com/{loc}/games/store/game/{pid}" if pid else f"https://www.xbox.com/{loc}/games"
        if price:
            lp_, msrp = price.get("ListPrice"), price.get("MSRP")
            of = offer("xbox", lp_, msrp if msrp is not None else lp_, price.get("CurrencyCode"), url, free=(lp_ == 0))
        else:
            of = offer("xbox", None, None, "EUR", url)
        if title:
            out.append(item("xbox", title, wide or tall, tall or wide, of, poster=tall, hero=wide))
    return out


def _ms_ids_from_suggest(j, limit):
    """None se la risposta non ha la struttura attesa (si prova la strada successiva)."""
    if not isinstance(j, dict) or "ResultSets" not in j:
        return None
    ids = []
    for rs in (j.get("ResultSets") or []):
        for sg in (rs.get("Suggests") or []):
            if sg.get("Source") not in (None, "Games", "DCatAll-Products", "Iris-Products"):
                continue
            for m in (sg.get("Metas") or []):
                if m.get("Key") == "BigCatalogId" and m.get("Value"):
                    ids.append(m["Value"])
    return ids[:limit]


def ms_search(term, o, limit=5):
    last = None
    attempts = (
        lambda: _get(f"{_MS_CATALOG}/productFamilies/autosuggest",
                     params={"market": o["country"], "languages": o["locale"], "query": term,
                             "productFamilyNames": "Games", "topProducts": limit}),
        lambda: _get(f"{_MS_CATALOG}/productFamilies/autosuggest",
                     params={"market": o["country"], "languages": o["locale"], "query": term,
                             "productFamilyNames": "Games", "topProducts": limit, "platformdependencyname": "Windows.Desktop"}),
        lambda: _get(_MS_SITE, params={"market": o["locale"], "clientId": "7F27B536-CF6B-4C65-8638-A0F8CBDFCA65",
                                       "sources": "Microsoft-Terms,Iris-Products,DCatAll-Products",
                                       "filter": "+ClientType:StoreWeb", "counts": "5,1,5", "query": term}),
    )
    for att in attempts:
        try:
            ids = _ms_ids_from_suggest(att(), limit)
            if ids is None:
                last = StoreError("risposta con struttura inattesa")
                continue
            return ms_products(ids, o) if ids else []     # risposta valida (anche vuota): e' quella giusta
        except StoreError as e:
            last = e
        except Exception as e:        # qualunque altro problema: prossima strada
            last = StoreError(f"{type(e).__name__}: {str(e)[:80]}")
    raise last or StoreError("nessuna risposta")


def ms_new(o, limit=12):
    j = _get("https://reco-public.rec.mp.microsoft.com/channels/Reco/V8.0/Lists/Computed/New",
             params={"market": o["country"], "language": o["locale"], "itemTypes": "Game",
                     "deviceFamily": "Windows.Desktop", "count": limit, "skipItems": 0})
    items = j.get("Items") or j.get("items") or []
    ids = [(i.get("Id") or i.get("id")) for i in items]
    return ms_products(ids[:limit], o)


# ---------------------------------------------------------------- IsThereAnyDeal (chiave opzionale, API ufficiale)
ITAD = "https://api.isthereanydeal.com"


def itad_shop_ids(o):
    def build():
        j = _get(f"{ITAD}/service/shops/v1", params={"country": o["country"]})
        ids = {}
        for sh in (j or []):
            t = (sh.get("title") or "").lower()
            if "steam" in t and "steam" not in ids:
                ids["steam"] = sh["id"]
            elif "epic" in t and "epic" not in ids:
                ids["epic"] = sh["id"]
            elif "microsoft" in t and "xbox" not in ids:
                ids["xbox"] = sh["id"]
        return ids
    return cached(("itad-shops", o["country"]), 86400, build)


def itad_search(term, o, limit=8):
    j = _get(f"{ITAD}/games/search/v1", params={"key": o["itad_key"], "title": term, "results": limit})
    return j or []


def itad_prices(ids, o):
    if not ids:
        return []
    shops = itad_shop_ids(o)
    wanted = [str(shops[s]) for s in STORES if s in shops and o["enabled"].get(s)]
    params = {"key": o["itad_key"], "country": o["country"], "deals": "false", "vouchers": "false", "capacity": 0}
    if wanted:
        params["shops"] = ",".join(wanted)
    return _post(f"{ITAD}/games/prices/v3", params=params, json=ids[:50]) or []


def itad_tiles(term, o, limit=10):
    """Ricerca completa via ITAD: titoli + offerte dei tre store."""
    games = itad_search(term, o, limit)
    prices = {p.get("id"): p for p in itad_prices([g.get("id") for g in games if g.get("id")], o)}
    shops = itad_shop_ids(o)
    inv = {v: k for k, v in shops.items()}
    out = []
    for g in games:
        p = prices.get(g.get("id")) or {}
        offers = {}
        for d in (p.get("deals") or []):
            store = inv.get((d.get("shop") or {}).get("id"))
            if not store or not o["enabled"].get(store):
                continue
            pr, rg = d.get("price") or {}, d.get("regular") or {}
            price, reg = pr.get("amount"), rg.get("amount")
            of = offer(store, price, reg if reg is not None else price, pr.get("currency"), d.get("url") or "", free=(price == 0))
            if store not in offers or (price is not None and (offers[store]["price"] is None or price < offers[store]["price"])):
                offers[store] = of
        if not offers:
            continue
        assets = g.get("assets") or {}
        img = assets.get("banner600") or assets.get("banner400") or assets.get("banner300") or assets.get("boxart")
        steam_url = (offers.get("steam") or {}).get("url") or ""
        m = re.search(r"/app/(\d+)", steam_url)
        art = _steam_art(m.group(1)) if m else {}
        out.append({"title": g.get("title"), "image": art.get("image") or img, "image2": img, "poster": art.get("poster") or assets.get("boxart"),
                    "hero": art.get("hero"), "offers": offers})
    return out


# ---------------------------------------------------------------- unione
def _search_provider(store, o):
    return {"steam": lambda q: steam_search(q, o), "epic": lambda q: epic_query(o, keywords=q, count=8),
            "xbox": lambda q: ms_search(q, o)}[store]


def _new_provider(store, o):
    return {"steam": lambda: steam_new(o, 100), "epic": lambda: epic_query(o, sort_by="releaseDate", count=100),
            "xbox": lambda: ms_new(o, 100)}[store]


def _safe(name, fn, errors):
    try:
        return fn()
    except Exception as e:  # un solo store che cade non deve bloccare la pagina
        errors[name] = str(e)[:140] if isinstance(e, StoreError) else f"{type(e).__name__}: {str(e)[:120]}"
        return []


def _best(t):
    priced = [(of["price"], s) for s, of in t["offers"].items() if of["price"] is not None]
    t["best"] = min(priced)[1] if priced else None


def merge(results, limit=12):
    """results: {store: [item,...]} -> lista di tile con le offerte dei vari store."""
    tiles, index = [], {}
    longest = max((len(v) for v in results.values()), default=0)
    for pos in range(longest):
        for store in STORES:
            lst = results.get(store) or []
            if pos >= len(lst):
                continue
            it = lst[pos]
            key = norm(it["title"])
            if not key:
                continue
            t = index.get(key)
            if t is None:
                t = {"title": it["title"], "image": it["image"], "image2": it["image2"],
                     "poster": it.get("poster"), "hero": it.get("hero"), "offers": {}}
                index[key] = t
                tiles.append(t)
            else:
                for k in ("image", "image2", "poster", "hero"):
                    if not t.get(k) and it.get(k):
                        t[k] = it[k]
            t["offers"].setdefault(store, it["offer"])
    for t in tiles:
        _best(t)
    return tiles[:limit]


def _fill_missing(tiles, o, errors):
    """Per ogni tile cerca il gioco negli store dove manca (stesso titolo normalizzato).

    Per ogni store la prima ricerca fa da "sonda": se fallisce lo store viene segnato come non
    raggiungibile e le altre ricerche si saltano; se riesce, l'eventuale errore dell'elenco
    "ultime uscite" viene cancellato (lo store funziona, quello che mancava era solo l'elenco)."""
    if o["itad_key"]:
        _fill_with_itad(tiles, o, errors)
    by_store = {}
    for t in tiles:
        for store in STORES:
            if o["enabled"].get(store) and store not in t["offers"]:
                by_store.setdefault(store, []).append(t)

    def run(store, t):
        """True se la ricerca ha funzionato (anche senza risultati), altrimenti il messaggio d'errore."""
        try:
            res = cached(("s", store, norm(t["title"]), _okey(o)), 1800, lambda: _search_provider(store, o)(t["title"]))
        except Exception as e:
            return str(e)[:140] if isinstance(e, StoreError) else f"{type(e).__name__}: {str(e)[:120]}"
        key = norm(t["title"])
        for it in res:
            if norm(it["title"]) == key:
                t["offers"][store] = it["offer"]
                for k in ("image", "image2", "poster", "hero"):
                    if not t.get(k) and it.get(k):
                        t[k] = it[k]
                break
        return True

    # sonde (una per store, in parallelo)
    probes = {s: lst[0] for s, lst in by_store.items()}
    with ThreadPoolExecutor(max_workers=3) as ex:
        probe_res = dict(zip(probes, ex.map(lambda sv: run(sv, probes[sv]), list(probes))))
    jobs = []
    for store, lst in by_store.items():
        r = probe_res[store]
        if r is not True:
            errors[store] = r
            continue
        errors.pop(store, None)          # la ricerca funziona: l'errore dell'elenco non conta
        jobs.extend((store, t) for t in lst[1:])
    if jobs:
        with ThreadPoolExecutor(max_workers=8) as ex:
            list(ex.map(lambda j: run(*j), jobs))
    for t in tiles:
        _best(t)


def _fill_with_itad(tiles, o, errors):
    def one(t):
        try:
            res = cached(("itad-title", norm(t["title"]), _okey(o)), 1800, lambda: itad_tiles(t["title"], o, 5))
        except Exception as e:
            errors["itad"] = str(e)[:140] if isinstance(e, StoreError) else f"{type(e).__name__}: {str(e)[:120]}"
            return
        key = norm(t["title"])
        for r in res:
            if norm(r["title"]) == key:
                for s, of in r["offers"].items():
                    t["offers"].setdefault(s, of)
                return
    with ThreadPoolExecutor(max_workers=6) as ex:
        list(ex.map(one, tiles))


def home(o):
    def build():
        errors = {}
        active = [s for s in STORES if o["enabled"].get(s)]
        with ThreadPoolExecutor(max_workers=4) as ex:
            futs = {s: ex.submit(_safe, s, _new_provider(s, o), errors) for s in active}
            free_f = ex.submit(_safe, "epic_free", lambda: epic_free(o), {}) if o["enabled"].get("epic") else None
            results = {s: f.result() for s, f in futs.items()}
            free = free_f.result() if free_f else []
        if free and not results.get("epic"):
            results["epic"] = free          # se il catalogo Epic e' bloccato, almeno i giochi gratis
            errors.pop("epic", None) if len(results["epic"]) else None
        tiles = merge(results, 100)
        # Il catalogo può contenere 100 suggerimenti: il confronto incrociato
        # approfondito resta sui primi 40 per evitare una raffica di richieste.
        _fill_missing(tiles[:40], o, errors)
        return {"tiles": tiles, "errors": errors, "updated": int(time.time()), "itad": bool(o["itad_key"])}
    return cached(("home", _okey(o)), 1800, build)


def search(q, o):
    q = (q or "").strip()
    if len(q) < 2:
        return {"tiles": [], "errors": {}, "updated": int(time.time()), "itad": bool(o["itad_key"])}

    def build():
        errors, tiles = {}, []
        if o["itad_key"]:
            try:
                tiles = [dict(t, best=None) for t in itad_tiles(q, o, 12)]
                for t in tiles:
                    _best(t)
            except Exception as e:
                errors["itad"] = str(e)[:140] if isinstance(e, StoreError) else f"{type(e).__name__}: {str(e)[:120]}"
        if not tiles:   # senza chiave (o se ITAD non risponde): ricerca diretta negli store
            active = [s for s in STORES if o["enabled"].get(s)]
            with ThreadPoolExecutor(max_workers=3) as ex:
                futs = {s: ex.submit(_safe, s, (lambda s=s: _search_provider(s, o)(q)), errors) for s in active}
                results = {s: f.result() for s, f in futs.items()}
            tiles = merge(results, 16)
        return {"tiles": tiles, "errors": errors, "updated": int(time.time()), "itad": bool(o["itad_key"])}
    return cached(("q", norm(q), _okey(o)), 900, build)


# ---------------------------------------------------------------- diagnostica
def diagnose(o):
    """Prova ogni strada una per una e dice cosa risponde. Mai in cache."""
    def probe(name, fn):
        t0 = time.time()
        try:
            res = fn()
            n = len(res) if hasattr(res, "__len__") else 1
            return {"ok": n > 0, "count": n, "ms": int((time.time() - t0) * 1000), "detail": "" if n else "nessun risultato"}
        except Exception as e:
            return {"ok": False, "count": 0, "ms": int((time.time() - t0) * 1000),
                    "detail": str(e)[:140] if isinstance(e, StoreError) else f"{type(e).__name__}: {str(e)[:120]}"}

    tests = {
        "steam": lambda: steam_search("portal", o),
        "epic": lambda: epic_query(o, keywords="fortnite", count=3),
        "epic_free": lambda: epic_free(o),
        "xbox": lambda: ms_search("minecraft", o),
    }
    if o["itad_key"]:
        tests["itad"] = lambda: itad_tiles("portal", o, 3)
    with ThreadPoolExecutor(max_workers=5) as ex:
        futs = {k: ex.submit(probe, k, fn) for k, fn in tests.items()}
        out = {k: f.result() for k, f in futs.items()}
    out["_info"] = {"country": o["country"], "locale": o["locale"], "cloudscraper": _SCRAPER is not None, "itad_key": bool(o["itad_key"])}
    return out
