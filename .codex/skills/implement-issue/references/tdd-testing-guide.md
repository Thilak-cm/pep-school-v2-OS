# Test-Driven Development (TDD) Guide

This guide explains the TDD philosophy used in the `implement-issue` skill and how to write effective tests for Pep OS.

## Why TDD?

Test-Driven Development is mandatory in this workflow because it:

- ✅ **Prevents regressions** - Existing tests run as baseline before changes; any breakage is caught immediately
- ✅ **Validates requirements** - Each acceptance criterion maps to executable tests that verify expected behavior
- ✅ **Speeds iteration** - Tests catch issues during development, not in production or manual testing
- ✅ **Documents behavior** - Tests serve as executable specifications of how code should work
- ✅ **Enables refactoring** - Safe to improve code quality when tests are passing
- ✅ **Reduces bugs** - Edge cases are thought through upfront and tested systematically

## Red-Green-Refactor Cycle

The TDD cycle consists of three phases:

```
┌─────────────────────────────────────────────┐
│   RED: Write failing test                   │
│   (Test captures requirement, fails)        │
│                ↓                            │
│   GREEN: Implement minimal code             │
│   (Code just passes test, may be rough)     │
│                ↓                            │
│   REFACTOR: Clean up code                   │
│   (Improve quality while keeping tests green│
└─────────────────────────────────────────────┘
```

Repeat this cycle for each acceptance criterion.

### Phase 1: RED (Write Failing Test)

**Goal:** Write a test that captures the acceptance criterion and fails because the feature isn't implemented yet.

**Steps:**
1. Create or open the appropriate test file
2. Write a test that clearly describes the expected behavior
3. Run the test to confirm it FAILS
4. The failing test represents the requirement

**Example:**
```javascript
// Test for: "Voice notes under 60s should transcribe within 10s"
describe('voiceTranscription', () => {
  it('should transcribe audio under 60s within 10 seconds', async () => {
    const audioData = generateMockAudio(45_000); // 45 second audio

    const startTime = Date.now();
    const result = await transcribeAudio(audioData);
    const elapsed = Date.now() - startTime;

    expect(result.transcription).toBeDefined();
    expect(elapsed).toBeLessThan(10_000); // Must complete within 10 seconds
  });
});
```

Run test:
```bash
npm run test -- voiceTranscription.test.js --reporter=spec
  ✗ should transcribe audio under 60s within 10 seconds
    Timeout detection not implemented
```

**Result:** ✅ Test fails as expected (RED phase complete)

### Phase 2: GREEN (Implement Minimal Code)

**Goal:** Write the minimal code necessary to make the test pass. Don't over-engineer or add extra features.

**Steps:**
1. Open the file being tested
2. Implement only what's needed to pass the test
3. Run the test to confirm it PASSES
4. Don't refactor yet; focus on passing the test

**Example:**
```javascript
// voiceTranscription.js
export async function transcribeAudio(audioData) {
  // Minimal implementation: just transcribe the audio
  const response = await openaiClient.audio.transcriptions.create({
    model: 'whisper-1',
    file: audioData,
    timeout: 12_000, // 12 second timeout (allows 10s transcription + buffer)
  });

  return {
    transcription: response.text,
  };
}
```

Run test:
```bash
npm run test -- voiceTranscription.test.js --reporter=spec
  ✓ should transcribe audio under 60s within 10 seconds
  ✓ [other tests still passing]
```

**Result:** ✅ Test passes and all existing tests still pass (GREEN phase complete)

### Phase 3: REFACTOR (Clean Up While Keeping Tests Green)

**Goal:** Improve code quality, consistency, and maintainability while ensuring all tests still pass.

**Steps:**
1. Review the code you just wrote
2. Identify improvements: duplicated code, inconsistent patterns, unhandled edge cases
3. Make improvements while keeping tests passing
4. Run tests after each significant change

**Example:**
```javascript
// voiceTranscription.js (improved)
const TRANSCRIPTION_TIMEOUT_MS = 12_000;
const MAX_AUDIO_DURATION_MS = 60_000;

export async function transcribeAudio(audioData, onProgress) {
  // Added progress callback for UI updates
  if (onProgress) onProgress({ stage: 'validating' });

  validateAudioData(audioData);

  if (onProgress) onProgress({ stage: 'transcribing' });

  try {
    const response = await transcribeWithTimeout(audioData);
    return {
      transcription: response.text,
      duration: audioData.duration,
      success: true,
    };
  } catch (error) {
    if (error.code === 'TIMEOUT') {
      throw new TranscriptionTimeoutError(
        'Voice transcription took too long. Please try again.',
        error
      );
    }
    throw error;
  }
}

async function transcribeWithTimeout(audioData) {
  return Promise.race([
    openaiClient.audio.transcriptions.create({
      model: 'whisper-1',
      file: audioData,
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TRANSCRIPTION_TIMEOUT_MS)
    ),
  ]);
}
```

Run tests:
```bash
npm run test -- voiceTranscription.test.js --reporter=spec
  ✓ should transcribe audio under 60s within 10 seconds
  ✓ [all tests still passing]
```

