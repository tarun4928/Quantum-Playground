import re

# ---- HTML checks ----
with open('templates/twoqubit.html', 'r', encoding='utf-8') as f:
    html = f.read()

def balance(tag):
    opens = len(re.findall(r'<' + tag + r'[\s>]', html))
    closes = len(re.findall(r'</' + tag + r'>', html))
    return opens, closes

print("=== Tag balance ===")
for tag in ['section', 'div', 'span', 'h2', 'h3', 'button']:
    o, c = balance(tag)
    print(f"  <{tag}>: {o} open / {c} close  {'OK' if o==c else 'MISMATCH!'}")

print("\n=== Required element IDs (expect present) ===")
required = (
    [f"twoQProb{b}" for b in ["00","01","10","11"]] +
    [f"twoQBar{b}" for b in ["00","01","10","11"]] +
    ["twoQState","twoQEquation","twoQVector","twoQStatus",
     "twoQEntConcurrence","twoQEntConcurrenceBar","twoQEntClassBadge",
     "twoQEntClassification","twoQEntKetDisplay","twoQEntStateMessage"] +
    [f"twoQEntAmp{b}" for b in ["00","01","10","11"]] +
    ["twoQRe00","twoQIm00","twoQRe11","twoQIm11"]
)
missing = [i for i in required if f'id="{i}"' not in html]
print("  Missing:", missing if missing else "NONE - all present")

print("\n=== Removed element IDs (expect absent) ===")
removed = [f"twoQEntProb{b}" for b in ["00","01","10","11"]] + \
          [f"twoQEntBar{b}" for b in ["00","01","10","11"]]
still = [i for i in removed if f'id="{i}"' in html]
print("  Still present:", still if still else "NONE - all removed")

print("\n=== Section numbering ===")
for m in re.finditer(r'panel-number">(\d+)<', html):
    print(f"  panel-number: {m.group(1)}")
for m in re.finditer(r'SECTION (\d+): ([^\n]+)', html):
    print(f"  comment: SECTION {m.group(1)}: {m.group(2).strip()}")

# ---- JS checks ----
with open('static/script.js', 'r', encoding='utf-8') as f:
    js = f.read()

print("\n=== JS gate/state display calls ===")
for fn in ['twoQGate', 'setTwoQubitStateFromInputs', 'resetTwoQubitState']:
    # find the function and check which display function it calls
    idx = js.find(f'function {fn}')
    if idx == -1:
        print(f"  {fn}: NOT FOUND")
        continue
    # look at the next ~1500 chars for updateTwoQDisplay calls
    snippet = js[idx:idx+4000]
    calls_new = snippet.count('updateTwoQDisplayNew()')
    calls_old = snippet.count('updateTwoQDisplay()') - calls_new  # old = total - new (since New contains Display)
    # more precise: count exact 'updateTwoQDisplay();' vs 'updateTwoQDisplayNew();'
    old_exact = snippet.count('updateTwoQDisplay();')
    new_exact = snippet.count('updateTwoQDisplayNew();')
    print(f"  {fn}: updateTwoQDisplay()={old_exact}  updateTwoQDisplayNew()={new_exact}")

print("\n=== JS dead references (expect 0) ===")
print("  twoQEntProb refs:", js.count('twoQEntProb'))
print("  twoQEntBar refs:", js.count('twoQEntBar'))
