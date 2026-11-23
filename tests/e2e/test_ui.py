"""
End-to-end UI tests for BioPulse v3 with the backend mocked (stateful workspace store).

Run:  python3 tests/e2e/test_ui.py
Needs: pip install playwright && playwright install chromium   (or a local Chrome; set CHROME_PATH)
"""
import json
import os
import socket
import sys
import threading
import uuid
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

SCORE_TABLE = {
    "Sanofi": (81, "Hot", [("acquirer", "Acquisition (buyer)", "Report of takeover interest in Insmed by Sanofi", 8.7, 0.6)]),
    "Merck & Co.": (58, "Warm", [("partnership", "Partnership", "MSD and Isomorphic join forces " + XSS, 4.4, 3), ("new_phase3", "New Phase 3 trials", "3 new Phase 3 trials registered", 6.1, 3)]),
    "Capricor Therapeutics": (47, "Warm", [("fda_rejection", "FDA rejection", "FDA again turns back Capricor Duchenne cell therapy", 6.5, 2)]),
    "Pfizer": (0, "Quiet", []),
}


def result_for(acct):
    score, band, sigs = SCORE_TABLE.get(acct["name"], (12, "Cool", [("mention", "In the news", acct["name"] + " in the news", 1.0, 5)]))
    return {
        "id": acct["id"], "name": acct["name"], "score": score, "band": band, "S": 1,
        "partial": False, "sources": {"news": True, "trials": True, "fda": True},
        "signals": [{"id": f"{t}:{acct['id']}{i}", "type": t, "label": lab, "title": title, "source": "STAT", "url": f"https://stat.example/{acct['id']}/{i}",
                     "date": iso(days=d), "points": pts, "why": "Reason text.", "family": "news", "confidence": 1} for i, (t, lab, title, pts, d) in enumerate(sigs)],
    }


NEWS = {"fetchedAt": now.isoformat(), "items": [
    {"title": "Sanofi rumoured to be eyeing Insmed takeover", "link": "https://pt.example/1", "date": iso(hours=3), "summary": "", "source": "Pharmaceutical Technology", "sourceId": "pharmatech", "tag": "M&A"},
    {"title": "Unlisted Bio raises $90M Series B", "link": "https://fierce.example/2", "date": iso(hours=5), "summary": "", "source": "GEN", "sourceId": "gen", "tag": "FINANCING"},
    {"title": "FDA approves first drug for X", "link": "https://fda.example/3", "date": iso(hours=6), "summary": "", "source": "FDA", "sourceId": "fda", "tag": "APPROVAL"},
], "deals": [{"title": "Unlisted Bio raises $90M Series B", "link": "https://fierce.example/2", "source": "GEN", "date": iso(hours=5), "type": "Financing", "usd": 9e7, "value": "$90M"}],
    "sources": [{"id": "stat", "name": "STAT", "ok": True, "count": 3}]}
FDA = {"fetchedAt": now.isoformat(), "days": 60, "approvals": [{"date": "2026-11-18", "brand": "NELKARMI", "ingredient": "NELADALKIB", "sponsor": "NUVALENT", "application": "NDA1", "type": "New molecular entity", "priority": True, "url": "https://www.accessdata.fda.gov/x"}]}
AREAS = {"fetchedAt": now.isoformat(), "since": "2026-11-16", "total": 65228, "totalNew7d": 1122, "partial": False,
         "areas": [{"id": "onc", "name": "Oncology", "recruiting": 19208, "new7d": 198}, {"id": "cns", "name": "Neuroscience", "recruiting": 2670, "new7d": 26}]}