**Result:** ✅ Code is cleaner, more maintainable, tests still passing (REFACTOR complete)

## Test Types & When to Use Them

The Pep OS project uses three types of tests:

### 1. Unit Tests

**What:** Test a single function or utility in isolation

**When:** Pure functions, utilities, hooks, calculations

**Example:** Testing a utility function that formats dates or validates input

```javascript
// utils/formatDate.test.js
import { formatDate } from './formatDate.js';

describe('formatDate', () => {
  it('should format date in MM/DD/YYYY format', () => {
    const date = new Date('2025-02-20');
    expect(formatDate(date)).toBe('02/20/2025');
  });

  it('should handle null input gracefully', () => {
    expect(formatDate(null)).toBe('—');
  });
});
```

**File Location:** `montessori-os/src/utils/*.test.js`

### 2. Integration Tests

**What:** Test multiple components working together (e.g., component + hooks + service)

**When:** React components that use hooks, services that call APIs, component state management

**Example:** Testing a component that captures voice and calls a service

```javascript
// components/VoiceNoteRecorder.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceNoteRecorder } from './VoiceNoteRecorder.jsx';

describe('VoiceNoteRecorder', () => {
  it('should show progress indicator for audio > 60 seconds', async () => {
    const { rerender } = render(<VoiceNoteRecorder />);

    // Start recording longer audio
    const recordButton = screen.getByRole('button', { name: /record/i });
    await userEvent.click(recordButton);

    // Fast-forward 45 seconds (beyond 60s threshold)
    jest.useFakeTimers();
    jest.advanceTimersByTime(45_000);

    // Progress indicator should be visible
    expect(screen.getByText(/transcribing/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    jest.useRealTimers();
  });

  it('should allow retry on transcription error', async () => {
    const onError = jest.fn();
    render(<VoiceNoteRecorder onError={onError} />);

    // Simulate transcription error
    const recordButton = screen.getByRole('button', { name: /record/i });
    await userEvent.click(recordButton);

    // Error message appears
    await waitFor(() => {
      expect(screen.getByText(/transcription failed/i)).toBeInTheDocument();
    });

    // Retry button appears and works
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();

    await userEvent.click(retryButton);
    expect(onError).not.toHaveBeenCalled();
  });
});
```

**File Location:** `montessori-os/src/components/*.test.jsx`, `montessori-os/src/services/*.test.js`

### 3. E2E Tests (Rare)

**What:** Test complete user flows across multiple screens

**When:** Critical user journeys (login, create observation, submit assignment)

**Note:** These are slower and run less frequently. Most Pep OS tests are unit or integration.

## Test Specification Pattern

When writing test specifications in the plan, follow this pattern for each acceptance criterion:

```
### Acceptance Criterion [N]: [Criterion text]
- **Test Type:** Unit | Integration | E2E
- **Test File:** `path/to/test-file.test.js` (new or existing)
- **Test Description:** Should [expected behavior]
- **Edge Cases:**
  - [Edge case 1]
  - [Edge case 2]
  - [Edge case 3]
```

**Example:**
```
### Acceptance Criterion 2: Voice notes over 60s show progress indicator
- **Test Type:** Integration
- **Test File:** `montessori-os/src/components/VoiceNoteRecorder.test.jsx` (new)
- **Test Description:** Should render progress indicator when transcribing audio > 60 seconds
- **Edge Cases:**
  - Progress updates appear within 5 seconds of recording start
  - Progress bar shows accurate percentage (20%, 40%, 60%, 80%, 100%)
  - Progress disappears when transcription completes
  - User can still stop recording while progress is showing
```

## Test Coverage Requirements

The `implement-issue` skill enforces strict test coverage:

### Requirement 1: Every Acceptance Criterion Must Have a Test

Each acceptance criterion in the Linear issue must map to at least one test:

```markdown
❌ BAD:
- Acceptance Criterion 1: Voice notes should record without errors
- **No test written** → Implementation blocked

✅ GOOD:
- Acceptance Criterion 1: Voice notes should record without errors
- Test File: VoiceNoteRecorder.test.jsx
- Test: "should successfully record voice note without crashing"
```

### Requirement 2: All New Tests Must Pass Before Completion

The implementation is not complete until:
- ✅ All new tests pass
- ✅ All existing tests still pass (no regressions)
- ✅ Test coverage is >= 80% for modified files

```bash
# Before completion
$ npm run test
  ✓ 42 tests passing
  ✓ 0 tests failing
  ✓ No skipped tests
```

### Requirement 3: No Acceptance Criterion Without Test Coverage

This is a **hard stop**. The skill will not let you complete implementation if:
- ❌ An acceptance criterion lacks test coverage
- ❌ A test is failing
- ❌ Existing tests are broken (regressions)

If this happens, you must:
1. Write the missing test
2. Fix the failing test
3. Fix the regression
4. Then proceed

## Best Practices for Writing Tests

### 1. Descriptive Test Names

