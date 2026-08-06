const FRAME_MS = 1000 / 60;
const TERMINAL_DRAIN_MS = 500;
const TOOL_CYCLE_MS = 1200;

/**
 * Keeps transport cadence separate from visual cadence. A browser read can
 * contain many SSE records, so painting one provider fragment per frame makes
 * progress visible without changing the durable transcript or SSE contract.
 */
export function createChatTokenPresentation({
  onToken,
  onProgressChange,
  onFirstPresented,
  requestFrame = requestAnimationFrame,
  cancelFrame = cancelAnimationFrame,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
  now = () => performance.now(),
}) {
  let queue = [];
  let frameId = null;
  let intervalId = null;
  let receivedToken = false;
  let presentedToken = false;
  let terminalDeadline = null;
  let drainResolvers = [];

  const resolveDrains = () => {
    const pending = drainResolvers;
    drainResolvers = [];
    pending.forEach((resolve) => resolve());
  };

  const clearProgressTimer = () => {
    if (intervalId !== null) clearIntervalFn(intervalId);
    intervalId = null;
  };

  const clearProgress = () => {
    clearProgressTimer();
    onProgressChange(null);
  };

  const schedule = () => {
    if (frameId === null && queue.length > 0) frameId = requestFrame(paintFrame);
  };

  function paintFrame() {
    frameId = null;
    if (queue.length === 0) {
      terminalDeadline = null;
      resolveDrains();
      return;
    }

    let itemCount = 1;
    if (terminalDeadline !== null) {
      const remainingMs = Math.max(FRAME_MS, terminalDeadline - now());
      const remainingFrames = Math.max(1, Math.floor(remainingMs / FRAME_MS));
      itemCount = Math.max(1, Math.ceil(queue.length / remainingFrames));
    }

    const text = queue.splice(0, itemCount).join('');
    if (!presentedToken) {
      presentedToken = true;
      clearProgress();
      onFirstPresented();
    }
    onToken(text);

    if (queue.length > 0) schedule();
    else {
      terminalDeadline = null;
      resolveDrains();
    }
  }

  return {
    enqueue(text) {
      if (!text) return;
      receivedToken = true;
      queue.push(text);
      schedule();
    },

    replaceProgress(labels) {
      if (receivedToken || presentedToken) return;
      clearProgressTimer();
      if (!labels?.length) {
        onProgressChange(null);
        return;
      }
      let index = 0;
      onProgressChange(labels[index]);
      if (labels.length > 1) {
        intervalId = setIntervalFn(() => {
          index = (index + 1) % labels.length;
          onProgressChange(labels[index]);
        }, TOOL_CYCLE_MS);
      }
    },

    drain() {
      if (queue.length === 0) return Promise.resolve();
      terminalDeadline = now() + TERMINAL_DRAIN_MS;
      schedule();
      return new Promise((resolve) => drainResolvers.push(resolve));
    },

    clear() {
      if (frameId !== null) cancelFrame(frameId);
      frameId = null;
      queue = [];
      receivedToken = false;
      presentedToken = false;
      terminalDeadline = null;
      clearProgress();
      resolveDrains();
    },

    hasReceivedToken: () => receivedToken,
    hasPresentedToken: () => presentedToken,
  };
}
