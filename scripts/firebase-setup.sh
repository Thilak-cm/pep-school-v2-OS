#!/bin/bash

# Firebase CLI Persistent Authentication Setup Script
# This script helps set up and verify Firebase CLI authentication

echo "🔧 Firebase CLI Setup Script"
echo "============================"

# Check if conda environment is active
if [[ "$CONDA_DEFAULT_ENV" != "pep-venv" ]]; then
    echo "⚠️  Warning: pep-venv conda environment is not active"
    echo "   Run: conda activate pep-venv"
    echo ""
fi

# Check if service account key exists
if [[ -f "$HOME/.config/firebase-cli-key.json" ]]; then
    echo "✅ Service account key found: $HOME/.config/firebase-cli-key.json"
else
    echo "❌ Service account key not found"
    echo "   Run: gcloud iam service-accounts keys create ~/.config/firebase-cli-key.json --iam-account=firebase-cli-sa@pep-os.iam.gserviceaccount.com"
fi

# Check environment variable
if [[ "$GOOGLE_APPLICATION_CREDENTIALS" == "$HOME/.config/firebase-cli-key.json" ]]; then
    echo "✅ GOOGLE_APPLICATION_CREDENTIALS is set correctly"
else
    echo "⚠️  GOOGLE_APPLICATION_CREDENTIALS not set correctly"
    echo "   Current value: $GOOGLE_APPLICATION_CREDENTIALS"
fi

echo ""
echo "🔍 Testing Firebase CLI access..."

# Test Firebase CLI
if firebase projects:list > /dev/null 2>&1; then
    echo "✅ Firebase CLI is working correctly"
    echo ""
    echo "📋 Current Firebase project:"
    firebase projects:list
else
    echo "❌ Firebase CLI is not working"
    echo "   Try running: firebase login --reauth"
fi

echo ""
echo "💡 Quick Commands:"
echo "   - conda activate pep-venv"
echo "   - firebase projects:list"
echo "   - firebase use pep-os"
echo "   - firebase deploy"
echo ""
echo "🔐 Authentication Methods Set Up:"
echo "   1. Application Default Credentials (ADC)"
echo "   2. Service Account Key (firebase-cli-sa@pep-os.iam.gserviceaccount.com)"
echo "   3. Firebase CLI User Authentication" 