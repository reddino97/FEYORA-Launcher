"""Client minimale per SteamGridDB (API v2, serve una chiave gratuita).

Chiave: steamgriddb.com -> Preferenze -> API. Va incollata nelle Impostazioni di FEYORA.
"""
import re
import unicodedata
import urllib.parse

import requests

BASE = "https://www.steamgriddb.com/api/v2"
TIMEOUT = 7
UA = "FEYORA-Launcher/1.0"


class SgdbError(Exception):
    pass


def _get(key, path, params=None):
    r = requests.get(
        BASE + path,
        headers={"Authorization": f"Bearer {key}", "User-Agent": UA},
        params=params,
        timeout=TIMEOUT,
    )
    if r.status_code in (401, 403):
        raise SgdbError("Chiave API non valida")
    r.raise_for_status()
    j = r.json()
    if not j.get("success", False):
        raise SgdbError(str(j.get("errors") or "Risposta non valida"))
    return j.get("data")


def _norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def validate(key):
    """Solleva SgdbError se la chiave non funziona."""
    _get(key, "/search/autocomplete/test")
    return True


def find_game_id(key, name, appid=None):
    if appid:
        try:
            d = _get(key, f"/games/steam/{appid}")
            if d and d.get("id"):
                return d["id"]
        except requests.HTTPError:
            pass  # appid sconosciuto a SGDB: si prova con il nome
    results = _get(key, "/search/autocomplete/" + urllib.parse.quote(name or "", safe="")) or []
    if not results:
        return None
    n = _norm(name)
    for r in results:
        if _norm(r.get("name")) == n:
            return r.get("id")
    return results[0].get("id")


def _score(it):
    return it.get("score") or 0


def posters(key, gid, limit=12):
    data = _get(key, f"/grids/game/{gid}", {
        "dimensions": "600x900,342x482,660x930",
        "types": "static", "nsfw": "false", "epilepsy": "false",
    }) or []
    data = sorted(data, key=_score, reverse=True)
    return [{"url": d["url"], "thumb": d.get("thumb") or d["url"], "style": d.get("style")}
            for d in data[:limit] if d.get("url")]


def heroes(key, gid, limit=6):
    data = _get(key, f"/heroes/game/{gid}", {
        "dimensions": "1920x620,3840x1240,1600x650",
        "types": "static", "nsfw": "false", "epilepsy": "false",
    }) or []
    data = sorted(data, key=_score, reverse=True)
    return [{"url": d["url"], "thumb": d.get("thumb") or d["url"]} for d in data[:limit] if d.get("url")]


def art_for(key, name, appid=None):
    """Poster verticale e hero orizzontale migliori per un gioco."""
    gid = find_game_id(key, name, appid)
    if not gid:
        return {"gid": None, "poster": None, "hero": None}
    p = posters(key, gid, 1)
    h = heroes(key, gid, 1)
    return {"gid": gid, "poster": p[0]["url"] if p else None, "hero": h[0]["url"] if h else None}
