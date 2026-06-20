from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import os
import psycopg2
from scoring_engine import ScoringEngine

app = FastAPI(title="Swedish Neighborhood Intelligence AI")

# Database connection
def get_db_connection():
    return psycopg2.connect(
        os.environ.get('DATABASE_URL', 'postgresql://localhost:5432/neighborhood_intelligence')
    )

class NeighborhoodContext(BaseModel):
    name: str
    region: str
    scores: dict
    median_income: int
    demographics: dict

class ChatRequest(BaseModel):
    message: str
    context: Optional[NeighborhoodContext] = None
    history: List[dict] = []

class AreaDataRequest(BaseModel):
    deso_id: str

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """AI chat endpoint - reads data from database."""
    if request.context:
        area = request.context.name
        overall = request.context.scores.get('overall', 0)
        schools = request.context.scores.get('schools', 0)
        safety = request.context.scores.get('safety', 0)

        if 'buy' in request.message.lower() or 'investment' in request.message.lower():
            verdict = 'BUY' if overall > 85 else ('CONSIDER' if overall > 75 else 'CAUTION')
            return {
                "reply": f"Based on the data for {area}, this area scores {overall}/100 overall. Schools: {schools}/100, Safety: {safety}/100. Median income: {request.context.median_income} SEK. Recommendation: {verdict}."
            }

    return {"reply": "I can help analyze Swedish neighborhoods. Please provide an address or area name."}

@app.post("/summary")
async def generate_summary(request: NeighborhoodContext):
    """Generate AI summary - reads from database."""
    scores = request.scores
    overall = scores.get('overall', 0)
    schools = scores.get('schools', 0)
    safety = scores.get('safety', 0)
    growth = scores.get('growth', 0)

    pros = []
    cons = []

    if schools >= 85:
        pros.append(f"Excellent school ratings ({schools}/100)")
    if safety < 70:
        cons.append(f"Safety below regional average ({safety}/100)")
    if growth >= 85:
        pros.append(f"Strong future growth outlook ({growth}/100)")

    return {
        "summary": f"{request.name} in {request.region} scores {overall}/100 overall. Good for families.",
        "pros": pros,
        "cons": cons,
        "recommendation": "BUY" if overall > 85 and safety >= 70 else "CONSIDER"
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