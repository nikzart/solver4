# UPSC Solver API Documentation

**Version:** 1.0.0
**Base URL:** `http://localhost:5005`

A high-accuracy (99%) AI-powered API for solving UPSC Civil Services exam questions and generating detailed essay answers for descriptive questions. Supports both synchronous JSON responses and real-time SSE streaming.

---

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [POST /api/v1/solve](#post-apiv1solve)
  - [POST /api/v1/solve/batch](#post-apiv1solvebatch)
  - [POST /api/v1/explain](#post-apiv1explain)
  - [GET /api/v1/health](#get-apiv1health)
- [LLM Function Calling Schema](#llm-function-calling-schema)
- [SSE Streaming Events](#sse-streaming-events)
- [Error Handling](#error-handling)
- [Examples](#examples)
- [Environment Variables](#environment-variables)

---

## Authentication

All API requests (except `/health`) require an API key passed in the `X-API-Key` header.

```bash
curl -H "X-API-Key: your-api-key" http://localhost:5005/api/v1/solve
```

**Response if missing/invalid:**
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "API key required. Include X-API-Key header."
  }
}
```

---

## Endpoints

### POST /api/v1/solve

Solve a single UPSC multiple-choice question.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The full question text (min 10 chars) |
| `options` | object | Yes | Answer options with keys `a`, `b`, `c`, `d` |
| `options.a` | string | Yes | Option A text |
| `options.b` | string | Yes | Option B text |
| `options.c` | string | Yes | Option C text |
| `options.d` | string | Yes | Option D text |
| `config` | object | No | Optional configuration |
| `config.maxIterations` | number | No | Max reasoning iterations (1-5, default: 3) |
| `config.enableSearch` | boolean | No | Enable web search verification (default: true) |
| `config.confidenceThreshold` | number | No | Stop threshold (0-1, default: 0.93) |
| `stream` | boolean | No | Enable SSE streaming (default: false) |

#### Response (Non-Streaming)

```json
{
  "answer": "c",
  "confidence": 0.99,
  "analysis": "Detailed step-by-step reasoning...",
  "classification": {
    "type": "FACTUAL_RECALL",
    "subjectArea": "GENERAL",
    "difficulty": "LOW"
  },
  "sources": ["source1.com", "source2.com"],
  "metadata": {
    "iterations": 2,
    "searchCount": 1,
    "processingTimeMs": 15234
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `answer` | string | The answer: `"a"`, `"b"`, `"c"`, or `"d"` |
| `confidence` | number | Confidence score (0.0 to 1.0) |
| `analysis` | string | Detailed reasoning explanation |
| `classification.type` | string | Question type (see [Question Types](#question-types)) |
| `classification.subjectArea` | string | Subject area (see [Subject Areas](#subject-areas)) |
| `classification.difficulty` | string | `"LOW"`, `"MEDIUM"`, or `"HIGH"` |
| `sources` | string[] | URLs/references used for verification |
| `metadata.iterations` | number | Number of reasoning iterations |
| `metadata.searchCount` | number | Number of web searches performed |
| `metadata.processingTimeMs` | number | Total processing time in milliseconds |

---

### POST /api/v1/solve/batch

Solve multiple questions in parallel with optional evaluation scoring.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `questions` | array | Yes | Array of questions (1-100) |
| `questions[].id` | string\|number | Yes | Unique identifier for the question |
| `questions[].question` | string | Yes | The question text |
| `questions[].options` | object | Yes | Options `{ a, b, c, d }` |
| `answerKey` | object | No | Map of `id` → correct answer for scoring |
| `config` | object | No | Optional configuration |
| `config.concurrency` | number | No | Parallel processing limit (1-50, default: 20) |
| `config.maxIterations` | number | No | Max iterations per question (1-5, default: 3) |

#### Response

```json
{
  "results": [
    {
      "id": 1,
      "answer": "c",
      "confidence": 0.99,
      "analysis": "...",
      "correct": true,
      "expectedAnswer": "c"
    },
    {
      "id": 2,
      "answer": "b",
      "confidence": 0.95,
      "analysis": "...",
      "correct": false,
      "expectedAnswer": "a"
    }
  ],
  "summary": {
    "total": 2,
    "correct": 1,
    "accuracy": 50.0
  },
  "metadata": {
    "totalProcessingTimeMs": 45000,
    "averageConfidence": 0.97
  }
}
```

**Note:** `correct`, `expectedAnswer`, and `summary` are only included when `answerKey` is provided.

---

### POST /api/v1/explain

Generate detailed, structured essay answers for descriptive/analytical UPSC questions. Uses AI reasoning combined with web search to produce well-researched, markdown-formatted responses.

#### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `question` | string | Yes | The descriptive question text (min 10 chars) |
| `config` | object | No | Optional configuration |
| `config.maxTokens` | number | No | Max output tokens (500-8000, default: 4096) |
| `config.enableSearch` | boolean | No | Enable web search for research (default: true) |
| `stream` | boolean | No | Enable SSE streaming (default: false) |

#### Response

```json
{
  "explanation": "## Introduction\n\nThe **Gandhara School of Art** (c. 1st century BCE...\n\n## 1. Evolution during the Kushana Period\n\n...\n\n## Conclusion\n\n...",
  "sources": ["prepp.in", "drishtiias.com"],
  "classification": {
    "type": "FACTUAL_RECALL",
    "subjectArea": "HISTORY",
    "difficulty": "HIGH"
  },
  "metadata": {
    "iterations": 2,
    "searchCount": 1,
    "processingTimeMs": 14117
  }
}
```

#### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `explanation` | string | Full essay answer in markdown format (800-2000 words) |
| `sources` | string[] | References used during research |
| `classification.type` | string | Question type classification |
| `classification.subjectArea` | string | Subject area (see [Subject Areas](#subject-areas)) |
| `classification.difficulty` | string | `"LOW"`, `"MEDIUM"`, or `"HIGH"` |
| `metadata.iterations` | number | Number of LLM passes (1 = draft only, 2 = draft + refine) |
| `metadata.searchCount` | number | Number of web searches performed |
| `metadata.processingTimeMs` | number | Total processing time in milliseconds |

---

### GET /api/v1/health

Check API health status. No authentication required.

#### Response

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "services": {
    "llm": {
      "status": "configured",
      "provider": "azure-gpt-oss-120b"
    },
    "search": {
      "status": "configured",
      "provider": "gemini-grounded"
    }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### Status Values

| Status | Description |
|--------|-------------|
| `healthy` | All services operational |
| `degraded` | Some services unavailable |
| `unhealthy` | Critical services down |

---

## LLM Function Calling Schema

Use this schema to enable an LLM (Claude, GPT, etc.) to call the API as a tool.

### OpenAI/Claude Tool Definition

```json
{
  "name": "upsc_solver",
  "description": "Solves UPSC (Union Public Service Commission) Civil Services exam questions with 99% accuracy. Uses AI reasoning combined with web search verification to provide well-reasoned answers to multiple choice questions about Indian polity, geography, economy, history, science, and current affairs.",
  "parameters": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The full text of the UPSC question, including any statements, options context, or additional information provided in the question"
      },
      "options": {
        "type": "object",
        "description": "The four answer options for the multiple choice question",
        "properties": {
          "a": {
            "type": "string",
            "description": "Option A"
          },
          "b": {
            "type": "string",
            "description": "Option B"
          },
          "c": {
            "type": "string",
            "description": "Option C"
          },
          "d": {
            "type": "string",
            "description": "Option D"
          }
        },
        "required": ["a", "b", "c", "d"]
      }
    },
    "required": ["question", "options"]
  }
}
```

### Anthropic Claude Tool Definition

```json
{
  "name": "upsc_solver",
  "description": "Solves UPSC exam questions with 99% accuracy using AI reasoning and web search verification.",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The full UPSC question text"
      },
      "options": {
        "type": "object",
        "properties": {
          "a": { "type": "string" },
          "b": { "type": "string" },
          "c": { "type": "string" },
          "d": { "type": "string" }
        },
        "required": ["a", "b", "c", "d"]
      }
    },
    "required": ["question", "options"]
  }
}
```

### Explain Tool Definition (OpenAI/Claude)

```json
{
  "name": "upsc_explain",
  "description": "Provides detailed, well-researched essay answers to UPSC Mains-style descriptive questions on Indian polity, geography, economy, history, science, and current affairs. Returns structured markdown essays with headings, examples, and data points.",
  "parameters": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The descriptive/essay question to answer in detail"
      }
    },
    "required": ["question"]
  }
}
```

### Explain Tool Definition (Anthropic Claude)

```json
{
  "name": "upsc_explain",
  "description": "Provides detailed essay answers to UPSC descriptive questions with web search verification.",
  "input_schema": {
    "type": "object",
    "properties": {
      "question": {
        "type": "string",
        "description": "The descriptive/essay question to answer"
      }
    },
    "required": ["question"]
  }
}
```

---

## SSE Streaming Events

When `stream: true` is set, the API returns Server-Sent Events for real-time progress updates.

### /solve Event Types

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `classification` | Question classified | `type`, `subjectArea`, `difficulty` |
| `iteration` | Reasoning iteration update | `iteration`, `status`, `answer?`, `confidence?` |
| `search` | Search operation update | `iteration`, `status`, `queries?`, `sourcesFound?` |
| `complete` | Final result | Full response object |
| `error` | Error occurred | `code`, `message` |

### /explain Event Types

| Event | Description | Data Fields |
|-------|-------------|-------------|
| `classification` | Question classified | `type`, `subjectArea`, `difficulty` |
| `research` | Web research phase | `status` (`searching`, `completed`, `failed`), `sourcesFound?` |
| `drafting` | Essay draft generation | `status` (`generating`, `completed`), `length?` |
| `refining` | Refining with sources | `status` (`incorporating_sources`, `completed`), `length?` |
| `complete` | Final essay result | Full response object |
| `error` | Error occurred | `code`, `message` |

### Event Format

```
event: <event-type>
data: <json-data>

```

### Example Stream

```
event: classification
data: {"type":"STATEMENT_ANALYSIS","subjectArea":"POLITY","difficulty":"MEDIUM"}

event: iteration
data: {"iteration":1,"status":"reasoning","previousAnswer":null,"previousConfidence":null}

event: iteration
data: {"iteration":1,"status":"completed","answer":"b","confidence":0.85}

event: search
data: {"iteration":1,"status":"starting","queries":["Article 112 Annual Financial Statement"]}

event: search
data: {"iteration":1,"status":"completed","sourcesFound":5}

event: iteration
data: {"iteration":2,"status":"reasoning","previousAnswer":"b","previousConfidence":0.85}

event: iteration
data: {"iteration":2,"status":"completed","answer":"c","confidence":0.97}

event: complete
data: {"answer":"c","confidence":0.97,"analysis":"...","classification":{...},"sources":[...],"metadata":{...}}
```

### Example Explain Stream

```
event: classification
data: {"type":"FACTUAL_RECALL","subjectArea":"HISTORY","difficulty":"HIGH"}

event: research
data: {"status":"searching"}

event: research
data: {"status":"completed","sourcesFound":5}

event: drafting
data: {"status":"generating"}

event: drafting
data: {"status":"completed","length":8500}

event: refining
data: {"status":"incorporating_sources"}

event: refining
data: {"status":"completed","length":12174}

event: complete
data: {"explanation":"## Introduction\n\n...","sources":[...],"classification":{...},"metadata":{...}}
```

### JavaScript SSE Client Example

```javascript
const eventSource = new EventSource('/api/v1/solve', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-key'
  },
  body: JSON.stringify({
    question: "...",
    options: { a: "...", b: "...", c: "...", d: "..." },
    stream: true
  })
});

eventSource.addEventListener('classification', (e) => {
  console.log('Classified:', JSON.parse(e.data));
});

eventSource.addEventListener('iteration', (e) => {
  console.log('Iteration:', JSON.parse(e.data));
});

eventSource.addEventListener('complete', (e) => {
  console.log('Result:', JSON.parse(e.data));
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Error:', JSON.parse(e.data));
  eventSource.close();
});
```

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": { }
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `INVALID_REQUEST` | 400 | Request validation failed |
| `INVALID_QUESTION` | 400 | Question text is invalid |
| `INVALID_OPTIONS` | 400 | Options are missing or invalid |
| `RATE_LIMITED` | 429 | LLM rate limit exceeded |
| `LLM_ERROR` | 503 | LLM service error |
| `SEARCH_ERROR` | 503 | Search service error |
| `TIMEOUT` | 504 | Request timed out |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `NOT_FOUND` | 404 | Endpoint not found |

### Validation Error Example

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Validation failed",
    "details": {
      "issues": [
        { "path": "question", "message": "Question must be at least 10 characters" },
        { "path": "options.c", "message": "Option C is required" }
      ]
    }
  }
}
```

---

## Examples

### Basic Question (curl)

```bash
curl -X POST http://localhost:5005/api/v1/solve \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "question": "Consider the following statements: Statement-I: The atmosphere is heated more by incoming solar radiation than by terrestrial radiation. Statement-II: The atmosphere is more transparent to incoming solar radiation than to terrestrial radiation. Which of the following is correct?",
    "options": {
      "a": "Both Statement-I and Statement-II are correct and Statement-II is the correct explanation for Statement-I",
      "b": "Both Statement-I and Statement-II are correct, but Statement-II is not the correct explanation for Statement-I",
      "c": "Statement-I is correct, but Statement-II is incorrect",
      "d": "Statement-I is incorrect, but Statement-II is correct"
    }
  }'
```

### Streaming Request (curl)

```bash
curl -N -X POST http://localhost:5005/api/v1/solve \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "question": "Which of the following countries are the two largest cocoa producers?",
    "options": {
      "a": "Algeria and Morocco",
      "b": "Botswana and Namibia",
      "c": "Côte d'\''Ivoire and Ghana",
      "d": "Madagascar and Mozambique"
    },
    "stream": true
  }'
```

### Essay/Descriptive Question (curl)

```bash
curl -X POST http://localhost:5005/api/v1/explain \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "question": "Analyze the evolution of the Gandhara School of Art during the Kushana period. Explain how the school synthesized Hellenistic physical aesthetics with Indian Buddhist iconography, and identify why this particular style largely failed to penetrate the southern regions of the Indian subcontinent compared to the Mathura and Amaravati schools."
  }'
```

### Essay with Streaming (curl)

```bash
curl -N -X POST http://localhost:5005/api/v1/explain \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "question": "Discuss the role of the Reserve Bank of India in managing inflation through monetary policy instruments.",
    "stream": true
  }'
```

### Batch Evaluation (curl)

```bash
curl -X POST http://localhost:5005/api/v1/solve/batch \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "questions": [
      {
        "id": 1,
        "question": "Which is the largest cocoa producer?",
        "options": { "a": "Brazil", "b": "Ghana", "c": "India", "d": "China" }
      },
      {
        "id": 2,
        "question": "The Ganga originates from which glacier?",
        "options": { "a": "Siachen", "b": "Gangotri", "c": "Zemu", "d": "Pindari" }
      }
    ],
    "answerKey": {
      "1": "b",
      "2": "b"
    }
  }'
```

### Python Client

```python
import requests

API_URL = "http://localhost:5005/api/v1/solve"
API_KEY = "your-api-key"

def solve_question(question: str, options: dict) -> dict:
    response = requests.post(
        API_URL,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": API_KEY
        },
        json={
            "question": question,
            "options": options
        }
    )
    response.raise_for_status()
    return response.json()

# Usage
result = solve_question(
    question="Which planet is known as the Red Planet?",
    options={
        "a": "Venus",
        "b": "Mars",
        "c": "Jupiter",
        "d": "Saturn"
    }
)

print(f"Answer: {result['answer']}")
print(f"Confidence: {result['confidence']:.0%}")
print(f"Analysis: {result['analysis']}")
```

### JavaScript/TypeScript Client

```typescript
interface SolveResponse {
  answer: 'a' | 'b' | 'c' | 'd';
  confidence: number;
  analysis: string;
  classification: {
    type: string;
    subjectArea: string;
    difficulty: string;
  };
  sources: string[];
  metadata: {
    iterations: number;
    searchCount: number;
    processingTimeMs: number;
  };
}

async function solveQuestion(
  question: string,
  options: { a: string; b: string; c: string; d: string }
): Promise<SolveResponse> {
  const response = await fetch('http://localhost:5005/api/v1/solve', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key',
    },
    body: JSON.stringify({ question, options }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error.message);
  }

  return response.json();
}

// Usage
const result = await solveQuestion(
  "What is the capital of India?",
  { a: "Mumbai", b: "New Delhi", c: "Kolkata", d: "Chennai" }
);

console.log(`Answer: ${result.answer} (${result.confidence * 100}% confident)`);
```

---

## Reference Data

### Question Types

| Type | Description |
|------|-------------|
| `STATEMENT_ANALYSIS` | Analyze correctness of multiple statements |
| `STATEMENT_EXPLAIN` | Does Statement-II explain Statement-I? |
| `MATCH_PAIRS` | Match items from two columns |
| `HOW_MANY_CORRECT` | Count correct statements |
| `SELECT_CORRECT` | Select correct option(s) |
| `FACTUAL_RECALL` | Direct factual question |
| `LOGICAL_REASONING` | Requires logical deduction |
| `SEQUENCE_ORDER` | Arrange in correct sequence |

### Subject Areas

| Area | Topics |
|------|--------|
| `POLITY` | Constitution, Parliament, Articles, Acts |
| `GEOGRAPHY` | Rivers, Mountains, Climate, Maps |
| `ENVIRONMENT` | Biodiversity, Conservation, Ecology |
| `SCIENCE_TECH` | Physics, Chemistry, Biology, Technology |
| `ECONOMY` | GDP, RBI, Banking, Trade |
| `HISTORY` | Ancient, Medieval, Modern India |
| `CURRENT_AFFAIRS` | Recent events, Schemes, Policies |
| `GENERAL` | Miscellaneous topics |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AZURE_OPENAI_API_KEY` | Yes | Azure OpenAI API key for LLM |
| `API_KEYS` | Yes* | Comma-separated valid API keys |
| `USE_VERTEX_AI` | No | Enable Gemini search (`true`/`false`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | No | Path to GCP service account JSON |
| `PORT` | No | Server port (default: 5005) |
| `CONCURRENCY` | No | Default parallel limit (default: 20) |
| `NODE_ENV` | No | `production` or `development` |

*In development mode, any API key is accepted if `API_KEYS` is not set.

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| `/api/v1/solve` | 60 requests/minute |
| `/api/v1/solve/batch` | 10 requests/minute |
| `/api/v1/explain` | 30 requests/minute |
| `/api/v1/health` | Unlimited |

Rate limit responses return HTTP 429 with error code `RATE_LIMITED`.

---

## Performance

| Metric | Value |
|--------|-------|
| MCQ solve | 5-20 seconds |
| Essay explain | 10-30 seconds |
| Batch (10 questions) | 20-40 seconds |
| MCQ accuracy | 99% on UPSC papers |
| Essay length | 800-2000 words (markdown) |
| Max context | 15,000 characters |
| Max iterations | 3 (configurable) |

---

## OpenAPI Specification

Full OpenAPI 3.0 spec available at runtime:

```bash
curl http://localhost:5005/
```

For integration with Swagger UI or API gateways, export the schema from the root endpoint.
