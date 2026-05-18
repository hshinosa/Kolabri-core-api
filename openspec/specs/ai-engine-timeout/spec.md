# ai-engine-timeout Specification

## Purpose
TBD - created by archiving change core-api-ai-engine-resilience. Update Purpose after archive.
## Requirements
### Requirement: All AI Engine calls have explicit timeout
Setiap panggilan ke AI Engine MUST memiliki timeout yang eksplisit. Request yang melebihi timeout MUST dibatalkan dan mengembalikan error ke caller. Timeout berbeda per tipe call.

Timeout values:
- LLM calls (ask, chat, personalChat, personalChatStream): 30 detik
- Document ingest (ingestDocument): 60 detik
- Batch ingest (ingestBatch): 120 detik
- Analytics calls (analyzeEngagement, getGroupAnalytics, exportProcessMiningData): 10 detik
- Intervention calls (analyzeIntervention, generateSummary, generatePrompt): 15 detik
- Health check (isAvailable): 5 detik

#### Scenario: LLM call exceeds timeout
- **WHEN** panggilan ke AI Engine untuk LLM generation melebihi 30 detik
- **THEN** request dibatalkan dan sistem mengembalikan error "AI Engine request timed out"

#### Scenario: Health check exceeds timeout
- **WHEN** health check ke AI Engine melebihi 5 detik
- **THEN** request dibatalkan dan `isAvailable()` mengembalikan false

#### Scenario: Call completes within timeout
- **WHEN** panggilan ke AI Engine selesai sebelum timeout
- **THEN** response dikembalikan ke caller seperti biasa

### Requirement: Timeout errors are distinguishable from other errors
Error karena timeout MUST dapat dibedakan dari error lain (network error, 5xx) agar retry logic dapat membuat keputusan yang tepat.

#### Scenario: Timeout error identified correctly
- **WHEN** request ke AI Engine timeout
- **THEN** error yang dikembalikan memiliki tipe/code yang menandakan timeout (bukan generic network error)

