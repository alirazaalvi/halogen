from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os
import psycopg2

app = FastAPI(title="Swedish Neighborhood Intelligence AI")

# Database connection
def get_db_connection():
    return psycopg2.connect(
        os.environ.get('DATABASE_URL', 'postgresql://localhost:5432/neighborhood_intelligence')
    )

class NeighborhoodContext(BaseModel):
    name: str
    region: str = ""
    scores: dict = {}
    median_income: Optional[int] = None
    demographics: dict = {}

class ChatRequest(BaseModel):
    message: str
    context: Optional[NeighborhoodContext] = None
    history: List[dict] = []

class AreaDataRequest(BaseModel):
    deso_id: str

SCORE_LABELS = {
    "schools": "Schools",
    "transport": "Transport",
    "safety": "Safety",
    "green": "Green areas",
    "growth": "Future growth",
    "demographics": "Demographics",
    "housing": "Housing stock",
}


def describe_scores(scores: dict) -> tuple[list[str], list[str]]:
    """Returns (available, missing) score descriptions. Never fills in missing values."""
    available, missing = [], []
    for key, label in SCORE_LABELS.items():
        value = scores.get(key)
        if value is None:
            missing.append(label)
        else:
            available.append(f"{label}: {round(value)}/100")
    return available, missing


@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """Answers only from stored scores. Does not give investment verdicts."""
    if not request.context:
        return {"reply": "Tell me which area you are interested in and I can show what data we have for it."}

    scores = request.context.scores or {}
    available, missing = describe_scores(scores)
    overall = scores.get("overall")
    parts = [
        f"{request.context.name}: overall score {round(overall)}/100."
        if overall is not None
        else f"{request.context.name} has no overall score yet because too little data is available."
    ]
    if available:
        parts.append("Available: " + ", ".join(available) + ".")
    if missing:
        parts.append("No data yet for: " + ", ".join(missing) + ".")
    message = request.message.lower()
    if "buy" in message or "invest" in message:
        parts.append("I can't give a buy or investment recommendation from this data.")
    return {"reply": " ".join(parts)}


@app.post("/summary")
async def generate_summary(request: NeighborhoodContext):
    """Factual summary of available scores. No verdict, no inferred pros and cons."""
    available, missing = describe_scores(request.scores or {})
    overall = (request.scores or {}).get("overall")
    summary = (
        f"{request.name} in {request.region} scores {round(overall)}/100 overall."
        if overall is not None
        else f"{request.name} in {request.region} has no overall score yet."
    )
    return {
        "summary": summary,
        "available": available,
        "missing": missing,
        "recommendation": None,
    }


@app.post("/calculate-score")
async def calculate_score(request: AreaDataRequest):
    """Calculate scores using Python scoring engine - reads from DB."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM neighborhood_scores WHERE deso_id = %s",
            [request.deso_id]
        )
        scores = cursor.fetchone()
        if not scores:
            raise HTTPException(status_code=404, detail="Area not found")
        return {"scores": scores}
    finally:
        conn.close()

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "ai-intelligence"}