```javascript
// ❌ Bad: Unclear what is being tested
it('should work', () => { ... });

// ✅ Good: Clear what is being tested and expected
it('should show timeout error message after 12 seconds of transcription', () => { ... });
```

### 2. Test One Thing Per Test

```javascript
// ❌ Bad: Testing multiple behaviors in one test
it('should transcribe and show progress', () => {
  const result = await transcribeAudio(audio);
  expect(result).toBeDefined();
  expect(progressBar.visible).toBe(true);
});

// ✅ Good: One test per behavior
it('should transcribe audio successfully', () => {
  const result = await transcribeAudio(audio);
  expect(result.transcription).toBeDefined();
});

it('should show progress bar during transcription', () => {
  const { getByRole } = render(<ProgressBar />);
  expect(getByRole('progressbar')).toBeInTheDocument();
});
```

### 3. Test Edge Cases Explicitly

```javascript
// ✅ Good: Test normal cases and edge cases
it('should handle audio duration at 60 second boundary', () => {
  const audio60s = generateAudio(60_000);
  const result = await transcribeAudio(audio60s);
  expect(result.success).toBe(true);
});

it('should handle very short audio (< 1 second)', () => {
  const audio500ms = generateAudio(500);
  const result = await transcribeAudio(audio500ms);
  expect(result.success).toBe(true);
});

it('should timeout on very long audio (> 120 seconds)', () => {
  const audio180s = generateAudio(180_000);
  expect(() => transcribeAudio(audio180s)).toThrow('Timeout');
});
```

### 4. Use Setup and Cleanup Appropriately

```javascript
describe('voiceTranscription', () => {
  // Setup before each test
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  // Cleanup after each test
  afterEach(() => {
    jest.useRealTimers();
  });

  it('should transcribe audio', async () => {
    const result = await transcribeAudio(mockAudio);
    expect(result).toBeDefined();
  });
});
```

### 5. Mock External Dependencies

```javascript
// ✅ Good: Mock API calls
import * as voiceService from '../services/voiceTranscription.js';

jest.mock('../services/voiceTranscription.js');

it('should handle transcription errors', async () => {
  voiceService.transcribeAudio.mockRejectedValue(
    new Error('API timeout')
  );

  expect(() => transcribeAudio(audio)).toThrow('API timeout');
});
```

## Running Tests

### Run All Tests
```bash
npm run test
```

### Run Specific Test File
```bash
npm run test -- voiceTranscription.test.js
```

### Run Tests Matching Pattern
```bash
npm run test -- --grep "timeout"
```

### Watch Mode (Re-run on file changes)
```bash
npm run test -- --watch
```

### View Test Coverage
```bash
npm run test -- --coverage
```

## Debugging Failed Tests

### See Detailed Output
```bash
npm run test -- --reporter=spec
```

### Run Single Test
```javascript
// Mark test to run only this one
it.only('should transcribe audio', () => {
  // ...
});
```

### Add Console Logs
```javascript
it('should transcribe audio', async () => {
  console.log('Audio:', mockAudio);
  const result = await transcribeAudio(mockAudio);
  console.log('Result:', result);
  expect(result).toBeDefined();
});
```

## Common Testing Patterns in Pep OS

### Testing React Hooks
```javascript
import { renderHook, act } from '@testing-library/react';
import { useVoiceRecording } from './useVoiceRecording.js';

it('should start and stop recording', () => {
  const { result } = renderHook(() => useVoiceRecording());

  act(() => {
    result.current.startRecording();
  });
  expect(result.current.isRecording).toBe(true);

  act(() => {
    result.current.stopRecording();
  });
  expect(result.current.isRecording).toBe(false);
});
```

### Testing Firebase Service Calls
```javascript
import * as firebaseService from '../services/firebase.js';

jest.mock('../services/firebase.js');

it('should save observation to Firestore', async () => {
  firebaseService.saveObservation.mockResolvedValue({ id: 'obs-123' });

  const result = await saveObservation(mockObservation);

  expect(firebaseService.saveObservation).toHaveBeenCalledWith(mockObservation);
  expect(result.id).toBe('obs-123');
});
```

### Testing Error Scenarios
```javascript
it('should handle network error gracefully', async () => {
  const networkError = new Error('Network timeout');
  networkError.code = 'NETWORK_ERROR';

  jest.mock('../api.js', () => ({
    fetchTranscription: jest.fn().mockRejectedValue(networkError),
  }));

  expect(() => transcribeAudio(audio)).toThrow('Network timeout');
});
```

## Summary

- **Always use TDD:** Write tests before implementation code
- **Every acceptance criterion needs tests:** This is enforced by the skill
- **Red-Green-Refactor:** Follow the cycle for each criterion
- **Test edge cases:** Not just the happy path
- **Run existing tests first:** Establish baseline before changes
- **Keep tests passing:** No completion without passing tests
- **Test coverage matters:** Tracks implementation quality and prevents regressions

TDD is not a burden—it's a safety net that gives you confidence to refactor, prevents bugs, and documents expected behavior. Embrace it.
