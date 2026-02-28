# Implement Issue Workflow Example

This document walks through a complete example of using the `implement-issue` skill to go from Linear issue selection to implementation with full test coverage.

## Example Scenario

You have a Linear issue: **PEP-156: Fix voice note transcription timeout bug**

The issue has:
- **Labels:** `observation-capture`, `bug`
- **Acceptance Criteria:**
  1. Voice notes under 60 seconds transcribe within 10 seconds
  2. Voice notes over 60 seconds show progress indicator
  3. Timeout error displays user-friendly message and allows retry
  4. No transcription errors should silently fail

## Phase 1: Issue Selection

### User initiates skill
```
/implement-issue
```

### Skill asks for filters
```
Questions:
1. Assignee: [me / search / null]
2. State: [Todo / In Progress / other]
3. Team: [Pep school v2 os]
4. Labels: [optional multi-select]
5. Priority: [optional]
```

### User responses
```
Assignee: me
State: Todo
Team: Pep school v2 os
Labels: [bug, observation-capture]
Priority: High
```

### Skill displays filtered results
```
Results (sorted by updated):
[1] PEP-156 Fix voice note transcription timeout bug [High] [bug, observation-capture]
[2] PEP-145 Add voice note duration limit [Normal] [observation-capture]
[3] PEP-132 Improve voice quality preprocessing [Low] [voice-processing]

Select issue (enter number or ID):
```

### User selects
```
Selection: 1  or  PEP-156
```

## Phase 2: Context Loading

### Skill auto-loads context
```
📚 Loading context...

✓ Loaded: Pep OS Overview (Area Map)
✓ Inferred area tags: observation-capture, voice-processing
✓ Spawned Explore subagent for observation-capture, voice-processing areas
✓ Found related issues: PEP-145, PEP-132

Issue Details:
- Title: Fix voice note transcription timeout bug
- State: Todo
- Acceptance Criteria:
  1. Voice notes under 60s transcribe within 10s
  2. Voice notes over 60s show progress indicator
  3. Timeout error displays user-friendly message and allows retry
  4. No transcription errors should silently fail

Area Map Integration:
- observation-capture: ✓ Record & capture voice notes
- voice-processing: ✓ Audio processing, transcription, quality
```

## Phase 3: Plan Generation

### Skill generates execution plan
```
## Summary
Fix voice transcription timeout handling by adding concurrent request management,
progress indicators for longer audio, and user-friendly error recovery with retry logic.

## Files to Modify
- `montessori-os/src/services/voiceTranscription.js` - Add timeout detection,
  progress callback, error recovery logic
- `montessori-os/src/components/VoiceNoteRecorder.jsx` - Add progress indicator UI,
  retry button, timeout error display
- `montessori-os/src/utils/voiceTranscriptionConfig.js` - Add timeout thresholds,
  progress update interval settings
- `functions/index.js` - Update voiceTranscribe callable to emit progress

## Files to Create (if any)
- `montessori-os/src/services/voiceTranscriptionQueue.js` - Centralized queue
  for managing concurrent transcription requests with timeout handling

## Test Specification

### Acceptance Criterion 1: Voice notes under 60s transcribe within 10s
- **Test Type:** Integration
- **Test File:** `montessori-os/src/services/voiceTranscription.test.js` (new)
- **Test Description:** Should transcribe audio under 60s in under 10 seconds
- **Edge Cases:**
  - Very short audio (< 5s) should still transcribe correctly
  - Exact 60s boundary conditions
  - Network latency variations

### Acceptance Criterion 2: Voice notes over 60s show progress indicator
- **Test Type:** Integration
- **Test File:** `montessori-os/src/components/VoiceNoteRecorder.test.jsx` (new)
- **Test Description:** Should render progress indicator for audio > 60s during transcription
- **Edge Cases:**
  - Progress updates at expected intervals (every 10-20%)
  - Progress disappears when transcription completes
  - Component still responds to user input during progress

### Acceptance Criterion 3: Timeout error displays user-friendly message and allows retry
- **Test Type:** Integration
- **Test File:** `montessori-os/src/services/voiceTranscription.test.js`
- **Test Description:** Should show user-friendly timeout error and enable retry
- **Edge Cases:**
  - Multiple retry attempts (should work at least 3x)
  - Different timeout durations
  - Partial progress before timeout

### Acceptance Criterion 4: No transcription errors should silently fail
- **Test Type:** Unit
- **Test File:** `montessori-os/src/services/voiceTranscription.test.js`
- **Test Description:** Should log all transcription errors to console and analytics
- **Edge Cases:**
  - Network errors
  - API errors (rate limit, 500s, etc.)
  - Malformed audio files

## Implementation Approach

**Phase 1: Add timeout detection and queue management**
1. Create `voiceTranscriptionQueue.js` with concurrent request tracking
2. Add timeout threshold detection (set to 12s for buffer)
3. Implement timeout error handling with user feedback

**Phase 2: Update UI with progress indicators**
1. Modify `VoiceNoteRecorder.jsx` to show progress for files > 60s
2. Add retry button in error state
3. Add user-friendly error messaging

**Phase 3: Update Cloud Functions for progress callbacks**
1. Add progress emission to `voiceTranscribe` function
2. Ensure backward compatibility with existing code

## Related Context
- See overview: Observation Capture area — Voice Note Recording & Transcription
- See explore context: OpenAI Whisper Integration & Error Handling
- Related issue PEP-145 discusses duration limits (consider together)

## Verification Checklist
- [ ] All 4 acceptance criteria have test coverage
- [ ] All new tests written and passing
- [ ] Existing voice-related tests still passing (no regressions)
- [ ] Manual testing: Test different audio durations (30s, 60s, 120s)
- [ ] Manual testing: Simulate timeout and verify retry flow
- [ ] Manual testing: Verify error messages are user-friendly
```

