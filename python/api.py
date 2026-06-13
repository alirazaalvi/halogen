from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
import httpx
import os

app = FastAPI(title="Swedish Neighborhood Intelligence AI")

SYSTEM_PROMPT = """You are the Swedish Neighborhood Intelligence AI. You help families decide where to live in Sweden by combining school quality, commute, green space, kids' activities, amenities, safety, housing market and future growth.

Be warm, concise, and practical. Format answers with short paragraphs and bullet points. Always reference specific data points when available.

Never invent statistics. Always cite data sources: SCB, BRÅ, Trafiklab, Skolverket, SMHI.

For property investment questions, analyze:
- Price per sqm relative to area average
- Comparison with nearby sales
- Affordability relative to median income
- Market trend based on growth score
- Risk factors from crime trends
- Commute advantages
"""

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

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    # In production, this would call the LLM API
    # For now, return a mock response based on context
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
    scores = request.scores
    overall = scores.get('overall', 0)
    transport = scores.get('transport', 0)
    safety = scores.get('safety', 0)
    schools = scores.get('schools', 0)
    growth = scores.get('growth', 0)
    
    pros = []
    cons = []
    
    if schools >= 85:
        pros.append(f"Excellent school ratings ({schools}/100)")
    if transport >= 85:
        pros.append(f"Outstanding public transport connectivity ({transport}/100)")
    if growth >= 85:
        pros.append(f"Strong future growth outlook ({growth}/100)")
    if safety < 70:
        cons.append(f"Safety below regional average ({safety}/100)")
    
    return {
        "summary": f"{request.name} in {request.region} scores {overall}/100 overall. The area offers good family amenities with median income at {request.median_income} SEK.",
        "pros": pros,
        "cons": cons,
        "recommendation": "BUY" if overall > 85 and safety >= 70 else "CONSIDER"
    }