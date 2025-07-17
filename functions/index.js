import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as functions from 'firebase-functions';
import { v4 as uuidv4 } from 'uuid';
import speech from '@google-cloud/speech';

initializeApp({ credential: applicationDefault() });

const db = getFirestore();
const storage = getStorage();
const speechClient = new speech.SpeechClient();

export const transcribeVoiceNote = functions.storage
  .object()
  .filter({ contentType: 'audio/webm' })
  .onFinalize(async (object) => {
    const filePath = object.name; // voice_notes/{studentUid}/{docId}.webm
    if (!filePath.startsWith('voice_notes/')) return;

    const [, studentUid, fileName] = filePath.split('/');
    const docId = fileName.replace('.webm', '');

    // Generate gs:// uri
    const gcsUri = `gs://${object.bucket}/${filePath}`;

    const config = {
      encoding: 'WEBM_OPUS',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
    };

    const audio = {
      uri: gcsUri,
    };

    try {
      const [operation] = await speechClient.longRunningRecognize({ config, audio });
      const [response] = await operation.promise();
      const transcript = response.results
        .map(r => r.alternatives[0].transcript)
        .join(' ');
      const confidence = response.results[0]?.alternatives[0]?.confidence || 0;

      await db.collection('observations').doc(docId).update({
        text: transcript,
        stt_confidence: confidence,
        audio_url: gcsUri,
      });
    } catch (err) {
      console.error('STT error', err);
      await db.collection('observations').doc(docId).update({
        text: '(transcription failed)',
      });
    }
  }); 