# UPSC Exam Solver Agent

An intelligent agent for solving UPSC-style MCQ questions using LLM reasoning and web search verification.

## Features

- LLM-powered reasoning with extended thinking (O1-style)
- Web search integration via Serper API for fact verification
- Question classification by type (factual, statement analysis, how many correct, etc.)
- Subject area detection (Polity, Geography, Environment, Economy, etc.)
- Confidence-based answer verification with iterative refinement
- JSON schema structured output for reliable parsing
- Batch processing with comprehensive logging

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

## Project Structure

```
src/
├── agent/
│   ├── classifier.ts    # Question type and subject classification
│   └── core.ts          # Main agent logic
├── llm/
│   ├── prompts.ts       # System prompts and prompt builders
│   └── provider.ts      # LLM provider (Azure OpenAI)
├── tools/
│   ├── web-search.ts    # Serper Google Search integration
│   └── scraper.ts       # Web content scraping
├── validation/
│   ├── confidence.ts    # Confidence scoring and search triggers
│   └── self-check.ts    # Self-validation logic
└── debug-runner.ts      # Batch test runner with logging
```

## Question Types Supported

- `FACTUAL_RECALL` - Direct fact questions
- `SELECT_CORRECT` - Select correct statements
- `STATEMENT_ANALYSIS` - Analyze statement relationships
- `HOW_MANY_CORRECT` - Count correct statements
- `MATCH_PAIRS` - Matching questions
- `SEQUENCE_ORDER` - Ordering/sequence questions
- `LOGICAL_REASONING` - Logic-based questions

## Data Format

Questions should be in `questions.json`:
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

Answers should be in `answers.json`:
```json
{
  "1": "a",
  "2": "c"
}
```

## License

MIT
