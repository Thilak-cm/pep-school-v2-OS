# Firebase CLI Persistent Authentication Setup

## 🎯 Problem Solved
You no longer need to re-authenticate with Firebase CLI every day. We've set up multiple authentication methods that will persist.

## 🔐 Authentication Methods Configured

### 1. Application Default Credentials (ADC)
- **Location**: `~/.config/gcloud/application_default_credentials.json`
- **Setup**: `gcloud auth application-default login`
- **Quota Project**: `pep-os`

### 2. Service Account Key (Most Reliable)
- **Location**: `~/.config/firebase-cli-key.json`
- **Service Account**: `firebase-cli-sa@pep-os.iam.gserviceaccount.com`
- **Role**: `roles/firebase.admin`
- **Environment Variable**: `GOOGLE_APPLICATION_CREDENTIALS`

### 3. Firebase CLI User Authentication
- **Account**: `thilak@pepschoolv2.com`
- **Project**: `pep-os`

## 🚀 Quick Start Commands

```bash
# Always start with conda environment
conda activate pep-venv

# Check authentication status
./firebase-setup.sh

# List projects
firebase projects:list

# Set project
firebase use pep-os

# Deploy
firebase deploy
```

## 🔧 Troubleshooting

### If Firebase CLI stops working:
1. **Check conda environment**: `conda activate pep-venv`
2. **Re-authenticate**: `firebase login --reauth`
3. **Check service account**: `./firebase-setup.sh`
4. **Regenerate service account key**:
   ```bash
   gcloud iam service-accounts keys create ~/.config/firebase-cli-key.json \
     --iam-account=firebase-cli-sa@pep-os.iam.gserviceaccount.com
   ```

### If you get quota errors:
```bash
gcloud auth application-default set-quota-project pep-os
```

## 📁 Files Created/Modified

- `~/.config/firebase-cli-key.json` - Service account key
- `~/.config/gcloud/application_default_credentials.json` - ADC credentials
- `~/.zshrc` - Added GOOGLE_APPLICATION_CREDENTIALS environment variable
- `firebase-setup.sh` - Setup verification script
- `FIREBASE_AUTH_SETUP.md` - This documentation

## 🎉 Benefits

✅ **No more daily re-authentication**  
✅ **Multiple authentication methods** for redundancy  
✅ **Service account key** for CI/CD compatibility  
✅ **Easy verification** with setup script  
✅ **Persistent across reboots**  

## 🔒 Security Notes

- Service account key is stored in `~/.config/firebase-cli-key.json`
- Keep this file secure and don't share it
- The key has Firebase Admin permissions for the `pep-os` project only
- Consider rotating the key periodically for security

## 📞 Support

If you encounter issues:
1. Run `./firebase-setup.sh` to diagnose
2. Check the troubleshooting section above
3. Verify conda environment is active: `conda activate pep-venv` 