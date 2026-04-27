import * as functions from "firebase-functions/v1";
import { db, auth, Timestamp } from "../shared/firebase.js";
import { OPENAI_API_KEY, getOpenAiKey, buildChatBody, CHAT_ENDPOINT } from "../shared/openai.js";
import { CHAT_MODEL_INFO, DEFAULT_CHAT_MESSAGE_LIMIT, DEFAULT_OBSERVATION_LIMIT, CHAT_SYSTEM_PROMPT } from "../config/chatConstants.js";
import { MINI_MODEL } from "../config/modelConstants.js";

/**
 * Recursively delete a Firestore document and all its subcollections
 * @param {Firestore.DocumentReference} docRef - Document reference to delete
 * @returns {Promise<void>}
 */
async function deleteDocumentRecursively(docRef) {
  const subcollections = await docRef.listCollections();

  // Delete all subcollections first
  for (const subcollection of subcollections) {
    const subcollectionDocs = await subcollection.get();
    const deletePromises = subcollectionDocs.docs.map(doc =>
      deleteDocumentRecursively(doc.ref)
    );
    await Promise.all(deletePromises);
  }

  // Delete the document itself
  await docRef.delete();
}

export const cleanupDeletedChats = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 0 1 * *")  // First day of every month at midnight
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    console.log("[cleanupDeletedChats] Starting monthly cleanup of deleted chats");

    const cutoffDate = Timestamp.fromMillis(
      Date.now() - (31 * 24 * 60 * 60 * 1000)  // 31 days ago
    );

    try {
      // Query all chats with deleted=true and deletedAt older than 31 days
      const chatsRef = db.collectionGroup("chats");
      const query = chatsRef
        .where("deleted", "==", true)
        .where("deletedAt", "<=", cutoffDate);

      const snapshot = await query.get();
      console.log(`[cleanupDeletedChats] Found ${snapshot.size} chats to delete`);

      let deletedCount = 0;
      let errorCount = 0;

      // Process deletions in batches to avoid overwhelming Firestore
      const batchSize = 10;
      const docs = snapshot.docs;

      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = docs.slice(i, i + batchSize);
        const deletePromises = batch.map(async (doc) => {
          try {
            await deleteDocumentRecursively(doc.ref);
            deletedCount++;
            console.log(`[cleanupDeletedChats] Deleted chat ${doc.id} (${deletedCount}/${snapshot.size})`);
          } catch (error) {
            errorCount++;
            console.error(`[cleanupDeletedChats] Error deleting chat ${doc.id}:`, error);
          }
        });

        await Promise.all(deletePromises);
      }

      console.log(`[cleanupDeletedChats] Cleanup complete. Deleted: ${deletedCount}, Errors: ${errorCount}`);
      return { deletedCount, errorCount, totalFound: snapshot.size };
    } catch (error) {
      console.error("[cleanupDeletedChats] Fatal error during cleanup:", error);
      throw error;
    }
  });

/**
 * Get chat configuration from Firestore (with fallback to constants)
 * @param {string} programId - Program ID (e.g., 'toddler', 'primary', 'elementary', 'adolescent')
 * @returns {Promise<Object>} Chat configuration object
 */
