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
  const subcollectionNames = subcollections.map((collection) => collection.id);
  const classification = classifyEmptyChat({
    messageCount: messages.size,
    turns: turnDocs,
    subcollectionNames,
  });
  return { chatDoc, turnDocs, subcollectionNames, classification };
}

function sameIds(left, right) {
  return [...left].sort().join("\n") === [...right].sort().join("\n");
}

/**
 * Revalidates documents and performs all deletes in one Firestore transaction.
 * The preceding structural inspection protects unknown/nested collections;
 * transactional queries then prevent message inserts or turn changes from
 * racing the destructive writes.
 */
export async function deleteEmptyChatSafely({ db, chatRef, expectedTerminalTurnIds }) {
  const currentSnapshot = await chatRef.get();
  if (!currentSnapshot.exists) return { deleted: false, reason: "chat no longer exists" };

  const preflight = await inspectChat(currentSnapshot);
  if (preflight.classification.action !== "delete") {
    return { deleted: false, reason: `changed since scan: ${preflight.classification.reason}` };
  }

  const preflightTurnIds = preflight.turnDocs.map((turn) => turn.id);
  if (!sameIds(preflightTurnIds, expectedTerminalTurnIds)) {
    return { deleted: false, reason: "changed since scan: terminal turn IDs changed" };
  }

  return db.runTransaction(async (transaction) => {
    const [chatSnapshot, messages, turns] = await Promise.all([
      transaction.get(chatRef),
      transaction.get(chatRef.collection("messages").limit(1)),
      transaction.get(chatRef.collection("turns")),
    ]);
    if (!chatSnapshot.exists) return { deleted: false, reason: "chat no longer exists" };

    const transactionTurnIds = turns.docs.map((turn) => turn.id);
    if (!sameIds(transactionTurnIds, expectedTerminalTurnIds)) {
      return { deleted: false, reason: "changed since scan: terminal turn IDs changed" };
    }

    const preflightTurns = new Map(preflight.turnDocs.map((turn) => [turn.id, turn]));
    const turnDocs = turns.docs.map((turn) => ({
      id: turn.id,
      status: turn.data()?.status,
      ref: turn.ref,
      subcollectionNames: preflightTurns.get(turn.id)?.subcollectionNames || [],
    }));
    const classification = classifyEmptyChat({
      messageCount: messages.size,
      turns: turnDocs,
      subcollectionNames: preflight.subcollectionNames,
    });
    if (classification.action !== "delete") {
      return { deleted: false, reason: `changed since scan: ${classification.reason}` };
    }

    // Firestore does not cascade parent deletes. Every known child delete and
    // the parent delete commit atomically with the reads above.
    for (const turn of turnDocs) transaction.delete(turn.ref);
    transaction.delete(chatRef);
    return { deleted: true };
  });
}