## Phase 4: Test Discovery & Baseline

### Skill detects existing tests
```
🔍 Discovering related tests...

Existing Tests Found:
- `montessori-os/src/services/voiceTranscription.test.js` ⚠️ (8 tests, 1 failing)
- `montessori-os/src/components/VoiceNoteRecorder.test.jsx` ✅ (6 tests passing)
- `functions/index.test.js` (includes voiceTranscribe function) ⚠️ (partial coverage)

Baseline Test Run:
$ npm run test -- voiceTranscription.test.js
  8 tests, 7 passing, 1 failing ⚠️

  ✅ transcribeAudio should transcribe valid audio
  ✅ transcribeAudio should handle network errors
  ✅ transcribeAudio should reject empty audio
  ⚠️ transcribeAudio should timeout after 15 seconds [FAILING - Expected timeout event]
  ✅ transcribeAudio should emit progress updates
  ✅ getTranscriptionStatus should return current status
  ✅ clearTranscriptionCache should clear cached results
  ✅ transcribeAudio should retry on temporary errors

Test Gaps Identified:
❌ Acceptance Criterion 1: No existing test for < 60s timing guarantee
❌ Acceptance Criterion 2: No test for progress indicator UI
❌ Acceptance Criterion 3: Timeout error UI flow not tested
❌ Acceptance Criterion 4: Error logging not tested

New Test Files Required:
- `montessori-os/src/services/voiceTranscription.test.js` (expand existing with new tests)
- `montessori-os/src/components/VoiceNoteRecorder.test.jsx` (expand existing with new tests)
```

## Phase 5: Plan Approval

### Skill presents summary for approval
```
IMPLEMENTATION PLAN SUMMARY
===========================

Issue: PEP-156 Fix voice note transcription timeout bug
Area Tags: observation-capture, voice-processing
Status: Ready for Implementation

Files to Modify: 4
- voiceTranscription.js (service)
- VoiceNoteRecorder.jsx (component)
- voiceTranscriptionConfig.js (config)
- index.js (Cloud Functions)

Files to Create: 1
- voiceTranscriptionQueue.js (new service)

Test Coverage: 4 acceptance criteria
- 2 Integration tests (new files or additions)
- 1 Integration test (new file or addition)
- 1 Unit test (new)
- All existing tests must continue passing

Baseline Status:
- ⚠️ 1 existing test failing (timeout test - will be fixed by implementation)
- ✅ Other 7 tests passing
- No regressions expected from fixes

Approval Needed: User confirms approach before any code changes

Approve this plan? (yes / no / edit)
```

### User approves
```
Response: yes

✅ Plan approved! Proceeding to implementation...
```

## Phase 6: Implementation (TDD)

### Skill creates feature branch
```
🌿 Creating feature branch...
$ git branch --show-current
dev
$ git checkout -b PEP-156-fix-voice-timeout
Switched to new branch 'PEP-156-fix-voice-timeout'
✓ Branch created
```

### Skill writes first test (RED phase)
```
✍️ Writing tests (RED phase)...

Creating: montessori-os/src/services/voiceTranscription.test.js

Test 1: Timeout after 12 seconds with user-friendly error
```
[Test code here - full test for timeout handling]
```

$ npm run test -- voiceTranscription.test.js --reporter=spec
  ✗ transcribeAudio should timeout after 12s and emit error
    Timeout detection not implemented

  7 passing, 1 failing (this is expected - RED phase)

✓ Confirmed: New test fails as expected (RED)
```

