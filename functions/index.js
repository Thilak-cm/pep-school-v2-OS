import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
// import { getStorage } from 'firebase-admin/storage';
import * as functions from "firebase-functions";
// import { v4 as uuidv4 } from 'uuid';
import speech from "@google-cloud/speech";
import nodemailer from "nodemailer";

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
// const storage = getStorage();
const speechClient = new speech.SpeechClient();

// Create transporter using SMTP credentials stored in functions config
const smtpUser = functions.config().smtp?.user;
const smtpPass = functions.config().smtp?.pass;
const transporter = (smtpUser && smtpPass)
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: smtpUser, pass: smtpPass },
    })
  : null;

export const transcribeVoiceNote = functions.storage
  .object()
  .filter({ contentType: "audio/webm" })
  .onFinalize(async (object) => {
    const filePath = object.name; // voice_notes/{studentUid}/{docId}.webm
    if (!filePath.startsWith("voice_notes/")) return;

    const [fileName] = filePath.split("/");
    const docId = fileName.replace(".webm", "");

    // Generate gs:// uri
    const gcsUri = `gs://${object.bucket}/${filePath}`;

    const config = {
      encoding: "WEBM_OPUS",
      sampleRateHertz: 48000,
      languageCode: "en-US",
    };

    const audio = {
      uri: gcsUri,
    };

    try {
      const [operation] = await speechClient.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();
      const transcript = response.results
        .map(r => r.alternatives[0].transcript)
        .join(" ");
      const confidence = response.results[0]?.alternatives[0]?.confidence || 0;

      await db.collection("observations").doc(docId).update({
        text: transcript,
        stt_confidence: confidence,
        audio_url: gcsUri,
      });
    } catch (err) {
      console.error("STT error", err);
      await db.collection("observations").doc(docId).update({
        text: "(transcription failed)",
      });
    }
  });

export const notifyAdminsOnUnauthorized = functions.firestore
  .document("access_logs/{logId}")
  .onCreate(async (snap) => {
    const logData = snap.data();

    try {
      // Fetch all admin users
      const adminSnap = await db.collection("users").where("type", "==", "admin").get();
      const adminEmails = adminSnap.docs.map((d) => d.data().email).filter(Boolean);

      if (!transporter || adminEmails.length === 0) {
        console.warn("Email transporter not configured or no admin emails found");
        return;
      }

      const mailOptions = {
        from: smtpUser,
        to: adminEmails.join(","),
        subject: "Unauthorized Access Attempt Detected",
        text: `An unauthorized user attempted to access the Montessori Observation Hub.\n\n` +
              `Email: ${logData.email}\n` +
              `Display Name: ${logData.displayName}\n` +
              `Reason: ${logData.reason}\n` +
              `Timestamp: ${new Date(logData.timestamp._seconds * 1000).toLocaleString()}\n\n` +
              `User Agent: ${logData.userAgent}`,
      };

      await transporter.sendMail(mailOptions);
      console.log("Unauthorized access email sent to admins");
    } catch (err) {
      console.error("Failed to send unauthorized access email", err);
    }
  }); 