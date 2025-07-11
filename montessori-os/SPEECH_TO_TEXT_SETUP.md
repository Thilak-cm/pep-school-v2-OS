# Google Speech-to-Text API Setup Guide

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account
2. **Billing Enabled**: Speech-to-Text API requires billing to be enabled
3. **API Key**: You'll need to create an API key for the Speech-to-Text API

## Setup Steps

### 1. Enable Speech-to-Text API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Library"
4. Search for "Speech-to-Text API"
5. Click on it and press "Enable"

### 2. Create API Key

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy the generated API key
4. (Optional) Restrict the API key to Speech-to-Text API only for security

### 3. Configure Environment Variables

Create a `.env` file in the `montessori-os` directory with:

```bash
# Firebase Configuration (you already have these)
VITE_FIREBASE_API_KEY=your_firebase_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef123456
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Google Speech-to-Text API (NEW)
VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY=your_google_speech_to_text_api_key_here
```

### 4. Test the Integration

1. Start the development server: `npm run dev`
2. Record some audio (speak clearly)
3. The transcription should appear automatically after recording stops
4. Check the browser console for any error messages

## Features

- **Automatic Transcription**: Transcribes audio immediately after recording
- **Error Handling**: Shows clear error messages if transcription fails
- **Copy to Clipboard**: Copy transcribed text with one click
- **Retry Functionality**: Retry transcription if it fails
- **Loading States**: Visual feedback during transcription
- **Multiple Audio Formats**: Supports WebM, MP4, and other formats

## API Limits & Costs

- **Free Tier**: 60 minutes per month
- **Pricing**: $0.006 per 15 seconds after free tier
- **File Size Limit**: 10MB per request
- **Audio Length**: Up to 60 seconds per request

## Troubleshooting

### Common Issues

1. **"API key not configured" error**
   - Make sure you've added `VITE_GOOGLE_SPEECH_TO_TEXT_API_KEY` to your `.env` file
   - Restart the development server after adding the environment variable

2. **"No speech detected" error**
   - Speak more clearly and louder
   - Check that your microphone is working
   - Try recording in a quieter environment

3. **"Transcription failed" error**
   - Check your internet connection
   - Verify the API key is correct
   - Check the browser console for detailed error messages

4. **Audio format issues**
   - The app automatically detects the best audio format
   - If you're still having issues, try a different browser

### Debug Information

The app logs detailed information to the browser console:
- Audio format being used
- File size and chunk count
- API request details
- Transcription results or errors

## Security Notes

- **API Key Security**: Never commit your API key to version control
- **Rate Limiting**: Consider implementing rate limiting for production use
- **User Permissions**: Ensure users understand their audio is being sent to Google

## Next Steps

1. **Firestore Integration**: Store transcriptions in Firestore
2. **User Management**: Associate transcriptions with specific users
3. **Tagging System**: Add tags to transcriptions
4. **Export Features**: Export transcriptions to various formats 