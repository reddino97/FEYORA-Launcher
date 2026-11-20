# -*- coding: utf-8 -*-
"""Genera static/i18n.js dal dizionario (tools/i18n_part*.py).

Per aggiungere o correggere una traduzione: modifica la riga della chiave in i18n_part*.py
(ordine lingue: it, en, es, fr, de, pt, ru, zh, ja, ko, tr, pl) ed esegui:  python tools/gen_i18n.py
"""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
from i18n_part3 import T

LANGS = [("it", "Italiano"), ("en", "English"), ("es", "Español"), ("fr", "Français"), ("de", "Deutsch"),
         ("pt", "Português (Brasil)"), ("ru", "Русский"), ("zh", "中文（简体）"), ("ja", "日本語"), ("ko", "한국어"),
         ("tr", "Türkçe"), ("pl", "Polski")]
codes = [c for c, _ in LANGS]

errors = []
for key, vals in T.items():
    if len(vals) != len(codes):
        errors.append(f"{key}: {len(vals)} traduzioni invece di {len(codes)}")
        continue
    ph = [set(re.findall(r"\{(\w+)\}", v)) for v in vals]
    if any(p != ph[0] for p in ph):
        errors.append(f"{key}: segnaposto diversi tra le lingue {ph}")
    if any(not v.strip() for v in vals):
        errors.append(f"{key}: traduzione vuota")
if errors:
    print("\n".join(errors)); sys.exit(1)

dicts = {c: {key: vals[i] for key, vals in T.items()} for i, c in enumerate(codes)}
out = os.path.join(os.path.dirname(__file__), "..", "static", "i18n.js")
js = f"""// GENERATO da tools/gen_i18n.py: non modificare a mano (modifica tools/i18n_part*.py).
(function () {{
  const LANGS = {json.dumps(LANGS, ensure_ascii=False)};
  const DICT = {json.dumps(dicts, ensure_ascii=False)};
  const I18N = {{
    langs: LANGS,
    lang: 'it',
    t(key, vars) {{
      let s = (DICT[this.lang] && DICT[this.lang][key]) || DICT.en[key] || DICT.it[key] || key;
      if (vars) for (const k in vars) s = s.split('{{' + k + '}}').join(vars[k]);
      return this.post ? this.post(s) : s;
    }},
    setLang(code) {{
      this.lang = DICT[code] ? code : 'it';
      document.documentElement.lang = this.lang;
      this.apply(document);
    }},
    // applica le traduzioni agli elementi statici marcati con data-i18n*
    apply(root) {{
      root.querySelectorAll('[data-i18n]').forEach((el) => {{ el.textContent = this.t(el.dataset.i18n); }});
      root.querySelectorAll('[data-i18n-ph]').forEach((el) => {{ el.placeholder = this.t(el.dataset.i18nPh); }});
      root.querySelectorAll('[data-i18n-title]').forEach((el) => {{ el.title = this.t(el.dataset.i18nTitle); }});
      root.querySelectorAll('[data-i18n-aria]').forEach((el) => {{ el.setAttribute('aria-label', this.t(el.dataset.i18nAria)); }});
    }},
    localeTag() {{
      return ({{ it: 'it-IT', en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ru: 'ru-RU', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', tr: 'tr-TR', pl: 'pl-PL' }})[this.lang] || 'it-IT';
    }}
  }};
  window.I18N = I18N;
  window.t = (k, v) => I18N.t(k, v);
}})();
"""
open(out, "w", encoding="utf-8").write(js)
print(f"OK: {len(T)} voci x {len(codes)} lingue -> static/i18n.js ({len(js)//1024} KB)")
