# Quantum Playground

Interactive quantum-physics simulator built with Flask, NumPy, Plotly and MathJax.

## Run locally

```powershell
pip install -r requirements.txt
python app.py
```

Open `http://127.0.0.1:5000/`.

## Render

Build Command: `pip install -r requirements.txt`
Start Command: `gunicorn app:app`

For deployment, set a `SECRET_KEY` environment variable.