async function getChatConfigServer(programId) {
  // Default fallback values
  const defaults = {
    model: CHAT_MODEL_INFO.model,
    temperature: CHAT_MODEL_INFO.temperature,
    max_tokens: CHAT_MODEL_INFO.max_tokens,
    chatMessageLimit: DEFAULT_CHAT_MESSAGE_LIMIT,
    observationLimit: DEFAULT_OBSERVATION_LIMIT,
    systemPrompt: CHAT_SYSTEM_PROMPT,
  };

  if (!programId || typeof programId !== "string") {
    console.warn("[childChat] Invalid programId, using defaults");
    return defaults;
  }

  try {
    const docId = `chat_${programId}`;
    const snap = await db.collection("config").doc(docId).get();

    if (!snap.exists) {
      console.warn(`[childChat] Chat config not found for ${docId}, using defaults`);
      return defaults;
    }

    const data = snap.data() || {};

    return {
      model: typeof data.model === "string" ? data.model : defaults.model,
      temperature: Number.isFinite(data.temperature) ? data.temperature : defaults.temperature,
      max_tokens: Number.isFinite(data.max_tokens) ? data.max_tokens : defaults.max_tokens,
      chatMessageLimit: Number.isFinite(data.chatMessageLimit) ? data.chatMessageLimit : defaults.chatMessageLimit,
      observationLimit: data.observationLimit === "all" ? "all" : (Number.isFinite(data.observationLimit) ? data.observationLimit : defaults.observationLimit),
      systemPrompt: typeof data.systemPrompt === "string" ? data.systemPrompt : defaults.systemPrompt,
    };
  } catch (err) {
    console.error("[childChat] Error fetching chat config:", err);
    return defaults;
  }
}

/**
 * Fetch recent observations for a student (for chat context)
 * @param {string} studentId - Student document ID
 * @param {number|string} limit - Maximum number of observations to fetch, or 'all' for all observations
 * @returns {Promise<Array>} Array of observation documents with all fields
 */
async function fetchRecentObservationsForChat(studentId, limit = DEFAULT_OBSERVATION_LIMIT) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  try {
    // Use collectionGroup to query observations across all students
    const observationsRef = db.collectionGroup("observations");
    let query = observationsRef
      .where("studentId", "==", studentId)
      .orderBy("observedAt", "desc");

    // Apply limit only if not 'all'
    if (limit !== "all" && Number.isFinite(limit)) {
      query = query.limit(limit);
    } else {
      // For 'all', use a reasonable max limit to prevent excessive reads
      query = query.limit(1000);
    }

    const snapshot = await query.get();
    const observations = [];
    snapshot.docs.forEach((doc) => {
      observations.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    return observations;
  } catch (err) {
    console.error("[childChat] Error fetching observations:", err);
    // Return empty array on error to allow chat to continue
    return [];
  }
}

/**
 * Fetch recent chat messages for a specific chat
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {number} limit - Maximum number of messages to fetch (default: 6)
 * @returns {Promise<Array>} Array of message documents { role, content, timestamp }
 */
async function fetchRecentChatMessages(studentId, chatId, limit = DEFAULT_CHAT_MESSAGE_LIMIT) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }

  try {
    const messagesRef = db
      .collection("students")
      .doc(studentId)
      .collection("chats")
      .doc(chatId)
      .collection("messages");
    const query = messagesRef.orderBy("timestamp", "desc").limit(limit);

    const snapshot = await query.get();
    const messages = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        role: data.role || "user",
        content: data.content || "",
        timestamp: data.timestamp || null,
      });
    });

    // Reverse to get chronological order (oldest first)
    return messages.reverse();
  } catch (err) {
    console.error("[childChat] Error fetching chat messages:", err);
    // Return empty array on error to allow chat to continue
    return [];
  }
}

/**
 * Pack chat context from observations, messages, and new user message
 * Returns structured object that can be passed to LLM or LangChain later
 * @param {string} studentId - Student document ID
 * @param {Array} recentObservations - Array of observation documents
 * @param {Array} recentMessages - Array of chat message documents
 * @param {string} newUserMessage - New message from teacher
 * @param {string} systemPrompt - System prompt from config
 * @returns {Object} Context pack with systemPrompt, observationsBlock, conversationBlock, userMessage
 */
