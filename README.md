# UPSC Exam Solver Agent

An intelligent agent for solving UPSC-style MCQ questions using LLM reasoning and web search verification.

## Features

- LLM-powered reasoning with extended thinking (O1-style)
- Web search integration via Serper API for fact verification
- Firecrawl integration for deep web content scraping
- Question classification by type (factual, statement analysis, how many correct, etc.)
- Subject area detection (Polity, Geography, Environment, Economy, etc.)
- Confidence-based answer verification with iterative refinement
- JSON schema structured output for reliable parsing
- **Parallel processing** with configurable concurrency for 10x speedup
- Batch processing with comprehensive logging

## Performance

| Mode | Time (97 questions) | Accuracy | Use Case |
|------|---------------------|----------|----------|
| Default (scraping) | ~5 minutes | ~96% | Production |
| Fast (no scraping) | ~3 minutes | ~92% | Quick testing |
| Original (sequential) | ~40 minutes | ~95% | Baseline |

**Optimization: 8-10x speedup** with parallel question processing.

## Setup

1. Install dependencies:
```bash
bun install
```

2. Configure environment variables:
```bash
cp .env.example .env
# Edit .env and add your API keys
```

Required environment variables:
- `AZURE_OPENAI_API_KEY` - Azure OpenAI API key
- `SERPER_API_KEY` - Serper API key for Google Search

Optional environment variables:
- `FIRECRAWL_API_KEY` - Firecrawl API key (if using cloud service)

## Usage

### Run a single question
```bash
bun run src/debug-runner.ts --question=7
```

### Run a batch of questions
```bash
bun run src/debug-runner.ts --batch=1
```

### Run all batches
```bash
for batch in 1 2 3 4 5 6 7 8 9 10; do
  bun run src/debug-runner.ts --batch=$batch
done
```

### Run with high accuracy mode (scraping enabled)
```bash
ENABLE_SCRAPING=true bun run src/debug-runner.ts --batch=1
```

### Run all questions with timing
```bash
time (for batch in 1 2 3 4 5 6 7 8 9 10; do
  ENABLE_SCRAPING=true bun run src/debug-runner.ts --batch=$batch
done)
```

### Solve Mode (no answer key needed)
Solve questions and get detailed explanations without requiring an answer key:

```bash
# Solve a single question
bun run src/debug-runner.ts --solve --question=5

# Solve a batch of questions
bun run src/debug-runner.ts --solve --batch=1

# Solve with high accuracy (recommended)
ENABLE_SCRAPING=true bun run src/debug-runner.ts --solve --batch=1
```

**Solve mode outputs:**
- `solved-answers.json` - Simple answer key (e.g., `{"1": "d", "2": "a"}`)
- `solved-details.json` - Detailed explanations with sources
- `logs/qX.json` - Individual question logs

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CONCURRENCY` | `20` | Number of questions to process in parallel |
| `ENABLE_SCRAPING` | `true` | Enable Firecrawl web scraping for better accuracy |

### Performance Tuning

```bash
# Default mode (scraping enabled) - ~5 min, ~96% accuracy
bun run src/debug-runner.ts --batch=1

# Fast mode (no scraping) - ~3 min, ~92% accuracy
ENABLE_SCRAPING=false bun run src/debug-runner.ts --batch=1

# Custom concurrency (if hitting rate limits)
CONCURRENCY=10 bun run src/debug-runner.ts --batch=1

# Maximum speed (if your APIs can handle it)
CONCURRENCY=30 ENABLE_SCRAPING=true bun run src/debug-runner.ts --batch=1
```

### Concurrency Benchmarks

| CONCURRENCY | Time (with scraping) | Notes |
|-------------|----------------------|-------|
| 10 | ~10 min | Conservative |
| 20 | ~5 min | **Recommended** |
| 30 | ~5 min | No improvement (API bottleneck) |

## Project Structure

```
src/
├── agent/
│   ├── classifier.ts      # Question type and subject classification
│   └── core.ts            # Main agent logic
├── llm/
│   ├── prompts.ts         # System prompts and prompt builders
│   └── provider.ts        # LLM provider (Azure OpenAI)
├── tools/
│   ├── index.ts           # Tools exports
│   ├── web-search.ts      # Serper Google Search integration
│   ├── scraper.ts         # Firecrawl web content scraping
│   ├── fact-cache.ts      # Fact caching for repeated queries
│   └── polity-search.ts   # Specialized polity search queries
├── utils/
│   └── semaphore.ts       # Concurrency control for parallel processing
├── validation/
│   ├── confidence.ts      # Confidence scoring and search triggers
│   └── self-check.ts      # Self-validation logic
└── debug-runner.ts        # Batch test runner with logging