### Skill implements code (GREEN phase)
```
🟢 Implementing code (GREEN phase)...

Modifying: montessori-os/src/services/voiceTranscription.js
```
[Implementation code here - adds timeout logic]
```

$ npm run test -- voiceTranscription.test.js --reporter=spec
  ✓ transcribeAudio should timeout after 12s and emit error
  ✓ transcribeAudio should transcribe valid audio
  ✓ [all 8 tests passing]

  8 passing (GREEN - all tests pass)

✓ Confirmed: New test passes and all existing tests still pass
```

### Skill continues with remaining tests and implementation
```
✍️ Writing Test 2: Progress indicator for audio > 60s
$ npm run test -- VoiceNoteRecorder.test.jsx
  ✗ VoiceNoteRecorder should show progress for audio > 60s [RED]

🟢 Implementing progress UI
$ npm run test -- VoiceNoteRecorder.test.jsx
  ✓ VoiceNoteRecorder should show progress for audio > 60s [GREEN]

[Continue for remaining tests...]

Final Test Run: All Tests Passing
$ npm run test
  ✓ voiceTranscription.test.js (12 passing)
  ✓ VoiceNoteRecorder.test.jsx (10 passing)
  ✓ functions/index.test.js (voiceTranscribe updated, 15 passing)

  Total: 37 passing, 0 failing ✅
  No test regressions detected ✅
```

### Skill creates commits
```
📝 Creating commits...

$ git add montessori-os/src/services/voiceTranscription.test.js
$ git commit -m "test: add timeout and progress tests for voice transcription (PEP-156)"
[PEP-156-fix-voice-timeout 3a2f5e8] test: add timeout...

$ git add montessori-os/src/components/VoiceNoteRecorder.test.jsx
$ git commit -m "test: add UI tests for progress indicator and retry (PEP-156)"
[PEP-156-fix-voice-timeout 4b7d1a2] test: add UI tests...

$ git add montessori-os/src/services/voiceTranscription.js \
           montessori-os/src/components/VoiceNoteRecorder.jsx \
           montessori-os/src/services/voiceTranscriptionQueue.js
$ git commit -m "fix: implement timeout detection and recovery for voice transcription (PEP-156)"
[PEP-156-fix-voice-timeout 5e9c4a1] fix: implement...

$ git log --oneline -3
5e9c4a1 fix: implement timeout detection and recovery (PEP-156)
4b7d1a2 test: add UI tests for progress indicator (PEP-156)
3a2f5e8 test: add timeout and progress tests (PEP-156)

✓ All commits created with issue reference
```

## Phase 7: Linear Sync

### Skill updates Linear issue
```
📤 Syncing to Linear...

Creating comment on PEP-156...

Comment Content:
---
## Implementation Completed ✅

**Branch:** `PEP-156-fix-voice-timeout`

**Commits:**
- 3a2f5e8: test: add timeout and progress tests for voice transcription (PEP-156)
- 4b7d1a2: test: add UI tests for progress indicator and retry (PEP-156)
- 5e9c4a1: fix: implement timeout detection and recovery for voice transcription (PEP-156)

**Files Modified:**
- montessori-os/src/services/voiceTranscription.js
- montessori-os/src/components/VoiceNoteRecorder.jsx
- montessori-os/src/services/voiceTranscriptionQueue.js
- montessori-os/src/utils/voiceTranscriptionConfig.js
- functions/index.js

**Test Coverage:**
- ✅ Acceptance Criterion 1: Covered by timeout timing test
- ✅ Acceptance Criterion 2: Covered by progress indicator UI test
- ✅ Acceptance Criterion 3: Covered by error message and retry flow tests
- ✅ Acceptance Criterion 4: Covered by error logging validation test

**Test Results:**
- ✅ All 37 tests passing
- ✅ No regressions in existing tests
- ✅ 4 new tests added for acceptance criteria
- ✅ Manual testing completed for all flows

**Ready for Review**
---

✓ Comment created on PEP-156
✓ Issue state updated to "In Review"
✓ Implementation complete!
```

## Summary

The `implement-issue` workflow successfully:
1. ✅ Selected issue from filtered list
2. ✅ Auto-loaded relevant codebase context
3. ✅ Generated detailed technical plan with file paths
4. ✅ Discovered existing tests and established baseline
5. ✅ Got user approval before making changes
6. ✅ Implemented all acceptance criteria via TDD
7. ✅ Maintained 100% test passing rate with no regressions
8. ✅ Synced progress back to Linear with detailed results

The issue is now "In Review" with complete test coverage, implementation commits, and ready for PR review.