function packChatContext(studentId, recentObservations, recentMessages, newUserMessage, systemPrompt) {
  // Format observations block
  const observationsBlock = recentObservations.length > 0
    ? `Recent Observations (${recentObservations.length} notes):\n${JSON.stringify(recentObservations, null, 2)}`
    : "No recent observations available.";

  // Format conversation block (exclude the new message being sent)
  const conversationBlock = recentMessages.length > 0
    ? recentMessages
        .map((msg) => `${msg.role === "user" ? "Teacher" : "Assistant"}: ${msg.content}`)
        .join("\n\n")
    : "No previous conversation.";

  return {
    systemPrompt: systemPrompt || CHAT_SYSTEM_PROMPT,
    observationsBlock,
    conversationBlock,
    userMessage: newUserMessage,
    studentId,
  };
}

/**
 * Save a chat message to Firestore
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {string} role - Message role ('user' or 'assistant')
 * @param {string} content - Message content
 * @param {string} model - Model used for assistant messages (optional)
 * @param {string} authorId - Author user ID (optional, for user messages)
 * @param {string} authorName - Author display name (optional, for user messages)
 * @returns {Promise<string>} Message document ID
 */
async function saveChatMessage(studentId, chatId, role, content, model = null, authorId = null, authorName = null) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }
  if (!role || (role !== "user" && role !== "assistant")) {
    throw new Error("Invalid role, must be 'user' or 'assistant'");
  }
  if (!content || typeof content !== "string") {
    throw new Error("Invalid content");
  }

  const messagesRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .doc(chatId)
    .collection("messages");

  const messageData = {
    role,
    content: content.trim(),
    timestamp: Timestamp.now(),
  };

  // Add model field for assistant messages
  if (role === "assistant" && model) {
    messageData.model = model;
  }

  // Add author information for user messages
  if (role === "user" && authorId) {
    messageData.authorId = authorId;
    if (authorName) {
      messageData.authorName = authorName;
    }
  }

  const docRef = await messagesRef.add(messageData);
  return docRef.id;
}

/**
 * Build messages array for OpenAI API from context pack
 * @param {Object} contextPack - Context pack from packChatContext()
 * @returns {Array} Messages array for OpenAI API
 */
function buildOpenAIMessages(contextPack) {
  const messages = [
    { role: "system", content: contextPack.systemPrompt },
  ];

  // Add conversation history (if any)
  if (contextPack.conversationBlock && contextPack.conversationBlock !== "No previous conversation.") {
    // Parse conversation block back into messages
    const conversationLines = contextPack.conversationBlock.split("\n\n");
    for (const line of conversationLines) {
      if (line.startsWith("Teacher: ")) {
        messages.push({ role: "user", content: line.replace("Teacher: ", "") });
      } else if (line.startsWith("Assistant: ")) {
        messages.push({ role: "assistant", content: line.replace("Assistant: ", "") });
      }
    }
  }

  // Add observations context as a user message
  if (contextPack.observationsBlock) {
    messages.push({
      role: "user",
      content: `Here are recent observations for this student:\n\n${contextPack.observationsBlock}\n\n---\n\nNow, please answer the teacher's question about this student.`,
    });
  }

  // Add the new user message
  messages.push({ role: "user", content: contextPack.userMessage });

  return messages;
}

/**
 * Run child chat inference with OpenAI (streaming internally, returns full content)
 * This function is isolated so it can be replaced with LangChain later
 * @param {Object} contextPack - Context pack from packChatContext()
 * @param {string} model - OpenAI model to use
 * @param {number} temperature - Temperature setting
 * @param {number} max_tokens - Max tokens setting
 * @returns {Promise<string>} Full assistant response content
 */