logs/                      # Question-level logs (JSON)
questions.json             # Input questions
answers.json               # Answer key
```

## Architecture

### Processing Pipeline

1. **Classification**: Question is classified by type and subject area
2. **Initial Reasoning**: LLM analyzes question with structured JSON output
3. **Search Decision**: Based on confidence and question type, web search may be triggered
4. **Search & Scrape**: Parallel web searches, optional deep scraping with Firecrawl
5. **Refined Reasoning**: LLM re-evaluates with search context
6. **Iteration**: Up to 3 iterations until high confidence reached

### Parallel Processing

```
┌─────────────────────────────────────────────────────────┐
│                    Semaphore (20)                       │
├─────────────────────────────────────────────────────────┤
│  Q1 ──► LLM ──► Search ──► LLM ──► Answer              │
│  Q2 ──► LLM ──► Search ──► LLM ──► Answer              │
│  Q3 ──► LLM ──► Search ──► LLM ──► Answer              │
│  ...                                                    │
│  Q20 ──► LLM ──► Search ──► LLM ──► Answer             │
├─────────────────────────────────────────────────────────┤
│  Q21 waits for semaphore permit...                     │
└─────────────────────────────────────────────────────────┘
```

### Search Strategy

Questions that **always trigger search** on first iteration:
- `STATEMENT_ANALYSIS` - Statement relationship questions
- `HOW_MANY_CORRECT` - Counting correct statements
- `SEQUENCE_ORDER` - Ordering questions
- `MATCH_PAIRS` - Matching questions
- `FACTUAL_RECALL` - Direct fact questions
- Geographic matching questions (waterfalls, rivers, regions)
- Polity questions (constitutional articles, amendments)
- Economy questions (RBI, SEBI regulations)

## Question Types Supported

| Type | Description | Example |
|------|-------------|---------|
| `FACTUAL_RECALL` | Direct fact questions | "Which country is the largest cocoa producer?" |
| `SELECT_CORRECT` | Select correct statements | "Which of the following is/are correct?" |
| `STATEMENT_ANALYSIS` | Analyze statement relationships | "Statement I... Statement II... Which is correct?" |
| `HOW_MANY_CORRECT` | Count correct statements | "How many of the above are correct?" |
| `MATCH_PAIRS` | Matching questions | "Match List I with List II" |
| `SEQUENCE_ORDER` | Ordering/sequence questions | "Arrange in chronological order" |
| `LOGICAL_REASONING` | Logic-based questions | Inference and deduction |

## Data Format

### questions.json
```json
[
  {
    "id": 1,
    "question": "Question text...",
    "options": {
      "a": "Option A",
      "b": "Option B",
      "c": "Option C",
      "d": "Option D"
    }
  }
]
```

### answers.json
```json
{
  "1": "a",
  "2": "c"
}
```

### Output Logs (logs/q1.json)
```json
{
  "questionId": 1,
  "question": "...",
  "options": {...},
  "classified": {
    "type": "STATEMENT_ANALYSIS",
    "subjectArea": "GEOGRAPHY",
    "keyTerms": ["troposphere", "convection"],
    "difficulty": "MEDIUM"
  },
  "iterations": [...],
  "finalAnswer": "a",
  "finalConfidence": 0.95,
  "expectedAnswer": "a",
  "correct": true,
  "totalSearches": 4,
  "totalTime": 5234
}
```

## Batch Definitions

| Batch | Questions | Count |
|-------|-----------|-------|
| 1 | Q1-Q10 | 10 |
| 2 | Q11-Q21 (skip Q20) | 10 |
| 3 | Q22-Q31 | 10 |
| 4 | Q32-Q41 | 10 |
| 5 | Q42-Q51 (skip Q52) | 10 |
| 6 | Q53-Q63 (skip Q57) | 10 |
| 7 | Q64-Q73 | 10 |
| 8 | Q74-Q83 | 10 |
| 9 | Q84-Q93 | 10 |
| 10 | Q94-Q100 | 7 |

**Total: 97 questions**

## Troubleshooting

### Rate Limiting
If you encounter rate limit errors, reduce concurrency:
```bash
CONCURRENCY=10 bun run src/debug-runner.ts --batch=1
```

### Low Accuracy
Enable scraping for better accuracy:
```bash
ENABLE_SCRAPING=true bun run src/debug-runner.ts --batch=1
```

### Timeout Issues
Individual question timeout is set in the LLM provider. Check `src/llm/provider.ts` for configuration.

### Missing Search Results
Ensure `SERPER_API_KEY` is set correctly. Check API quota limits.

## License

MIT
