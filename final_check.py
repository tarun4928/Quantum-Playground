import urllib.request, json, re, time

def fetch(url, data=None):
    if data:
        req = urllib.request.Request(url, data=json.dumps(data).encode(),
                                     headers={"Content-Type": "application/json"}, method="POST")
    else:
        req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status, resp.read().decode("utf-8")

base = "http://127.0.0.1:5000"

# wait for server
for _ in range(20):
    try:
        fetch(base + "/twoqubit"); break
    except Exception:
        time.sleep(0.5)

print("=== /twoqubit page structure ===")
status, html = fetch(base + "/twoqubit")
print("  HTTP:", status)

sec03_ids = ["twoQState","twoQEquation","twoQVector","twoQStatus"] + \
            [f"twoQProb{b}" for b in ["00","01","10","11"]] + \
            [f"twoQBar{b}" for b in ["00","01","10","11"]]
sec04_ids = ["twoQEntConcurrence","twoQEntConcurrenceBar","twoQEntClassBadge",
             "twoQEntClassification","twoQEntKetDisplay","twoQEntStateMessage"] + \
            [f"twoQEntAmp{b}" for b in ["00","01","10","11"]]

missing03 = [i for i in sec03_ids if f'id="{i}"' not in html]
missing04 = [i for i in sec04_ids if f'id="{i}"' not in html]
print("  Section 03 (State & Probabilities) IDs missing:", missing03 or "NONE")
print("  Section 04 (Entanglement Analysis) IDs missing:", missing04 or "NONE")

removed = [f"twoQEntProb{b}" for b in ["00","01","10","11"]] + \
          [f"twoQEntBar{b}" for b in ["00","01","10","11"]]
still = [i for i in removed if f'id="{i}"' in html]
print("  Removed entanglement-lab probability IDs still present:", still or "NONE (good)")

print("  workspace-grid removed:", "workspace-grid" not in html)
print("  Old 'Measurement Probabilities (Analysis)' removed:", "Measurement Probabilities (Analysis)" not in html)

panels = [m.group(1) for m in re.finditer(r'panel-number">(\d+)<', html)]
print("  Panel numbers:", ", ".join(panels))

# headings
for m in re.finditer(r'<h2>([^<]+)</h2>', html):
    print("  <h2>:", m.group(1))

print("\n=== Live API flow (session) ===")
import http.cookiejar
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def post(path, payload):
    req = urllib.request.Request(base+path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type":"application/json"}, method="POST")
    with opener.open(req, timeout=5) as r:
        return json.loads(r.read().decode())

r = post("/api/state/set", {"state":[{"real":1,"imaginary":0},{"real":0,"imaginary":0}]})
print("  set |0>:", r.get("state_defined"))
r = post("/api/gate/H", {})
print("  H gate: success =", r.get("success"), " probs =", [round(x,2) for x in r.get("probabilities",[])])
r = post("/api/entanglement/analyze", {"amplitudes":[
    {"real":0.7071,"imaginary":0},{"real":0,"imaginary":0},
    {"real":0,"imaginary":0},{"real":0.7071,"imaginary":0}]})
print("  Bell state concurrence:", r.get("concurrence"), "class:", r.get("classification"))
r = post("/api/qkd/run", {"count":16,"eve":False})
print("  QKD: success =", r.get("success"), "sent =", r.get("summary",{}).get("sent"))

print("\n=== script.js served ===")
_, js = fetch(base + "/static/script.js")
print("  updateTwoQDisplayNew defined:", "function updateTwoQDisplayNew()" in js)
print("  twoQEntProb refs in JS:", js.count("twoQEntProb"))
print("  twoQEntBar refs in JS:", js.count("twoQEntBar"))
print("\nALL CHECKS DONE")
