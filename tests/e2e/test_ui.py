"""
End-to-end UI tests for BioPulse with the backend mocked.

Run:  python3 tests/e2e/test_ui.py
Needs: pip install playwright && playwright install chromium   (or a local Chrome; set CHROME_PATH)
"""
import json
import os
import socket
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
SHOTS = Path(__file__).parent / "screenshots"
SHOTS.mkdir(exist_ok=True)
CHROME = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")

now = datetime.now(timezone.utc)
iso = lambda **kw: (now - timedelta(**kw)).isoformat()

XSS = '<img src=x onerror="window.__pwned=1">'

NEWS = {
    "fetchedAt": now.isoformat(),
    "items": [
        {"title": "Merck to acquire Verona Pharma for $10B", "link": "https://stat.example/1", "date": iso(minutes=20), "summary": "Deal adds COPD drug.", "source": "STAT", "sourceId": "stat", "tag": "M&A"},
        {"title": "FDA Approves First Drug to Treat Gaucher Type 3", "link": "https://fda.example/1", "date": iso(hours=2), "summary": "", "source": "FDA", "sourceId": "fda", "tag": "APPROVAL"},
        {"title": "Pfizer obesity pill posts Phase 3 data", "link": "https://fierce.example/2", "date": iso(hours=3), "summary": "Pfizer data.", "source": "Fierce Pharma", "sourceId": "fiercepharma", "tag": "PHASE 3"},
        {"title": "Biotech startup raises $150M Series C", "link": "https://endpts.example/3", "date": iso(hours=5), "summary": "", "source": "Endpoints News", "sourceId": "endpoints", "tag": "FINANCING"},
        {"title": "CMS finalizes Medicare drug price negotiation list " + XSS, "link": "javascript:alert(1)", "date": iso(hours=6), "summary": XSS, "source": "BioPharma Dive", "sourceId": "biopharmadive", "tag": "POLICY"},
        {"title": "Novo Nordisk cuts jobs in restructuring", "link": "https://medcity.example/5", "date": iso(hours=8), "summary": "", "source": "MedCity News", "sourceId": "medcity", "tag": "LAYOFFS"},
    ],
    "deals": [
        {"title": "Merck to acquire Verona Pharma for $10B", "link": "https://stat.example/1", "source": "STAT", "date": iso(minutes=20), "type": "M&A", "usd": 1e10, "value": "$10B"},
        {"title": "Biotech startup raises $150M Series C", "link": "https://endpts.example/3", "source": "Endpoints News", "date": iso(hours=5), "type": "Financing", "usd": 1.5e8, "value": "$150M"},
        {"title": "Licensing pact worth up to $1.2B", "link": "https://x.example/9", "source": "STAT", "date": iso(hours=9), "type": "Licensing", "usd": 1.2e9, "value": "up to $1.2B"},
    ],
    "sources": [
        {"id": "fda", "name": "FDA", "ok": True, "count": 1},
        {"id": "stat", "name": "STAT", "ok": True, "count": 1},
        {"id": "fiercepharma", "name": "Fierce Pharma", "ok": False, "error": "HTTP 403"},
    ],
}
AREAS = {
    "fetchedAt": now.isoformat(), "since": "2026-11-16", "total": 65228, "totalNew7d": 812, "partial": False,
    "areas": [
        {"id": "onc", "name": "Oncology", "recruiting": 18921, "new7d": 195},
        {"id": "cns", "name": "Neuroscience", "recruiting": 4100, "new7d": 60},
        {"id": "cardio", "name": "Cardiovascular", "recruiting": 5200, "new7d": 70},
        {"id": "metab", "name": "Metabolic", "recruiting": 3900, "new7d": 81},
        {"id": "immuno", "name": "Immunology", "recruiting": 2800, "new7d": 40},
        {"id": "infect", "name": "Infectious Disease", "recruiting": 3500, "new7d": 33},
        {"id": "rare", "name": "Rare / Genetic", "recruiting": 900, "new7d": 9},
        {"id": "psych", "name": "Psychiatry", "recruiting": 2100, "new7d": 28},
    ],
}
COUNTRIES = {
    "fetchedAt": now.isoformat(), "partial": False,
    "countries": [
        {"id": "840", "name": "United States", "recruiting": 22046}, {"id": "156", "name": "China", "recruiting": 11000},
        {"id": "250", "name": "France", "recruiting": 4200}, {"id": "818", "name": "Egypt", "recruiting": 1688},
        {"id": "356", "name": "India", "recruiting": 615}, {"id": "643", "name": "Russia", "recruiting": None},
    ],
}
FDA = {"fetchedAt": now.isoformat(), "days": 60, "approvals": [
    {"date": "2026-11-18", "brand": "LIVSAYIS", "ingredient": "EXAMPLEMAB", "sponsor": "REGENERON", "application": "NDA221251", "type": "New molecular entity", "priority": True, "url": "https://www.accessdata.fda.gov/x?ApplNo=221251"},
    {"date": "2026-11-13", "brand": "KLYGEFA", "ingredient": None, "sponsor": "ALEXION PHARM", "application": "BLA761488", "type": "New molecular entity", "priority": False, "url": "https://www.accessdata.fda.gov/x?ApplNo=761488"},
]}
QUOTES = {"fetchedAt": now.isoformat(), "quotes": [
    {"symbol": "XBI", "price": 101.5, "changePct": 1.25, "source": "Yahoo Finance"},
    {"symbol": "IBB", "price": 150.1, "changePct": -0.4, "source": "Yahoo Finance"},
    {"symbol": "^NBI", "price": 4800.2, "changePct": 0.1, "source": "Yahoo Finance"},
    {"symbol": "LLY", "price": 900.0, "changePct": 2.0, "source": "Yahoo Finance"},
    {"symbol": "NVO", "error": "unavailable"},
]}
COMPANY = {"company": "x", "fetchedAt": now.isoformat(),
    "trials": {"activeTotal": 121, "sampled": 100, "phases": {"PHASE1": 35, "PHASE2": 7, "PHASE3": 48, "NA": 10},
               "topConditions": [{"name": "Obesity", "n": 30}], "sponsorNames": ["Novo Nordisk A/S"],
               "recent": [{"nct": "NCT07944118", "title": "Zenagamtide gastric emptying study", "phases": ["PHASE1"], "status": "RECRUITING"}]},
    "fda": {"matchedSponsors": ["NOVO NORDISK INC"], "originals": [], "supplements": 4}}