async function runChildChat(contextPack, model, temperature, max_tokens) {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
  }

  const messages = buildOpenAIMessages(contextPack);

  const body = buildChatBody({
    model: model || CHAT_MODEL_INFO.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : CHAT_MODEL_INFO.temperature,
    max_completion_tokens: Number.isFinite(max_tokens) ? max_tokens : CHAT_MODEL_INFO.max_tokens,
    stream: true,
  });

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[childChat] network error", e);
    throw new functions.https.HttpsError("unavailable", "Unable to connect to AI service. Please check your connection.");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[childChat] OpenAI API error", response.status, errText?.slice?.(0, 500));

    // Parse error for user-friendly message
    let errorMessage = "AI service error occurred.";
    try {
      const errorJson = JSON.parse(errText);
      const apiError = errorJson?.error?.message || errorMessage;

      // Handle rate limits
      if (response.status === 429 || apiError.includes("rate limit")) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      } else {
        errorMessage = apiError;
      }
    } catch {
      // Not JSON, use generic message
      if (response.status === 429) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      }
    }

    throw new functions.https.HttpsError("internal", errorMessage);
  }

  // Stream and accumulate full content
  let fullContent = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            return fullContent;
          }

            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
              }
            } catch {
              // Skip invalid JSON lines
            }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Stream child chat inference with OpenAI to client via SSE
 * @param {Object} contextPack - Context pack from packChatContext()
 * @param {string} model - OpenAI model to use
 * @param {number} temperature - Temperature setting
 * @param {number} max_tokens - Max tokens setting
 * @param {Function} sendChunk - Function to send chunk to client (SSE format)
 * @returns {Promise<string>} Full assistant response content
 */
async function streamChildChat(contextPack, model, temperature, max_tokens, sendChunk) {
  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    throw new Error("OpenAI key not configured");
  }

  const messages = buildOpenAIMessages(contextPack);

  const body = buildChatBody({
    model: model || CHAT_MODEL_INFO.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : CHAT_MODEL_INFO.temperature,
    max_completion_tokens: Number.isFinite(max_tokens) ? max_tokens : CHAT_MODEL_INFO.max_tokens,
    stream: true,
  });

  let response;
  try {
    response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error("[childChat] network error", e);
    throw new Error("Unable to connect to AI service. Please check your connection.");
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    console.error("[childChat] OpenAI API error", response.status, errText?.slice?.(0, 500));

    // Parse error for user-friendly message
    let errorMessage = "AI service error occurred.";
    try {
      const errorJson = JSON.parse(errText);
      const apiError = errorJson?.error?.message || errorMessage;

      // Handle rate limits
      if (response.status === 429 || apiError.includes("rate limit")) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      } else {
        errorMessage = apiError;
      }
    } catch {
      // Not JSON, use generic message
      if (response.status === 429) {
        errorMessage = "AI service is busy. Please try again in a moment.";
      }
    }

    throw new Error(errorMessage);
  }

  // Stream chunks to client and accumulate full content
  let fullContent = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            // Send final chunk and return
            sendChunk("", true); // Empty chunk with done flag
            return fullContent;
          }

          try {
            const json = JSON.parse(data);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              // Send chunk to client immediately
              sendChunk(delta, false);
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

/**
 * Create a new chat document for a student
 * @param {string} studentId - Student document ID
 * @returns {Promise<string>} Chat document ID
 */
async function createChat(studentId) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  const chatsRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats");

  const chatData = {
    name: "New Chat",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    lastMessagePreview: "",
    messageCount: 0,
    deleted: false,
  };

  const docRef = await chatsRef.add(chatData);
  return docRef.id;
}

/**
 * Update chat metadata
 * @param {string} studentId - Student document ID
 * @param {string} chatId - Chat document ID
 * @param {Object} updates - Object with fields to update (name, lastMessagePreview, messageCount)
 * @returns {Promise<void>}
 */
async function updateChatMetadata(studentId, chatId, updates) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }
  if (!chatId || typeof chatId !== "string") {
    throw new Error("Invalid chatId");
  }

  const chatRef = db
    .collection("students")
    .doc(studentId)
    .collection("chats")
    .doc(chatId);

  const updateData = {
    updatedAt: Timestamp.now(),
    ...updates,
  };

  await chatRef.update(updateData);
}

