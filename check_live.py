import urllib.request

def fetch(url):
    with urllib.request.urlopen(url, timeout=5) as resp:
        return resp.read().decode("utf-8")

base = "http://127.0.0.1:5000"
html = fetch(base + "/twoqubit")

print("=== Served /twoqubit content checks ===")
checks = {
    "HTTP fetched, length": len(html),
    "id=twoQProb00 (prob in sec 03)": 'id="twoQProb00"' in html,
    "id=twoQProb11": 'id="twoQProb11"' in html,
    "id=twoQBar00": 'id="twoQBar00"' in html,
    "Measurement Probabilities</h3> heading": "Measurement Probabilities</h3>" in html,
    "subheading Measurement Probabilities": 'class="subheading">Measurement Probabilities' in html,
    "twoQEntProb00 removed": 'twoQEntProb00' not in html,
    "twoQEntBar11 removed": 'twoQEntBar11' not in html,
    "workspace-grid removed": 'workspace-grid' not in html,
    "Measurement Probabilities (Analysis) removed": "Measurement Probabilities (Analysis)" not in html,
    "panel 03 = Two-Qubit State": 'panel-number">03<' in html,
    "panel 04 = Entanglement Analysis": 'panel-number">04<' in html,
    "panel 05 = The Four Bell States": 'panel-number">05<' in html,
    "twoQEntConcurrence present": 'id="twoQEntConcurrence"' in html,
    "Analyze button present": 'runTwoQEntanglementAnalysis()' in html,
    "twoQState present": 'id="twoQState"' in html,
    "twoQEquation present": 'id="twoQEquation"' in html,
    "twoQVector present": 'id="twoQVector"' in html,
}
for k, v in checks.items():
    print(f"  {v}  {k}")

# Show context around 'Measurement Probabilities'
import re
for m in re.finditer(r"Measurement Probabilities", html):
    s = max(0, m.start()-50)
    print("\nContext:", html[s:m.end()+40].replace("\n", " "))
