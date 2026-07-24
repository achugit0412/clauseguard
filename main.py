import logging
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from backend.analyzer import analyze_legal_text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("clauseguard.main")

app = FastAPI(
    title="ClauseGuard API",
    description="Legal clause risk classification and plain-English breakdown API",
    version="1.0.0"
)

# Enable CORS for Chrome Extensions and local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    text: str = Field(..., description="Extracted legal text to analyze")
    url: Optional[str] = Field(None, description="Page URL being analyzed")

class ClauseItem(BaseModel):
    text: str
    category: str
    severity: str
    explanation: str

class AnalyzeResponse(BaseModel):
    risk_score: str
    summary: str
    clauses: List[ClauseItem]

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "ClauseGuard Backend"}

@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest):
    if not req.text or len(req.text.strip()) < 20:
        raise HTTPException(status_code=400, detail="Insufficient legal text provided for analysis.")

    logger.info(f"Received analysis request (length: {len(req.text)} chars, URL: {req.url or 'N/A'})")
    try:
        result = analyze_legal_text(req.text)
        return result
    except Exception as e:
        logger.error(f"Error during analysis: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to analyze legal text.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