BRIEF = {"result": {"lead": "Merck's $10B Verona deal leads the day " + XSS, "themes": [
    {"title": "Big pharma M&A", "summary": "Merck buys Verona.", "sources": [1]},
    {"title": "Obesity race", "summary": "Pfizer posts data.", "sources": [3]},
    {"title": "Pricing", "summary": "CMS list finalized.", "sources": [5]}],
    "watchlist": [{"company": "Pfizer", "note": "Phase 3 obesity data.", "sources": [1]}],
    "opportunities": [{"title": "RWE for COPD", "rationale": "Post-deal integration.", "sources": [1]}]},
    "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat(), "cached": False}
PROSPECT = {"result": {"summary": "Novo is heavily weighted to Phase 3 obesity work.", "pipeline": ["48 Phase 3 trials"], "regulatory": ["No originals in 24 months; 4 supplements"],
    "news": [{"text": "Restructuring announced", "sources": [1]}], "background": ["Diabetes and obesity leader"], "questions": ["How is trial data unified?"],
    "angle": {"title": "Unify obesity trial data", "pitch": "Fits.", "hooks": ["RWE", "Phase 3 ops", "GenAI"]}, "confidence": "medium"},
    "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat()}
FIT = {"result": {"verdict": "go", "score": 82, "reasons": ["Clinical ops buyers"], "risks": ["Crowded"], "angles": ["Talk on data"], "targets": ["VP Clin Ops"]},
       "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat()}


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def serve():
    port = free_port()
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, port


def install_api(page, overrides=None, calls=None):
    overrides = overrides or {}

    def handle(route, request):
        path = request.url.split("/api/")[1].split("?")[0]
        if calls is not None:
            calls.append((request.method, request.url, request.post_data))
        if path in overrides:
            status, body = overrides[path]
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(body))
        if path == "ai":
            task = json.loads(request.post_data)["task"]
            body = {"dailyBrief": BRIEF, "prospect": PROSPECT, "eventFit": FIT}[task]
            return route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
        table = {"news": NEWS, "fda": FDA, "quotes": QUOTES, "company": COMPANY,
                 "health": {"ok": True, "ai": {"configured": True, "model": "openai/gpt-oss-120b"}}}
        if path == "trials":
            body = COUNTRIES if "countries" in request.url else AREAS
        else:
            body = table[path]
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    page.route("**/api/**", handle)


RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))