/**
 * List all non-deleted chats for a student
 * @param {string} studentId - Student document ID
 * @returns {Promise<Array>} Array of chat documents
 */
async function listChatsForStudent(studentId) {
  if (!studentId || typeof studentId !== "string") {
    throw new Error("Invalid studentId");
  }

  try {
    const chatsRef = db
      .collection("students")
      .doc(studentId)
      .collection("chats");

    // Try query with orderBy first (requires composite index)
    // If index doesn't exist, fall back to fetching all and sorting in memory
    let snapshot;
    try {
      const query = chatsRef
        .where("deleted", "==", false)
        .orderBy("createdAt", "desc");
      snapshot = await query.get();
    } catch (indexError) {
      // If query fails (likely missing index), fetch all chats and filter/sort in memory
      console.warn("[listChatsForStudent] Query with orderBy failed, falling back to in-memory sort:", indexError.message);
      const allChatsSnapshot = await chatsRef.get();
      snapshot = allChatsSnapshot;
    }

    const chats = [];
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      // Filter out deleted chats if we're using fallback method
      if (data.deleted === true) {
        return;
      }
      chats.push({
        id: doc.id,
        name: data.name || "New Chat",
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        lastMessagePreview: data.lastMessagePreview || "",
        messageCount: data.messageCount || 0,
      });
    });

    // Sort by createdAt desc if we used fallback method
    if (chats.length > 0 && chats[0].createdAt) {
      chats.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds || 0) * 1000;
        const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds || 0) * 1000;
        return bTime - aTime; // Descending order
      });
    }

    console.log(`[listChatsForStudent] Found ${chats.length} chats for student ${studentId}`);
    return chats;
  } catch (err) {
    console.error("[listChatsForStudent] Error fetching chats:", err);
    // Don't silently fail - throw the error so it can be handled upstream
    throw err;
  }
}


/**
 * Generate a chat name from the first user message using AI
 * @param {string} firstMessage - First user message in the chat
 * @returns {Promise<string>} Generated chat name or "New Chat" as fallback
 */
async function generateChatName(firstMessage) {
  if (!firstMessage || typeof firstMessage !== "string" || firstMessage.trim().length < 3) {
    return "New Chat";
  }

  const openAiKey = getOpenAiKey();
  if (!openAiKey) {
    console.warn("[generateChatName] OpenAI key not configured, using fallback");
    return "New Chat";
  }

  try {
    const prompt = `Generate a concise, descriptive title (maximum 50 characters) for a chat conversation that starts with this message: "${firstMessage.trim()}". Return only the title, nothing else.`;

    const response = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildChatBody({
        model: MINI_MODEL,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: 50,
      })),
    });

    if (!response.ok) {
      console.error("[generateChatName] OpenAI API error", response.status);
      return "New Chat";
    }

    const data = await response.json();
    const generatedName = data.choices?.[0]?.message?.content?.trim();

    if (!generatedName || generatedName.length > 100) {
      return "New Chat";
    }

    // Truncate to 100 chars max (though we aim for 50)
    return generatedName.substring(0, 100);
  } catch (err) {
    console.error("[generateChatName] Error generating name:", err);
    return "New Chat";
  }
}

/**
 * Verify authentication token from HTTP request
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Decoded token and user document
 */
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new functions.https.HttpsError("unauthenticated", "Missing or invalid authorization header");
  }

  const token = authHeader.split("Bearer ")[1];
  let decodedToken;
  try {
    decodedToken = await auth.verifyIdToken(token);
  } catch {
    throw new functions.https.HttpsError("unauthenticated", "Invalid token");
  }

  const userDoc = await db.collection("users").doc(decodedToken.uid).get();
  if (!userDoc.exists) {
    throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
  }

  const userRole = userDoc.data()?.role;
  if (!["superadmin", "classroomadmin", "teacher"].includes(userRole)) {
    throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
  }

  return { decodedToken, userDoc };
}

