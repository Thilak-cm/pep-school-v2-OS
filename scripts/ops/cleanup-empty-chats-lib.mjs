const ACTIVE_TURN_STATUSES = new Set(["persisting", "running"]);
const TERMINAL_TURN_STATUSES = new Set(["completed", "interrupted", "failed"]);
const KNOWN_SUBCOLLECTIONS = new Set(["messages", "turns"]);

export function classifyEmptyChat({ messageCount, turns = [], subcollectionNames = [] }) {
  if (messageCount > 0) {
    return { action: "keep", reason: `contains ${messageCount} message(s)` };
  }

  const unexpected = [...new Set(subcollectionNames)]
    .filter((name) => !KNOWN_SUBCOLLECTIONS.has(name))
    .sort();
  if (unexpected.length > 0) {
    return {
      action: "skip",
      reason: `unexpected subcollections: ${unexpected.join(", ")}`,
      highlight: true,
    };
  }

  for (const turn of turns) {
    if (!turn.status) {
      return { action: "skip", reason: `turn ${turn.id} has missing status`, highlight: true };
    }
    if (ACTIVE_TURN_STATUSES.has(turn.status)) {
      return { action: "skip", reason: `turn ${turn.id} has active status: ${turn.status}`, highlight: true };
    }
    if (!TERMINAL_TURN_STATUSES.has(turn.status)) {
      return { action: "skip", reason: `turn ${turn.id} has unknown status: ${turn.status}`, highlight: true };
    }
    if (turn.subcollectionNames?.length) {
      return {
        action: "skip",
        reason: `turn ${turn.id} has nested subcollections: ${[...turn.subcollectionNames].sort().join(", ")}`,
        highlight: true,
      };
    }
  }

  return { action: "delete", terminalTurnIds: turns.map((turn) => turn.id) };
}

export async function inspectChat(chatDoc) {
  const [messages, turns, subcollections] = await Promise.all([
    chatDoc.ref.collection("messages").limit(1).get(),
    chatDoc.ref.collection("turns").get(),
    chatDoc.ref.listCollections(),
  ]);
  const turnDocs = await Promise.all(turns.docs.map(async (turn) => ({
    id: turn.id,
    status: turn.data()?.status,
    ref: turn.ref,
    subcollectionNames: (await turn.ref.listCollections()).map((collection) => collection.id),
  })));
  const classification = classifyEmptyChat({
    messageCount: messages.size,
    turns: turnDocs,
    subcollectionNames: subcollections.map((collection) => collection.id),
  });
  return { chatDoc, turnDocs, classification };
}

export async function deleteEmptyChat({ chatRef, terminalTurns }) {
  // Firestore does not cascade parent deletes. Delete only the terminal turns
  // we inspected, then the empty parent; unknown subcollections never reach here.
  for (const turn of terminalTurns) await turn.ref.delete();
  await chatRef.delete();
}
