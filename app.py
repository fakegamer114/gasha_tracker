import os
import re
import json
from flask import Flask, request, jsonify
from flask_cors import CORS
from groq import Groq

app = Flask(__name__)

# In production, replace "*" with your actual frontend domain, e.g.:
# CORS(app, origins=["https://your-gacha-tracker.netlify.app"])
CORS(app)

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def extract_json_block(text):
    """Groq sometimes wraps JSON in ```json fences — strip them before parsing."""
    cleaned = re.sub(r"^```json|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(cleaned)


@app.route("/api/extract-date", methods=["POST"])
def extract_date():
    data = request.get_json(silent=True) or {}
    pasted_text = (data.get("text") or "").strip()
    game_name = (data.get("gameName") or "").strip()

    if not pasted_text:
        return jsonify({"error": "No text provided"}), 400

    # Hard cap to avoid abuse / huge token usage from one request
    pasted_text = pasted_text[:4000]

    prompt = f"""You extract banner schedule dates from gacha game news text.

Game: {game_name or "unknown"}

Text:
\"\"\"{pasted_text}\"\"\"

Return ONLY a JSON object, nothing else, no markdown fences, in this exact shape:
{{"start_date": "YYYY-MM-DD or null", "end_date": "YYYY-MM-DD or null", "confidence": "high|medium|low"}}

Rules:
- If you cannot find a clear date in the text, use null for that field and "low" confidence.
- Never invent a date that isn't supported by the text.
- Assume dates without a year are in the current or next calendar year, whichever is closer to today.
- Do not include any explanation, only the JSON object.
"""

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
        )
        raw = response.choices[0].message.content
        parsed = extract_json_block(raw)

        return jsonify({
            "start_date": parsed.get("start_date"),
            "end_date": parsed.get("end_date"),
            "confidence": parsed.get("confidence", "low"),
        })

    except json.JSONDecodeError:
        return jsonify({"error": "Could not parse AI response as JSON"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/")
def index():
    return jsonify({"status": "ok", "service": "gacha-tracker-date-extractor"})


if __name__ == "__main__":
    app.run(debug=False, host="0.0.0.0", port=5000)