def run():
    srv, port = serve()
    base = f"http://127.0.0.1:{port}/"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=[f"--host-resolver-rules=MAP kingismymiddlename.github.io 127.0.0.1:{port}"])

        # ── 1. Desktop happy path ───────────────────────────────────────────
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        dialogs = []
        page.on("dialog", lambda d: (dialogs.append(d.message), d.dismiss()))
        install_api(page)
        page.goto(base)
        page.wait_for_selector(".news-item")
        page.wait_for_selector("#fda-list .appr")
        page.wait_for_selector("#trialmap path.leaflet-interactive")
        page.wait_for_timeout(900)

        check("no JS errors on load", not errors, "; ".join(errors[:3]))
        check("no alert/confirm dialogs", not dialogs)
        grid_children = page.eval_on_selector("#main", "el => [...el.children].map(c => c.id || c.className)")
        check("all panels are inside the grid", all(x in grid_children for x in ["news-panel", "map-panel", "agent-panel", "events-panel"]), str(grid_children))
        check("news renders 6 items", page.locator(".news-item").count() == 6)
        check("XSS in headline not executed", page.evaluate("window.__pwned") is None)
        check("XSS shown as text", XSS in page.locator(".news-item").nth(4).inner_text())
        check("javascript: link neutralised", page.locator(".news-item").nth(4).get_attribute("href") == "#")
        check("news links open in new tab safely", page.locator(".news-item").first.get_attribute("rel") == "noopener noreferrer")
        check("deal ticker scrolls with real deals", "scrolling" in page.get_attribute("#ticker-track", "class") and "$10B" in page.inner_text("#ticker-track"))
        check("deal radar tiers", page.locator(".tier-1").count() == 2 and page.locator(".tier-3").count() == 1)
        check("heat bars for 8 areas", page.locator("#heat-bars .bar-row").count() == 8)
        check("heat hint shows 7-day window", "2026-11-16" in page.inner_text("#heat-hint"))
        page.click(".seg-btn[data-heat=recruiting]")
        check("heat toggle switches metric", "18,921" in page.inner_text("#heat-bars"))
        check("map total from live data", "65,228" in page.inner_text("#map-total"))
        check("map shaded countries", page.locator("#trialmap path.leaflet-interactive").count() > 100)
        check("map legend rendered", "22,046" in page.inner_text("#map-legend"))
        check("FDA approvals listed with priority", page.locator("#fda-list .appr").count() == 2 and "PRIORITY" in page.inner_text("#fda-list"))
        check("quotes rendered; failed symbol shows dash", "101.50" in page.inner_text("#index-boxes") and "—" in page.inner_text("#tickers"))
        check("events loaded from JSON", page.locator(".ev").count() == 12)
        check("health chip counts sources", "sources live" in page.inner_text("#health-text"))
        check("panel status shows Live", "Live" in page.inner_text("#news-status"))
        check("no Retry button on healthy panels", page.locator("#news-status button, #fda-status button").count() == 0)
        page.screenshot(path=str(SHOTS / "desktop.png"), full_page=True)

        # filters + search + watchlist
        page.click(".fchip[data-f=deals]")
        check("deals filter", page.locator(".news-item").count() == 2)
        page.click(".fchip[data-f=all]")
        page.fill("#news-search", "gaucher")
        check("search filter", page.locator(".news-item").count() == 1)
        page.fill("#news-search", "")
        page.dispatch_event("#news-search", "input")
        page.fill("#watch-input", "Pfizer")
        page.click("#watch-add")
        page.fill("#watch-input", "pfizer")
        page.press("#watch-input", "Enter")
        check("watchlist dedupes case-insensitively", page.locator("#watch-chips .chip").count() == 1)
        check("watchlist highlights matching news", page.locator(".news-item.hl").count() == 1)
        page.click(".fchip[data-f=watch]")
        check("watchlist filter", page.locator(".news-item").count() == 1)
        page.click(".fchip[data-f=all]")

        # daily brief
        calls = []
        page.unroute("**/api/**")
        install_api(page, calls=calls)
        page.click("#brief-btn")
        page.wait_for_selector("#brief-out .lead")
        brief_call = [c for c in calls if c[1].endswith("/api/ai")][0]
        payload = json.loads(brief_call[2])
        check("brief sends headlines not prompts", payload["task"] == "dailyBrief" and "system" not in json.dumps(payload) and len(payload["input"]["headlines"]) == 6)
        check("brief prioritises watchlist headline first", "Pfizer" in payload["input"]["headlines"][0]["title"])
        check("brief renders citations as links", page.locator("#brief-out a.ref").count() >= 4)
        first_ref = [h for h in NEWS["items"] if h["title"] == payload["input"]["headlines"][0]["title"]][0]["link"]
        check("brief cite [1] links to the first headline sent", page.locator("#brief-out a.ref").first.get_attribute("href") == first_ref)
        check("AI output escaped", page.evaluate("window.__pwned") is None and XSS in page.inner_text("#brief-out .lead"))
        check("brief labelled AI-generated", "AI-GENERATED" in page.inner_text("#brief-out"))

        # prospect with ambiguity
        page.click("#tab-prospect")
        page.click(".qbtn[data-co=Merck]")
        check("Merck asks to disambiguate", page.is_visible("#prospect-clarify"))
        page.click("[data-amb='0']")
        page.wait_for_selector("#pb-ai")
        company_call = [c for c in calls if "/api/company" in c[1]][-1]
        check("disambiguated sponsor sent to registry", "Merck%20Sharp" in company_call[1])
        check("registry facts rendered", "121" in page.inner_text("#prospect-out") and "NCT07944118" in page.inner_text("#prospect-out"))
        check("background flagged as model knowledge", "MAY BE OUTDATED" in page.inner_text("#prospect-out"))
        check("steps all done", page.locator("#prospect-steps li.done").count() == 3)
        page.screenshot(path=str(SHOTS / "prospect.png"))

        # events
        page.click(".ev >> nth=1")
        page.wait_for_selector("#event-drawer:not([hidden])")
        page.click("#ev-assess")
        page.wait_for_selector("#ev-fit-a .ev-verdict")
        check("event fit renders and card coloured", page.locator(".ev.v-go").count() == 1)

        # settings persist and change the profile key
        page.click("#settings-btn")
        page.fill("#set-firm", "Acme Analytics")
        page.fill("#set-tickers", "XBI, <bad>, LLY")
        page.click("#settings-save")
        stored = page.evaluate("JSON.parse(localStorage.getItem('bp:profile')).firm")
        tick = page.evaluate("JSON.parse(localStorage.getItem('bp:tickers'))")
        check("settings saved", stored == "Acme Analytics" and tick == ["XBI", "LLY"], str(tick))
        check("event fits reset for a new profile", page.locator(".ev.v-go").count() == 0)
        page.reload()
        page.wait_for_selector(".news-item")
        check("watchlist persists across reload", page.locator("#watch-chips .chip").count() == 1)
        ctx.close()

        # ── 2. Backend failures: errors shown, saved copies used ───────────
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        install_api(page)
        page.goto(base)
        page.wait_for_selector(".news-item")
        page.wait_for_timeout(500)
        page.unroute("**/api/**")
        install_api(page, overrides={
            "news": (502, {"error": "News feeds are unavailable right now."}),
            "fda": (502, {"error": "openFDA is unavailable right now."}),
            "ai": (503, {"error": "AI is not configured.", "code": "ai_not_configured"}),
        })
        page.reload()
        page.wait_for_selector("#news-status .stale")
        check("news falls back to saved copy, flagged", "Saved copy" in page.inner_text("#news-status") and page.locator(".news-item").count() == 6)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_selector("#news-status .bad")
        check("news shows clear error when nothing saved", "unavailable" in page.inner_text("#news-feed").lower())
        check("fda error has retry button", page.locator("#fda-status button").count() == 1)
        page.click("#tab-brief")
        page.click("#brief-btn")
        page.wait_for_selector("#brief-out .card")
        check("brief explains missing news instead of failing", "not enough headlines" in page.inner_text("#brief-out").lower())
        check("no uncaught errors in failure mode", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ── 3. AI not configured message ───────────────────────────────────
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        install_api(page, overrides={"ai": (503, {"error": "AI is not configured. Add GROQ_API_KEY in Netlify site settings.", "code": "ai_not_configured"})})
        page.goto(base)
        page.wait_for_selector(".news-item")
        page.click("#brief-btn")
        page.wait_for_selector("#brief-out .card-hd.red")
        check("AI-not-configured gives owner instructions", "Environment variables" in page.inner_text("#brief-out"))
        ctx.close()

        # ── 4. GitHub Pages without backend configured ─────────────────────
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"http://kingismymiddlename.github.io:{port}/")
        page.wait_for_selector("#banner:not([hidden])")
        check("GitHub Pages: banner explains backend setup", "Settings" in page.inner_text("#banner"))
        check("GitHub Pages: events still work offline", page.locator(".ev").count() == 12)
        # now configure API base pointing at the mock
        install_api(page)
        page.click("#settings-btn")
        page.fill("#set-api", f"http://127.0.0.1:{port}")
        page.click("#settings-save")
        page.wait_for_selector(".news-item")
        check("GitHub Pages: works after setting API base", page.locator(".news-item").count() == 6 and page.is_hidden("#banner"))
        check("GitHub Pages: no JS errors", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ── 5. Mobile + tablet layout ──────────────────────────────────────
        for name, vp in [("mobile", {"width": 390, "height": 844}), ("tablet", {"width": 1024, "height": 768})]:
            ctx = browser.new_context(viewport=vp, is_mobile=name == "mobile", has_touch=name == "mobile")
            page = ctx.new_page()
            install_api(page)
            page.goto(base)
            page.wait_for_selector(".news-item")
            page.wait_for_timeout(800)
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f"{name}: no horizontal overflow", overflow <= 1, f"overflow {overflow}px")
            map_h = page.eval_on_selector("#trialmap", "e => e.getBoundingClientRect().height")
            check(f"{name}: map has height", map_h > 150, str(map_h))
            hidden = page.evaluate("""() => ['#heat-panel','#deals-panel','#fda-panel','#markets-panel','#news-panel','#agent-panel','#events-panel']
                .filter(s => document.querySelector(s).getBoundingClientRect().height < 120)""")
            check(f"{name}: every panel visible (none collapsed)", not hidden, str(hidden))
            small = page.evaluate("""() => [...document.querySelectorAll('button, a.btn, .tab')].filter(b => {
                const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 18; }).map(b => b.textContent.trim()).slice(0, 5)""")
            check(f"{name}: tap targets not tiny", not small, str(small))
            page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)
            ctx.close()

        # ── 6. Accessibility basics ────────────────────────────────────────
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        install_api(page)
        page.goto(base)
        page.wait_for_selector(".news-item")
        unlabeled = page.evaluate("""() => [...document.querySelectorAll('input, textarea')].filter(i => {
            if (i.type === 'hidden') return false;
            const id = i.id; return !(id && document.querySelector('label[for="'+id+'"]')) && !i.getAttribute('aria-label'); }).map(i => i.id)""")
        check("every input has a label", not unlabeled, str(unlabeled))
        page.focus("#tab-brief")
        page.keyboard.press("ArrowRight")
        check("tabs keyboard navigable", page.get_attribute("#tab-prospect", "aria-selected") == "true")
        imgs = page.evaluate("document.querySelectorAll('img:not([alt])').length")
        check("no images without alt", imgs == 0)
        ctx.close()
        browser.close()
    srv.shutdown()

    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
