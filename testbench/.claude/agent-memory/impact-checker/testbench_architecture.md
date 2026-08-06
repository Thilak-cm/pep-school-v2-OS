---
name: testbench_architecture
description: Testbench app dependency map — key consumers, cross-boundary contracts, high-blast utilities
type: project
---

## useRunPersistence.js — HIGH BLAST RADIUS
All workbenches call buildSavePayload:
- SoulWorkbench.jsx:142
- InterviewWorkbench.jsx:236
- DigestWorkbench.jsx:205
- HandwritingWorkbench.jsx:140
- MonthlyPlanWorkbench.jsx:150
- ReportWorkbench.jsx:210
- RunHistory.jsx:11 (getRunLabel only)

buildSavePayload accepts an optional `programId` param (added #136). Only emits it to payload when featureId === "report_generation". Other callers are unaffected because they don't pass programId and the conditional guard prevents emission.

## ReportConfig.jsx — consumed only by ReportWorkbench.jsx
Props changed in #136: `selectedStudent` removed, `programId` + `onProgramChange` added. Only one consumer.

## ReportWorkbench.jsx — consumed only by FeatureWorkbench.jsx:44
ReportWorkbench takes no props (self-contained). FeatureWorkbench renders it as `<ReportWorkbench />`.

## useSessionPersistence.js — NEW in #136
Only consumed by ReportWorkbench.jsx and its own test file.

## Cross-boundary rule
Production code (montessori-os/, functions/) must NEVER import from testbench/.
functions/testbench/report.js copies helpers from production CFs rather than importing them.
functions/testbench/index.js (testBenchRun CF) does NOT read programId from the run payload — it receives it in the live call payload from the frontend separately.

## testBenchRun CF + report_generation
CF does not consume programId from the Firestore run doc. It receives studentId, reportType, dateRangeStart/End, systemPrompt directly in the callable payload. programId stored in the Firestore run doc is for UI display/restore only.
