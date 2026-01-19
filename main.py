from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

app = FastAPI()

# API Route example
@app.get("/api/status")
def get_status():
    return {"status": "Budget App is Online", "database": "Connected"}

# Serve the static files (HTML/CSS/JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Catch-all route to serve index.html
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    return FileResponse("static/index.html")