COUNTRIES = {"fetchedAt": now.isoformat(), "partial": False, "countries": [{"id": "840", "name": "United States", "recruiting": 22046}, {"id": "156", "name": "China", "recruiting": 11929}]}
QUOTES = {"fetchedAt": now.isoformat(), "quotes": [{"symbol": "XBI", "price": 140.18, "changePct": 1.2, "source": "Yahoo Finance"}]}
COMPANY = {"company": "x", "fetchedAt": now.isoformat(), "trials": {"activeTotal": 229, "sampled": 100, "phases": {"PHASE3": 48}, "topConditions": [{"name": "Oncology", "n": 9}], "sponsorNames": ["Merck Sharp & Dohme LLC"], "recent": [{"nct": "NCT07940309", "title": "MK-8748 study", "phases": ["PHASE3"]}]}, "fda": {"matchedSponsors": ["MERCK SHARP DOHME"], "originals": [], "supplements": 47}}
OUTREACH = {"result": {"subject": "Your Isomorphic partnership " + XSS, "email": "Hi {first name},\n\nSaw the MSD and Isomorphic news.\n\nWorth a call?", "linkedin": "Saw the MSD and Isomorphic news.", "opener": "I saw the Isomorphic news.", "angle": "Alliance data operations.", "cites": [1]}, "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat()}
PROSPECT = {"result": {"summary": "Merck is heavy in Phase 3 oncology.", "pipeline": ["48 Phase 3"], "regulatory": ["No originals"], "news": [], "background": ["Large pharma"], "questions": ["How?"], "angle": {"title": "Unify trial data", "pitch": "Fits.", "hooks": ["RWE"]}, "confidence": "medium"}, "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat()}
FIT = {"result": {"verdict": "go", "score": 82, "reasons": ["Clinical ops buyers"], "risks": ["Crowded"], "angles": ["Talk"], "targets": ["VP Clin Ops"]}, "model": "openai/gpt-oss-120b", "generatedAt": now.isoformat()}


class Backend:
    """Stateful mock of the Netlify functions."""

    def __init__(self):
        self.store = {}
        self.calls = []
        self.overrides = {}

    def handle(self, route, request):
        url = request.url
        path = url.split("/api/")[1].split("?")[0]
        body = json.loads(request.post_data) if request.post_data else None
        self.calls.append((request.method, path, url, body))

        def reply(status, data):
            return route.fulfill(status=status, content_type="application/json", body=json.dumps(data))

        if path in self.overrides:
            return reply(*self.overrides[path])
        if path == "workspace":
            wid = url.split("id=")[1].split("&")[0] if "id=" in url else None
            if request.method == "POST":
                wid = uuid.uuid4().hex[:22]
                ws = {**body["workspace"], "id": wid, "createdAt": now.isoformat(), "updatedAt": now.isoformat(), "lastSeenAt": now.isoformat(), "votes": {}, "tickers": []}
                for a in ws["accounts"]:
                    a.setdefault("id", a["name"].lower().replace(" & ", "-and-").replace(" ", "-").replace(".", ""))
                    a.setdefault("stageHistory", [])
                    a.setdefault("aliases", [])
                    a.setdefault("exclude", [])
                self.store[wid] = ws
                return reply(201, {"workspace": ws})
            if wid not in self.store:
                return reply(404, {"error": "This workspace doesn't exist or was deleted.", "code": "not_found"})
            if request.method == "GET":
                return reply(200, {"workspace": self.store[wid]})
            if request.method == "PUT":
                ws = {**body["workspace"], "id": wid, "updatedAt": datetime.now(timezone.utc).isoformat()}
                self.store[wid] = ws
                return reply(200, {"workspace": ws})
            if request.method == "DELETE":
                self.store.pop(wid, None)
                return reply(200, {"deleted": True})
        if path == "signals":
            return reply(200, {"generatedAt": now.isoformat(), "newsOk": True, "results": [result_for(a) for a in body["accounts"]]})
        if path == "ai":
            return reply(200, {"outreach": OUTREACH, "prospect": PROSPECT, "eventFit": FIT}[body["task"]])
        if path == "digest":
            return reply(200, {"sent": True, "to": "me••@acme.com", "accounts": 3})
        if path == "trials":
            return reply(200, COUNTRIES if "countries" in url else AREAS)
        table = {"news": NEWS, "fda": FDA, "quotes": QUOTES, "company": COMPANY,
                 "health": {"ok": True, "ai": {"configured": True, "model": "openai/gpt-oss-120b"}, "email": {"configured": True, "testSender": True}}}
        return reply(200, table[path])

    def count(self, method, path):
        return len([c for c in self.calls if c[0] == method and c[1] == path])

    def last(self, method, path):
        return [c for c in self.calls if c[0] == method and c[1] == path][-1]


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


RESULTS = []


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))