/**
 * HTTP Cloud Function: Child Chat (Streaming)
 * Handles per-student AI chat with context from observations and chat history
 * Streams response via Server-Sent Events (SSE)
 */
export const childChatStream = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onRequest(async (req, res) => {
    // Handle CORS preflight (OPTIONS request)
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Max-Age", "3600");
      res.status(204).send("");
      return;
    }

    // Only allow POST
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    // Set up SSE headers with CORS
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    // Helper function to send SSE chunk
    // SSE format: Each data line must end with \n\n to form a complete SSE message
    // For chunks with newlines, we send multiple data: lines (SSE spec: they're concatenated)
    const sendChunk = (chunk, done = false) => {
      if (done) {
        res.write("data: [DONE]\n\n");
      } else if (chunk) {
        // Handle newlines: split into multiple data: lines per SSE spec
        // Multiple data: lines in one message are concatenated with \n by the client
        const lines = chunk.split("\n");
        for (let i = 0; i < lines.length; i++) {
          res.write(`data: ${lines[i]}\n`);
        }
        res.write("\n"); // End of SSE message (double newline)
      }
      // Force immediate send - don't wait for buffer to fill
      // Cloud Functions should handle this, but we ensure chunks are sent immediately
    };

    // Helper function to send error
    const sendError = (error) => {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error.message || error })}\n\n`);
      res.end();
    };

    try {
      // Verify authentication
      const { decodedToken, userDoc } = await verifyAuthToken(req);

      // Parse request body
      const data = req.body;
      const studentId = String(data?.studentId || "").trim();
      const message = String(data?.message || "").trim();
      let chatId = data?.chatId ? String(data.chatId).trim() : null;
      const devMode = Boolean(data?.devMode);

      if (!studentId) {
        sendError(new Error("studentId is required"));
        return;
      }

      if (!message) {
        sendError(new Error("Please enter a message before sending."));
        return;
      }

      const openAiKey = getOpenAiKey();
      if (!openAiKey) {
        sendError(new Error("OpenAI key not configured"));
        return;
      }

      // Get student's programId via classroom to fetch program-specific config
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        sendError(new Error("Student not found"));
        return;
      }

      const studentData = studentDoc.data();
      const classroomId = studentData?.classroomId;

      if (!classroomId) {
        sendError(new Error("Student has no classroom assigned"));
        return;
      }

      // Get classroom to find programId
      const classroomDoc = await db.collection("classrooms").doc(classroomId).get();
      if (!classroomDoc.exists) {
        sendError(new Error("Student's classroom not found"));
        return;
      }

      const classroomData = classroomDoc.data();
      const programId = classroomData?.programId || "primary";

      // Handle chatId: if not provided, find most recent chat or create new one
      if (!chatId) {
        const existingChats = await listChatsForStudent(studentId);
        if (existingChats.length > 0) {
          chatId = existingChats[0].id;
        } else {
          chatId = await createChat(studentId);
        }
      }

      // Verify chat exists
      const chatDoc = await db
        .collection("students")
        .doc(studentId)
        .collection("chats")
        .doc(chatId)
        .get();

      if (!chatDoc.exists) {
        sendError(new Error("Chat not found"));
        return;
      }

      const chatData = chatDoc.data();
      if (chatData?.deleted) {
        sendError(new Error("Chat has been deleted"));
        return;
      }

      // Fetch chat configuration from Firestore
      const chatConfig = await getChatConfigServer(programId);

      // Fetch context (unless dev mode)
      let recentObservations = [];
      let recentMessages = [];

      if (!devMode) {
        [recentObservations, recentMessages] = await Promise.all([
          fetchRecentObservationsForChat(studentId, chatConfig.observationLimit),
          fetchRecentChatMessages(studentId, chatId, chatConfig.chatMessageLimit),
        ]);
      }

      // Pack context with config's system prompt
      const contextPack = packChatContext(studentId, recentObservations, recentMessages, message, chatConfig.systemPrompt);

      // Check if this is the first message in the chat
      const isFirstMessage = (chatData.messageCount || 0) === 0;

      // Get author information from user document
      const userData = userDoc.data();
      const authorId = decodedToken.uid;
      const authorName = userData?.displayName || userData?.name || decodedToken.name || null;

      // Save user message with author information
      await saveChatMessage(studentId, chatId, "user", message, null, authorId, authorName);

      // Stream LLM inference to client
      let fullContent = "";
      try {
        fullContent = await streamChildChat(
          contextPack,
          chatConfig.model,
          chatConfig.temperature,
          chatConfig.max_tokens,
          sendChunk // Just pass sendChunk directly - streamChildChat handles accumulation
        );
      } catch (streamErr) {
        sendError(streamErr);
        return;
      }

      if (!fullContent || !fullContent.trim()) {
        sendError(new Error("AI returned no content"));
        return;
      }

      // TODO(PEP-96): When childChatStream is activated, port the cancelledResponseAt
      // check from childChat to skip the assistant write if the user pressed Stop.

      // Save assistant response with model info
      const messageId = await saveChatMessage(studentId, chatId, "assistant", fullContent, chatConfig.model);

      // Update chat metadata
      const lastMessagePreview = fullContent.substring(0, 100);
      const newMessageCount = (chatData.messageCount || 0) + 2;

      // If first message, generate chat name
      let chatName = chatData.name || "New Chat";
      if (isFirstMessage) {
        chatName = await generateChatName(message);
      }

      await updateChatMetadata(studentId, chatId, {
        name: chatName,
        lastMessagePreview,
        messageCount: newMessageCount,
      });

      // Send completion event with metadata
      res.write(`event: complete\ndata: ${JSON.stringify({ chatId, messageId, success: true })}\n\n`);
      res.end();
    } catch (err) {
      console.error("[childChatStream] error", err);
      sendError(err);
    }
  });

/**
 * Callable Cloud Function: Child Chat (Legacy - kept for backward compatibility)
 * Handles per-student AI chat with context from observations and chat history
 * @deprecated Use childChatStream for streaming support
 */
export const childChat = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 60, memory: "512MB", secrets: [OPENAI_API_KEY] })
  .https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
    }

    // Admin-only check
    const userDoc = await db.collection("users").doc(context.auth.uid).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
    }

    const userRole = userDoc.data()?.role;
    if (!["superadmin", "classroomadmin", "teacher"].includes(userRole)) {
      throw new functions.https.HttpsError("permission-denied", "You don't have permission to access this chat.");
    }

    // Validate parameters
    const studentId = String(data?.studentId || "").trim();
    const message = String(data?.message || "").trim();
    const chatId = data?.chatId ? String(data.chatId).trim() : null;
    const userMessageId = data?.userMessageId ? String(data.userMessageId).trim() : null;

    if (!studentId) {
      throw new functions.https.HttpsError("invalid-argument", "studentId is required");
    }

    if (!message) {
      throw new functions.https.HttpsError("invalid-argument", "Please enter a message before sending.");
    }

    if (!chatId) {
      throw new functions.https.HttpsError("invalid-argument", "chatId is required");
    }

    if (!userMessageId) {
      throw new functions.https.HttpsError("invalid-argument", "userMessageId is required");
    }

    const openAiKey = getOpenAiKey();
    if (!openAiKey) {
      throw new functions.https.HttpsError("failed-precondition", "OpenAI key not configured");
    }

    try {
      // Get student's programId via classroom to fetch program-specific config
      const studentDoc = await db.collection("students").doc(studentId).get();
      if (!studentDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Student not found");
      }

      const studentData = studentDoc.data();
      const classroomId = studentData?.classroomId;

      if (!classroomId) {
        throw new functions.https.HttpsError("failed-precondition", "Student has no classroom assigned");
      }

      // Get classroom to find programId
      const classroomDoc = await db.collection("classrooms").doc(classroomId).get();
      if (!classroomDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Student's classroom not found");
      }

      const classroomData = classroomDoc.data();
      const programId = classroomData?.programId || "primary"; // Default to primary if missing

      // Verify chat exists (client creates chat + user message before calling this)
      const chatDoc = await db
        .collection("students")
        .doc(studentId)
        .collection("chats")
        .doc(chatId)
        .get();

      if (!chatDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Chat not found");
      }

      const chatData = chatDoc.data();
      if (chatData?.deleted) {
        throw new functions.https.HttpsError("failed-precondition", "Chat has been deleted");
      }

      // Fetch chat configuration from Firestore
      const chatConfig = await getChatConfigServer(programId);

      // Dev mode: skip observation context (temporary feature for UI testing)
      const devMode = Boolean(data?.devMode);

      let recentObservations = [];
      let recentMessages = [];

      if (!devMode) {
        // Fetch context (current chat only)
        [recentObservations, recentMessages] = await Promise.all([
          fetchRecentObservationsForChat(studentId, chatConfig.observationLimit),
          fetchRecentChatMessages(studentId, chatId, chatConfig.chatMessageLimit),
        ]);
      }
      // In dev mode, keep arrays empty - only system prompt + current message will be used

      // Pack context with config's system prompt
      const contextPack = packChatContext(studentId, recentObservations, recentMessages, message, chatConfig.systemPrompt);

      // Check if this is the first message in the chat
      const isFirstMessage = (chatData.messageCount || 0) === 0;

      // User message already written by client — userMessageId passed in

      // Run LLM inference (streams internally, returns full content)
      const fullContent = await runChildChat(
        contextPack,
        chatConfig.model,
        chatConfig.temperature,
        chatConfig.max_tokens
      );

      if (!fullContent || !fullContent.trim()) {
        throw new functions.https.HttpsError("internal", "AI returned no content");
      }

      // Check if the user pressed Stop while we were waiting for OpenAI
      const userMsgDoc = await db
        .collection("students")
        .doc(studentId)
        .collection("chats")
        .doc(chatId)
        .collection("messages")
        .doc(userMessageId)
        .get();
      if (userMsgDoc.data()?.cancelledResponseAt) {
        // Still update metadata for the user message the client already wrote
        const cancelledCount = (chatData.messageCount || 0) + 1;
        let chatName = chatData.name || "New Chat";
        if (isFirstMessage) {
          chatName = await generateChatName(message);
        }
        await updateChatMetadata(studentId, chatId, {
          name: chatName,
          lastMessagePreview: message.substring(0, 100),
          messageCount: cancelledCount,
        });
        return { chatId, cancelled: true, success: true };
      }

      // Save assistant response with model info
      const messageId = await saveChatMessage(studentId, chatId, "assistant", fullContent, chatConfig.model);

      // Update chat metadata
      const lastMessagePreview = fullContent.substring(0, 100);
      const newMessageCount = (chatData.messageCount || 0) + 2; // chatData.messageCount is pre-write; +1 for user msg (client-written) + 1 for assistant msg

      // If first message, generate chat name
      let chatName = chatData.name || "New Chat";
      if (isFirstMessage) {
        chatName = await generateChatName(message);
      }

      await updateChatMetadata(studentId, chatId, {
        name: chatName,
        lastMessagePreview,
        messageCount: newMessageCount,
      });

      return {
        chatId,
        messageId,
        content: fullContent,
        success: true,
      };
    } catch (err) {
      console.error("[childChat] error", err);

      // Re-throw Firebase errors as-is
      if (err instanceof functions.https.HttpsError) {
        throw err;
      }

      // Handle other errors
      const errorMessage = err?.message || "An unexpected error occurred.";
      throw new functions.https.HttpsError("internal", errorMessage);
    }
  });
