import re

path = 'templates/twoqubit.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1) Retitle SECTION 3 comment (it now also holds measurement probabilities)
content = content.replace(
    'SECTION 3: TWO-QUBIT STATE DISPLAY',
    'SECTION 3: TWO-QUBIT STATE & MEASUREMENT PROBABILITIES', 1)

# 2) Remove the workspace-grid opening <div> and dedent the section that followed
content = re.sub(
    r'(=+ -->)\n<div class="workspace-grid">\n\n    <section class="panel">',
    r'\1\n\n<section class="panel">',
    content, count=1)

# 3) Remove the duplicate SECTION 4 (Measurement Probabilities) panel and the
#    workspace-grid closing </div>: slice from the SECTION 4 comment to the
#    SECTION 5 comment.
i4 = content.find('SECTION 4: MEASUREMENT PROBABILITIES')
i5 = content.find('SECTION 5: ENTANGLEMENT ANALYSIS')
assert i4 != -1, 'section 4 marker not found'
assert i5 != -1, 'section 5 marker not found'
start = content.rfind('<!--', 0, i4)   # start of SECTION 4 comment
end = content.rfind('<!--', 0, i5)     # start of SECTION 5 comment
assert start != -1 and end != -1 and start < end
content = content[:start].rstrip() + '\n\n' + content[end:]

# 4) Remove the "Measurement Probabilities (Analysis)" subsection from the
#    entanglement panel (heading + prob grid), keeping the Analyze button.
ih = content.find('<h3 class="subheading">Measurement Probabilities (Analysis)</h3>')
ib = content.find('<button class="primary-btn full-btn" onclick="runTwoQEntanglementAnalysis()">')
assert ih != -1, 'analysis prob heading not found'
assert ib != -1, 'analyze button not found'
assert ih < ib
content = content[:ih].rstrip() + '\n\n    ' + content[ib:]

# 5) Renumber SECTION 5 -> 4 (comment + panel-number)
content = content.replace('SECTION 5: ENTANGLEMENT ANALYSIS',
                          'SECTION 4: ENTANGLEMENT ANALYSIS', 1)
content = content.replace(
    '<span class="panel-number">05</span>\n            <h2>Entanglement Analysis</h2>',
    '<span class="panel-number">04</span>\n            <h2>Entanglement Analysis</h2>', 1)

# 6) Renumber SECTION 6 -> 5 (comment + panel-number)
content = content.replace('SECTION 6: THE FOUR BELL STATES',
                          'SECTION 5: THE FOUR BELL STATES', 1)
content = content.replace(
    '<span class="panel-number">06</span>\n            <h2>The Four Bell States</h2>',
    '<span class="panel-number">05</span>\n            <h2>The Four Bell States</h2>', 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

# ---- verification ----
checks = {
    'workspace-grid (expect 0)': content.count('workspace-grid'),
    'SECTION 4: MEASUREMENT PROBABILITIES (expect 0)': content.count('SECTION 4: MEASUREMENT PROBABILITIES'),
    'twoQEntProb (expect 0)': content.count('twoQEntProb'),
    'twoQEntBar (expect 0)': content.count('twoQEntBar'),
    'Measurement Probabilities (Analysis) (expect 0)': content.count('Measurement Probabilities (Analysis)'),
    'twoQProb00 (expect 1)': content.count('twoQProb00'),
    'SECTION 4: ENTANGLEMENT ANALYSIS (expect 1)': content.count('SECTION 4: ENTANGLEMENT ANALYSIS'),
    'SECTION 5: THE FOUR BELL STATES (expect 1)': content.count('SECTION 5: THE FOUR BELL STATES'),
    'panel-number>04 (expect 1)': content.count('panel-number">04<'),
    'panel-number>05 (expect 1)': content.count('panel-number">05<'),
}
for k, v in checks.items():
    print(f'{v:3d}  {k}')
