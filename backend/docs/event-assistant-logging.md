# Event Assistant Diagnostics Logging

## JSONL Path

- Env: `EVENT_ASSISTANT_LOG_DIR`
  - Dev default: `backend/.logs/event-assistant`
  - Prod default: `/data/logs/event-assistant`
- File name:
  - `event-assistant-YYYY-MM-DD.jsonl`
  - `event-assistant-YYYY-MM-DD.summary.json`

## JSONL Schema (turn-level)

Each request to `/ai/events/assistant` appends one line:

```json
{
  "ts": "2025-01-14T12:00:00+09:00",
  "day": "2025-01-14",
  "env": "dev",
  "requestId": "ea-...",
  "conversationId": "conv-...",
  "turnIndex": 0,
  "input": {
    "userText": "redacted",
    "uiAction": "confirm_draft",
    "uiMode": "normal",
    "locale": "ja",
    "timezone": "Asia/Tokyo"
  },
  "machine": {
    "promptPhase": "collect",
    "loopTriggered": false,
    "missingKeys": ["time", "price"],
    "candidateKeys": ["time"],
    "confirmedKeys": ["location"],
    "nextQuestionKey": "time",
    "draftReady": false,
    "messageSource": "backend.ui",
    "decisionTrace": {
      "forcedNextQuestionKey": null,
      "missingAllBeforeNormalizer": ["time", "price"],
      "missingAllAfterNormalizer": ["time", "price"],
      "finalNextQuestionKey": "time"
    }
  },
  "parser": {
    "time": {
      "rawText": "redacted",
      "candidateStartAt": null,
      "candidateEndAt": null,
      "parserInputSource": "userText",
      "confidence": 0.7,
      "ok": false,
      "reason": "no_range"
    },
    "price": {
      "rawText": "redacted",
      "candidateAmount": 4000,
      "currency": "JPY",
      "type": "per_person",
      "unitRaw": "円",
      "unitSlipCandidate": false,
      "slipReason": null,
      "parserInputSource": "userText",
      "confidence": 0.7,
      "ok": true,
      "reason": "parsed"
    }
  },
  "llm": {
    "ledger": [
      { "name": "router", "allowed": true, "reason": "turn0_parse_only" }
    ],
    "callsCount": 1
  },
  "draft": {
    "publicActivityDraft": {
      "title": "BBQ",
      "startAt": "2025-01-23T10:00:00.000Z",
      "endAt": "2025-01-23T12:00:00.000Z",
      "location": "渋谷",
      "price": "4000円",
      "capacity": "20"
    },
    "draftHash": "..."
  },
  "output": {
    "assistantMessageText": "redacted",
    "uiQuestionText": "redacted",
    "choiceQuestion": null
  },
  "quality": {
    "failureTypes": ["SAID_BUT_MISSING"],
    "signals": {
      "repeatQuestion": false,
      "saidButMissing": true,
      "stageMismatch": false,
      "actionNoEffect": false
    }
  }
}
```

## Summary JSON

The daily summary file aggregates:

- `totalTurns`
- `failureTypeCounts`
- `topMissingKeys`
- `topNextQuestionKeys`
- `topParserFailures`
- `topExamples` (up to 5 per failure type, redacted)

## Daily Report Script

Run:

```bash
node -r ts-node/register scripts/daily-report.ts
```

Outputs:
- Top 5 failure types
- Top missing keys
- Parser failures
- Writes optimize prompt to `event-assistant-YYYY-MM-DD.optimize-prompt.txt`
