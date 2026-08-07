import * as functions from "firebase-functions/v1";

import { auth } from "../shared/firebase.js";
import { validateClientTelemetryPayload } from "../config/chatTelemetry.js";

function corsOrigin(req, allowedOrigin) {
  return allowedOrigin || process.env.CHAT_ALLOWED_ORIGIN || req.headers?.origin || "*";
}

function configureCors(req, res, allowedOrigin) {
  res.setHeader("Access-Control-Allow-Origin", corsOrigin(req, allowedOrigin));
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export async function handleChatClientTelemetry({ req, res, verifyIdToken, logger, allowedOrigin = null }) {
  configureCors(req, res, allowedOrigin);
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const header = req.headers?.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    await verifyIdToken(token);
  } catch {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let payload;
  try {
    payload = validateClientTelemetryPayload(req.body);
  } catch (error) {
    res.status(400).json({ error: error.message || "Invalid telemetry payload" });
    return;
  }

  logger.info("[chat-latency] client summary", {
    eventName: "chat_client_latency",
    receivedAt: new Date().toISOString(),
    ...payload,
  });
  res.status(202).json({ accepted: true, eventId: payload.eventId });
}

export const chatClientTelemetry = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 30, memory: "256MB" })
  .https.onRequest((req, res) => handleChatClientTelemetry({
    req,
    res,
    verifyIdToken: (token) => auth.verifyIdToken(token),
    logger: functions.logger,
  }));
