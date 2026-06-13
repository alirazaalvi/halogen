# API Documentation

## Base URL
```
http://localhost:3001
```

## Endpoints

### Search
**GET** `/api/search?q={query}`

Search for addresses or neighborhoods.

**Example:**
```bash
curl "http://localhost:3001/api/search?q=Kista"
```

**Response:**
```json
{
  "results": [
    {
      "deso_id": "123",
      "name": "Kista",
      "municipality": "Stockholm",
      "lat": 59.4036,
      "lng": 17.9446
    }
  ]
}
```

---

### Neighborhood Profile
**GET** `/api/neighborhood/{deso_id}`

Get neighborhood details and scores.

**Example:**
```bash
curl "http://localhost:3001/api/neighborhood/123"
```

**Response:**
```json
{
  "area": {
    "id": "123",
    "name": "Kista",
    "municipality": "Stockholm",
    "population": 17890,
    "coordinates": { "lat": 59.4036, "lng": 17.9446 }
  },
  "scores": {
    "overall": 92,
    "demographics": 88,
    "housing": 82,
    "transport": 94,
    "schools": 88,
    "safety": 78,
    "green": 91,
    "growth": 95
  }
}
```

---

### Neighborhood Score (API)
**GET** `/api/neighborhood-score?deso_id={id}`

Get simplified scores for API consumption.

**Example:**
```bash
curl "http://localhost:3001/api/neighborhood-score?deso_id=123"
```

**Response:**
```json
{
  "score": 92,
  "transport": 94,
  "schools": 88,
  "safety": 78,
  "housing": 82,
  "green": 91,
  "growth": 95
}
```

---

### Property Investment Analysis
**POST** `/api/investment/analyze`

Analyze property investment potential.

**Request Body:**
```json
{
  "price": 3700000,
  "area": 96,
  "fee": 6000,
  "deso_id": "123"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3001/api/investment/analyze" \
  -H "Content-Type: application/json" \
  -d '{"price":3700000,"area":96,"fee":6000,"deso_id":"123"}'
```

**Response:**
```json
{
  "metrics": {
    "pricePerSqm": 38542,
    "avgPricePerSqm": 65000,
    "marketPosition": "Below average",
    "affordability": "Affordable",
    "riskScore": 25,
    "housingScore": 82
  },
  "commute": {
    "train": 18,
    "car": 21,
    "bike": 42,
    "score": 89
  },
  "familyScore": 88
}
```

---

### AI Chat
**POST** `/api/ai/chat`

Chat with the AI assistant.

**Request Body:**
```json
{
  "message": "Should I buy in Kista?",
  "context": {
    "name": "Kista",
    "region": "Stockholm",
    "scores": { "overall": 92 }
  }
}
```

**Example:**
```bash
curl -X POST "http://localhost:3001/api/ai/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Is this area safe?"}'
```

**Response:**
```json
{
  "reply": "Kista scores 78/100 for safety. Crime rates are trending downward. Recommendation: CONSIDER."
}
```

---

### AI Summary
**POST** `/api/ai/summary`

Generate AI summary for an area.

**Request Body:**
```json
{
  "deso_id": "123"
}
```

**Example:**
```bash
curl -X POST "http://localhost:3001/api/ai/summary" \
  -H "Content-Type: application/json" \
  -d '{"deso_id":"123"}'
```

**Response:**
```json
{
  "summary": "Kista in Stockholm scores 92/100 overall...",
  "pros": ["Excellent schools", "Good transport"],
  "cons": ["Safety below average"],
  "recommendation": "BUY"
}
```

---

### Compare Neighborhoods
**GET** `/api/compare?a={id}&b={id}`

Compare two neighborhoods.

**Example:**
```bash
curl "http://localhost:3001/api/compare?a=123&b=124"
```

**Response:**
```json
{
  "comparison": [
    { "deso_id": "123", "scores": { "overall": 92, "transport": 94, "schools": 88, "safety": 78 } },
    { "deso_id": "124", "scores": { "overall": 89, "transport": 86, "schools": 94, "safety": 85 } }
  ]
}
```

---

### Data Ingestion Endpoints (Internal)

#### SCB Ingestion
**POST** `/internal/ingest/scb`

Trigger SCB demographic data ingestion.

#### BRÅ Ingestion
**POST** `/internal/ingest/bra`

Trigger crime statistics ingestion.

#### Trafiklab Ingestion
**POST** `/internal/ingest/trafiklab`

Trigger transport data ingestion.

#### SMHI Ingestion
**POST** `/internal/ingest/smhi`

Trigger environmental data ingestion.