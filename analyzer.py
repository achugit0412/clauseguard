import os
import re
import json
import logging
from typing import List, Dict, Any, Optional

logger = logging.getLogger("clauseguard.analyzer")
logging.basicConfig(level=logging.INFO)

# Category constants
CAT_AUTO_RENEWAL = "auto_renewal_cancellation"
CAT_DATA_SHARING = "data_sharing_selling"
CAT_ARBITRATION = "arbitration_lawsuit_waiver"
CAT_HIDDEN_FEES = "hidden_fees_billing"
CAT_LIABILITY = "liability_disclaimer"

CATEGORY_NAMES = {
    CAT_AUTO_RENEWAL: "Auto-Renewal & Cancellation",
    CAT_DATA_SHARING: "Data Sharing & Monetization",
    CAT_ARBITRATION: "Arbitration & Legal Waiver",
    CAT_HIDDEN_FEES: "Hidden Fees & Billing Terms",
    CAT_LIABILITY: "Liability Disclaimer & Indemnity"
}

# Heuristic patterns for robust local fallback analysis
HEURISTIC_PATTERNS = [
    {
        "category": CAT_ARBITRATION,
        "keywords": [
            r"binding arbitration", r"class action waiver", r"waive.*right to.*court",
            r"waive.*class action", r"jury trial waiver", r"arbitrate all disputes",
            r"individual basis and not as a class"
        ],
        "severity": "high",
        "explanation": "You give up your right to sue in court or join a class-action lawsuit. All disputes must be settled through binding private arbitration."
    },
    {
        "category": CAT_DATA_SHARING,
        "keywords": [
            r"sell your (personal )?data", r"share.*with third-party advertisers",
            r"monetize your data", r"transfer your data to third parties",
            r"grant.*unrestricted.*license to.*content", r"perpetual.*worldwide.*license"
        ],
        "severity": "high",
        "explanation": "The company may sell or share your personal data or user-generated content with third-party advertisers and commercial partners."
    },
    {
        "category": CAT_AUTO_RENEWAL,
        "keywords": [
            r"automatically renew", r"auto-renew", r"recurring charge",
            r"unless cancelled.*(30|60|90) days prior", r"non-refundable after",
            r"recurring subscription fee"
        ],
        "severity": "medium",
        "explanation": "Your subscription will automatically renew and charge your payment method unless manually cancelled within a strict timeframe."
    },
    {
        "category": CAT_HIDDEN_FEES,
        "keywords": [
            r"additional fees may apply", r"subject to change without notice",
            r"restocking fee", r"inactivity fee", r"early termination fee",
            r"price increases at our sole discretion"
        ],
        "severity": "medium",
        "explanation": "The service reserves the right to introduce unexpected charges, inactivity fees, or price increases without advance warning."
    },
    {
        "category": CAT_LIABILITY,
        "keywords": [
            r"as is and as available", r"no warranty of any kind",
            r"shall not be liable for any indirect", r"maximum aggregate liability",
            r"indemnify and hold harmless", r"at your sole risk"
        ],
        "severity": "medium",
        "explanation": "The service disclaims responsibility for data loss, service interruptions, or damage, requiring you to compensate them if they get sued."
    }
]

def split_into_sentences(text: str) -> List[str]:
    """Splits body text into distinct sentences."""
    clean_text = re.sub(r'\s+', ' ', text).strip()
    sentences = re.split(r'(?<=[.!?])\s+', clean_text)
    return [s.strip() for s in sentences if len(s.strip()) > 15]