def new_page(browser, be, vp=(1500, 950), mobile=False):
    ctx = browser.new_context(viewport={"width": vp[0], "height": vp[1]}, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("dialog", lambda d: (errors.append("dialog: " + d.message), d.dismiss()))
    page.route("**/api/**", be.handle)
    return ctx, page, errors


def onboard(page, firm="Acme Analytics", email="me@acme.com"):
    page.click("[data-act=onboard] >> nth=0")
    page.wait_for_selector("#onboard[open]")
    page.fill("#ob-firm", firm)
    page.click("[data-ob=next]")
    page.wait_for_selector("[data-obpack]")
    page.click("[data-obpack=big-pharma]")
    page.fill("#ob-list", "Capricor Therapeutics\nPfizer")
    page.click("[data-ob=next]")
    page.fill("#ob-email", email)
    page.click("[data-ob=create]")
    page.wait_for_selector(".acard:not(.loading)")
    page.wait_for_function("document.querySelectorAll('.acard.loading').length===0")


def run():
    port = free_port()
    srv = ThreadingHTTPServer(("127.0.0.1", port), partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{port}/"
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=[f"--host-resolver-rules=MAP kingismymiddlename.github.io 127.0.0.1:{port}"])

        # ── 1. First visit, onboarding, This week ──────────────────────────
        be = Backend()
        ctx, page, errors = new_page(browser, be)
        page.goto(base)
        page.wait_for_selector(".hero h1")
        check("landing explains the product", "accounts to call" in page.inner_text(".hero h1"))
        onboard(page)
        check("workspace created via POST", be.count("POST", "workspace") == 1)
        created = be.last("POST", "workspace")[3]["workspace"]
        check("onboarding sends profile, accounts and digest", created["profile"]["firm"] == "Acme Analytics" and len(created["accounts"]) == 21 and created["digest"]["email"] == "me@acme.com", str(len(created["accounts"])))
        check("URL carries workspace id in the hash only", "#/week?w=" in page.url and "?w=" not in page.url.split("#")[0])
        check("signals requested in batches of 10 or fewer", all(len(c[3]["accounts"]) <= 10 for c in be.calls if c[1] == "signals") and be.count("POST", "signals") == 3)
        names = page.locator(".acard .acct-name").all_inner_texts()
        check("accounts ranked by score", names[:3] == ["Sanofi", "Merck & Co.", "Capricor Therapeutics"], str(names[:4]))
        check("score and band shown", "81" in page.inner_text(".acard >> nth=0") and "HOT" in page.inner_text(".acard >> nth=0").upper())
        check("XSS in signal title not executed", page.evaluate("window.__pwned") is None and XSS in page.inner_text(".acard >> nth=1"))
        check("ws chip shows firm and count", "Acme Analytics · 21 accounts" in page.inner_text("#ws-chip"))
        check("summary line counts accounts with signals", "of 21 accounts have signals" in page.inner_text("#view-week .page-hd"))
        check("market signals exclude my accounts", "Unlisted Bio raises" in page.inner_text(".week-side") and "eyeing Insmed" not in page.inner_text(".week-side"))
        check("FDA approval sponsor offered to add", "NELKARMI" in page.inner_text(".week-side"))
        check("upcoming events listed", "J.P. Morgan" in page.inner_text(".week-side"))
        page.click(".fchip[data-fam=regulatory]")
        check("family filter narrows cards", page.locator(".acard").count() == 1 and "Capricor" in page.inner_text(".acard"))
        page.click(".fchip[data-fam=all]")
        check("mention-only accounts folded into quiet group", page.locator(".acard").count() == 3 and "18 accounts with no triggers" in page.inner_text("details.quiet summary"), str(page.locator(".acard").count()))
        page.screenshot(path=str(SHOTS / "week.png"))

        # stage change -> PUT with history, north star
        puts = be.count("PUT", "workspace")
        page.select_option(".acard >> nth=0 >> select.stage-sel", "Contacted")
        page.wait_for_timeout(1000)
        last_put = be.last("PUT", "workspace")[3]["workspace"]
        sanofi = [a for a in last_put["accounts"] if a["name"] == "Sanofi"][0]
        check("stage change saved with score and trigger", be.count("PUT", "workspace") > puts and sanofi["stage"] == "Contacted" and sanofi["stageHistory"][-1]["score"] == 81 and "Insmed" in sanofi["stageHistory"][-1]["signal"])
        check("north star counts the move", page.locator(".stat b").inner_text() == "1")

        # outreach composer
        page.click(".acard >> nth=1 >> [data-compose]")
        page.wait_for_selector("#account-panel:not([hidden])")
        check("panel opens with breakdown and points", page.locator(".breakdown li").count() == 2 and "+4.4" in page.inner_text(".breakdown"))
        check("panel URL deep-links the account", "&a=merck-and-co" in page.url)
        page.click("#compose-go")
        page.wait_for_selector("#d-email")
        ai = be.last("POST", "ai")[3]
        check("outreach sends task + signal, not prompts", ai["task"] == "outreach" and ai["input"]["signal"]["label"] == "Partnership" and "system" not in json.dumps(ai))
        check("draft rendered with four parts", all(page.locator(s).count() == 1 for s in ["#d-subj", "#d-email", "#d-li", "#d-open"]))
        check("AI draft escaped", page.evaluate("window.__pwned") is None and XSS in page.inner_text("#d-subj"))
        check("draft labelled for editing", "EDIT BEFORE SENDING" in page.inner_text("#compose-out"))
        page.screenshot(path=str(SHOTS / "panel.png"))

        # vote
        page.click(".breakdown li >> nth=0 >> button[data-v='1']")
        page.wait_for_timeout(900)
        votes = be.last("PUT", "workspace")[3]["workspace"]["votes"]
        check("signal vote saved", list(votes.values()) == [1], str(votes))

        # brief
        page.click("#brief-go")
        page.wait_for_selector("#pb-copy")
        check("brief shows registry data and AI sections", "229" in page.inner_text("#brief-out") and "MODEL KNOWLEDGE" in page.inner_text("#brief-out"))
        company_call = [c for c in be.calls if c[1] == "company"][-1]
        check("brief uses registry name", "Merck%20Sharp" in company_call[2])

        # matching edit -> rescore
        before = be.count("POST", "signals")
        page.fill("#m-alias", "Merck, MSD, Merck & Co")
        page.click("#match-form button[type=submit]")
        page.wait_for_timeout(900)
        check("matching save rescored the account", be.count("POST", "signals") == before + 1)
        page.keyboard.press("Escape")
        check("Escape closes panel", page.is_hidden("#account-panel"))

        # ── Accounts view ───────────────────────────────────────────────
        page.click(".nav a[data-view=accounts]")
        page.wait_for_selector(".atable")
        check("accounts table lists all", page.locator(".atable tbody tr").count() == 21)
        page.fill("#add-name", "Moderna")
        page.fill("#add-reg", "ModernaTX, Inc.")
        page.click("#add-one button[type=submit]")
        page.wait_for_timeout(900)
        check("add one account with registry name", any(a["name"] == "Moderna" and a["registryName"] == "ModernaTX, Inc." for a in be.last("PUT", "workspace")[3]["workspace"]["accounts"]))
        page.fill("#add-list", "Takeda\nmoderna\nBiogen")
        page.click("#add-many button[type=submit]")
        page.wait_for_timeout(900)
        accts = be.last("PUT", "workspace")[3]["workspace"]["accounts"]
        check("paste list skips existing names case-insensitively", len(accts) == 22, str(len(accts)))
        row = page.locator(".atable tbody tr", has_text="Pfizer").first
        row.locator("[data-remove]").click()
        check("remove asks for confirmation", row.locator("[data-remove]").inner_text() == "Confirm")
        row.locator("[data-remove]").click()
        page.wait_for_timeout(900)
        check("account removed", not any(a["name"] == "Pfizer" for a in be.last("PUT", "workspace")[3]["workspace"]["accounts"]))

        # ── Settings ────────────────────────────────────────────────────
        page.click(".nav a[data-view=settings]")
        page.wait_for_selector("#ws-link")
        check("workspace link shown with warning", "#/week?w=" in page.input_value("#ws-link") and "like a password" in page.inner_text("#view-settings"))
        check("test-sender caveat shown", "test sender" in page.inner_text("#set-digest"))
        page.click("#dg-test")
        page.wait_for_function("document.querySelector('#dg-msg').textContent.includes('Sent')")
        check("test digest sent", be.count("POST", "digest") == 1)
        page.fill("#set-firm", "Acme Analytics Ltd")
        page.click("#set-profile button[type=submit]")
        page.wait_for_timeout(600)
        check("profile saved", be.last("PUT", "workspace")[3]["workspace"]["profile"]["firm"] == "Acme Analytics Ltd")

        # ── Reload: same workspace, cached scores ───────────────────────
        url = page.url
        page.goto(url.replace("#/settings", "#/week"))
        page.wait_for_selector(".acard:not(.loading)")
        check("reload reopens workspace from link", "Acme Analytics Ltd" in page.inner_text("#ws-chip"))

        # ── Market + Events ─────────────────────────────────────────────
        page.click(".nav a[data-view=market]")
        page.wait_for_selector("#trialmap path.leaflet-interactive")
        page.wait_for_selector(".news-item")
        check("market map renders", page.locator("#trialmap path.leaflet-interactive").count() > 100)
        check("market panel headers padded", page.eval_on_selector("#heat-panel .panel-hd", "e => getComputedStyle(e).paddingLeft") == "12px")
        page.click(".fchip[data-f=mine]")
        check("My accounts filter", page.locator(".news-item").count() == 1 and "Sanofi" in page.inner_text(".news-item"))
        page.screenshot(path=str(SHOTS / "market.png"))
        page.click(".nav a[data-view=events]")
        page.wait_for_selector(".ev")
        check("12 events", page.locator(".ev").count() == 12)
        page.click(".ev >> nth=1")
        page.click("#ev-assess")
        page.wait_for_selector("#ev-fit-a .ev-verdict")
        check("event fit renders", page.locator(".ev.v-go").count() == 1)

        # ── Delete workspace ────────────────────────────────────────────
        page.click(".nav a[data-view=settings]")
        page.click("#ws-delete")
        check("delete asks twice", "Click again" in page.inner_text("#ws-delete"))
        page.click("#ws-delete")
        page.wait_for_selector(".hero")
        check("workspace deleted on server", be.count("DELETE", "workspace") == 1 and not be.store)
        check("no JS errors in main flow", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ── 2. Demo mode is read-only ───────────────────────────────────
        be = Backend()
        ctx, page, errors = new_page(browser, be)
        page.goto(base)
        page.click("[data-act=demo] >> nth=0")
        page.wait_for_selector(".acard:not(.loading)")
        check("demo shows 12 accounts", page.locator(".acard").count() + page.locator("details.quiet li").count() == 12 and "demo" in page.inner_text("#view-week").lower())
        page.select_option(".acard >> nth=0 >> select.stage-sel", "Meeting")
        page.wait_for_selector(".toast")
        check("demo blocks edits with a prompt", "Create your own workspace" in page.inner_text("#toasts") and be.count("PUT", "workspace") == 0)
        check("demo creates nothing server-side", be.count("POST", "workspace") == 0)
        check("no JS errors in demo", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ── 3. Failure modes ────────────────────────────────────────────
        be = Backend()
        be.overrides["signals"] = (502, {"error": "Scoring failed. Try again."})
        ctx, page, errors = new_page(browser, be)
        page.goto(base)
        page.click("[data-act=onboard] >> nth=0")
        page.click("[data-ob=next]")
        page.fill("#ob-list", "Pfizer")
        page.click("[data-ob=next]")
        page.click("[data-ob=create]")
        page.wait_for_selector(".notice.warn")
        check("scoring failure shown, page usable", "could not be scored" in page.inner_text("#view-week"))
        page.goto(base + "#/week?w=" + "Z" * 22)
        page.reload()
        page.wait_for_selector("#banner:not([hidden])")
        check("unknown workspace link explained", "doesn't exist" in page.inner_text("#banner"))
        check("no uncaught errors in failure mode", not [e for e in errors if "status of" not in e], "; ".join(errors[:3]))
        ctx.close()

        # ── 4. GitHub Pages copy talks to the Netlify backend ───────────
        be = Backend()
        ctx, page, errors = new_page(browser, be)
        page.goto(f"http://kingismymiddlename.github.io:{port}/")
        page.wait_for_selector(".hero h1")
        page.wait_for_timeout(800)
        check("Pages: no backend banner", page.is_hidden("#banner"))
        check("Pages: API calls go to the Netlify site", be.calls and all("helpful-quokka-a6fbcf.netlify.app" in c[2] for c in be.calls), str([c[2] for c in be.calls[:2]]))
        onboard(page)
        check("Pages: onboarding creates a workspace", be.count("POST", "workspace") == 1)
        check("Pages: no JS errors", not errors, "; ".join(errors[:3]))
        ctx.close()

        # ── 5. Layout: mobile and tablet ────────────────────────────────
        for name, vp, mobile in [("mobile", (390, 844), True), ("tablet", (1024, 768), False)]:
            be = Backend()
            ctx, page, errors = new_page(browser, be, vp, mobile)
            page.goto(base)
            onboard(page)
            page.wait_for_timeout(500)
            for view in ["week", "accounts", "market", "events", "settings"]:
                page.click(f".nav a[data-view={view}]")
                page.wait_for_timeout(900 if view == "market" else 400)
                overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
                check(f"{name} {view}: no horizontal overflow", overflow <= 1, f"{overflow}px")
                if view in ("week", "market"):
                    page.screenshot(path=str(SHOTS / f"{name}-{view}.png"), full_page=True)
            page.click(".nav a[data-view=week]")
            page.click(".acard >> nth=0 >> [data-open] >> nth=0")  # Sanofi
            pw = page.eval_on_selector("#account-panel", "e => e.getBoundingClientRect().width")
            check(f"{name}: account panel fits screen", pw <= vp[0] + 1, str(pw))
            if mobile:
                small = page.evaluate("""() => [...document.querySelectorAll('#account-panel button, .nav a')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 30; }).map(b => b.textContent.trim()).slice(0, 5)""")
                check("mobile: tap targets at least 30px", not small, str(small))
                page.screenshot(path=str(SHOTS / "mobile-panel.png"))
            check(f"{name}: no JS errors", not errors, "; ".join(errors[:3]))
            ctx.close()

        # ── 6. Accessibility basics ─────────────────────────────────────
        be = Backend()
        ctx, page, errors = new_page(browser, be)
        page.goto(base)
        onboard(page)
        unlabeled = []
        for view in ["week", "accounts", "market", "settings"]:
            page.click(f".nav a[data-view={view}]")
            page.wait_for_timeout(500)
            unlabeled += page.evaluate("""() => [...document.querySelectorAll('input, textarea, select')].filter(i => i.offsetParent !== null && i.type !== 'hidden' && i.type !== 'checkbox').filter(i => !(i.id && document.querySelector('label[for="'+i.id+'"]')) && !i.getAttribute('aria-label') && !i.closest('label')).map(i => i.id || i.className)""")
        check("every visible input has a label", not unlabeled, str(unlabeled[:5]))
        check("nav marks current page", page.get_attribute(".nav a[data-view=settings]", "aria-current") == "page")
        ctx.close()
        browser.close()
    srv.shutdown()
    failed = [r for r in RESULTS if not r[1]]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
