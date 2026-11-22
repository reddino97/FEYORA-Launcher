"""Minimal SteamGridDB client for covers and backgrounds."""
import re
import unicodedata
import urllib.parse

import requests

BASE = "https://www.steamgriddb.com/api/v2"
TIMEOUT = 10
UA = "FEYORA-Launcher/1.0"


class SgdbError(Exception):
    pass


def _get(key, path, params=None):
    try:
        response = requests.get(
            BASE + path,
            headers={"Authorization": f"Bearer {key}", "User-Agent": UA},
            params=params,
            timeout=TIMEOUT,
        )
    except requests.RequestException as exc:
        raise SgdbError("SteamGridDB non raggiungibile") from exc
    if response.status_code in (401, 403):
        raise SgdbError("Chiave API SteamGridDB non valida")
    try:
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise SgdbError("Risposta non valida da SteamGridDB") from exc
    if not isinstance(payload, dict) or payload.get("success") is not True:
        errors = payload.get("errors") if isinstance(payload, dict) else None
        raise SgdbError(str(errors or "Risposta non valida da SteamGridDB"))
    return payload.get("data") or []


def _norm(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def validate(key):
    _get(key, "/search/autocomplete/portal")
    return True


def find_game_id(key, name, appid=None):
    if appid:
        try:
            game = _get(key, f"/games/steam/{urllib.parse.quote(str(appid), safe='')}")
            if isinstance(game, dict) and game.get("id"):
                return game["id"]
        except SgdbError:
            pass
    results = _get(key, "/search/autocomplete/" + urllib.parse.quote(name or "", safe=""))
    if not isinstance(results, list) or not results:
        return None
    wanted = _norm(name)
    exact = next((game for game in results if _norm(game.get("name")) == wanted), None)
    return (exact or results[0]).get("id")


def _art(data, limit):
    if not isinstance(data, list):
        return []
    data = sorted(data, key=lambda item: item.get("score") or 0, reverse=True)
    return [
        {"url": item["url"], "thumb": item.get("thumb") or item["url"]}
        for item in data[:limit]
        if isinstance(item, dict) and item.get("url")
    ]


def covers(key, gid, limit=12):
    """Available cover artwork; SGDB chooses the available dimensions."""
    return _art(_get(key, f"/grids/game/{gid}"), limit)


def backgrounds(key, gid, limit=12):
    """Available background artwork, without a forced aspect-ratio filter."""
    return _art(_get(key, f"/heroes/game/{gid}"), limit)


def art_for(key, name, appid=None):
    gid = find_game_id(key, name, appid)
    if not gid:
        return {"gid": None, "cover": None, "background": None}
    cover_list = covers(key, gid, 1)
    background_list = backgrounds(key, gid, 1)
    return {
        "gid": gid,
        "cover": cover_list[0]["url"] if cover_list else None,
        "background": background_list[0]["url"] if background_list else None,
    }