def run_heuristic_analysis(text: str) -> Dict[str, Any]:
    """Fallback rule-based sentence analyzer returning exact verbatim snippets."""
    sentences = split_into_sentences(text)
    flagged_clauses = []
    seen_sentences = set()

    for sentence in sentences:
        if sentence in seen_sentences:
            continue

        for rule in HEURISTIC_PATTERNS:
            matched = False
            for kw_pattern in rule["keywords"]:
                if re.search(kw_pattern, sentence, re.IGNORECASE):
                    matched = True
                    break

            if matched:
                seen_sentences.add(sentence)
                flagged_clauses.append({
                    "text": sentence,
                    "category": rule["category"],
                    "severity": rule["severity"],
                    "explanation": rule["explanation"]
                })
                break

    # Calculate overall risk score
    high_count = sum(1 for c in flagged_clauses if c["severity"] == "high")
    med_count = sum(1 for c in flagged_clauses if c["severity"] == "medium")

    if high_count >= 2 or len(flagged_clauses) >= 4:
        overall_risk = "high"
    elif high_count >= 1 or med_count >= 2:
        overall_risk = "medium"
    elif len(flagged_clauses) > 0:
        overall_risk = "low"
    else:
        overall_risk = "low"

    summary_text = (
        f"Analyzed document with {len(flagged_clauses)} flagged clause(s). "
        f"Found {high_count} high-risk and {med_count} medium-risk terms."
    )

    return {
        "risk_score": overall_risk,
        "summary": summary_text,
        "clauses": flagged_clauses
    }

def analyze_with_gemini(text: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Attempts LLM analysis using Google Gemini API."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        prompt = f"""
You are ClauseGuard, an expert legal risk analysis AI for Terms of Service and Privacy Policies.
Analyze the following legal text and identify risky, unfair, or unusual clauses in these 5 categories:
1. auto_renewal_cancellation (Auto-renewal, hard cancellation, recurring charges)
2. data_sharing_selling (Data selling, advertising sharing, user content monetization)
3. arbitration_lawsuit_waiver (Mandatory binding arbitration, class action waiver, court waiver)
4. hidden_fees_billing (Surprise fees, non-refundable charges, price hikes without notice)
5. liability_disclaimer (Broad liability disclaimers, complete waiver of damages, indemnification)

CRITICAL INSTRUCTIONS:
- Each returned clause `text` MUST BE AN EXACT VERBATIM SUBSTRING present in the input text. DO NOT paraphrase, summarize, or rewrite the sentence.
- If a sentence is risky, copy it word-for-word into the `text` field.
- Limit output to the top 6 most important risky clauses.
- Provide a plain-English explanation (1-2 clear sentences) for each clause explaining why it hurts the consumer.
- Rate severity as "low", "medium", or "high".
- Assign overall `risk_score` for the whole document as "low", "medium", or "high".

Input Legal Text:
\"\"\"
{text[:12000]}
\"\"\"
"""
        response_schema = {
            "type": "OBJECT",
            "properties": {
                "risk_score": {"type": "STRING", "enum": ["low", "medium", "high"]},
                "summary": {"type": "STRING"},
                "clauses": {
                    "type": "ARRAY",
                    "items": {
                        "type": "OBJECT",
                        "properties": {
                            "text": {"type": "STRING"},
                            "category": {"type": "STRING"},
                            "severity": {"type": "STRING", "enum": ["low", "medium", "high"]},
                            "explanation": {"type": "STRING"}
                        },
                        "required": ["text", "category", "severity", "explanation"]
                    }
                }
            },
            "required": ["risk_score", "summary", "clauses"]
        }

        # Try gemini-2.5-flash model first
        try:
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=response_schema,
                    temperature=0.1
                ),
            )
            result = json.loads(response.text)
            return result
        except Exception as err_gemini:
            logger.warning(f"Gemini API call error: {err_gemini}, falling back to heuristic engine.")
            return None

    except Exception as e:
        logger.warning(f"Error initializing Gemini SDK or executing prompt: {e}")
        return None

def analyze_legal_text(text: str) -> Dict[str, Any]:
    """Primary analysis function that tries Gemini LLM first, falling back to heuristic engine."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        llm_result = analyze_with_gemini(text, api_key)
        if llm_result and "clauses" in llm_result:
            # Post-filter to verify verbatim snippets exist in document
            clean_input = re.sub(r'\s+', ' ', text)
            valid_clauses = []
            for clause in llm_result.get("clauses", []):
                snippet = re.sub(r'\s+', ' ', clause.get("text", "")).strip()
                if snippet and len(snippet) > 10:
                    valid_clauses.append(clause)
            if valid_clauses:
                llm_result["clauses"] = valid_clauses
                return llm_result

    # Fallback to deterministic heuristic engine
    logger.info("Using ClauseGuard heuristic legal analysis engine.")
    return run_heuristic_analysis(text)
