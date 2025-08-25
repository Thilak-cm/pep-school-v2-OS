# Cache Busting System for Montessori OS

## 🎯 **Overview**

This system automatically prevents client-side cache issues by:
1. **Dynamic cache naming** based on app version
2. **Automatic service worker updates** 
3. **User-friendly update notifications**
4. **Smart cache invalidation** strategies

## 🚀 **How It Works**

### **1. Version-Aware Caching**
- Service worker cache names include the app version (e.g., `montessori-os-v2.6.1`)
- Each new version creates a new cache, automatically invalidating old ones
- Old caches are automatically cleaned up

### **2. Automatic Updates**
- App detects when new versions are available
- Users get a notification banner at the top
- One-click update process (no manual cache clearing needed)
- Automatic page reload after update

### **3. Smart Cache Strategies**
- **HTML/JSON files**: Network-first (always fresh)
- **JS/CSS files**: Cache-first with network fallback
- **Images**: Cache-first (long-term caching)

## 🔧 **Components**

### **Version Manager** (`src/utils/versionManager.js`)
- Manages service worker registration
- Detects available updates
- Handles update application
- Provides version information

### **Update Notification** (`src/components/UpdateNotification.jsx`)
- Shows update banner when available
- Provides Update and Refresh buttons
- Mobile-optimized design (375px width)

### **Service Worker** (`public/sw.js`)
- Version-aware cache naming
- Intelligent caching strategies
- Automatic cache cleanup

## 📱 **User Experience**

### **When Updates Are Available**
1. User sees a blue notification banner at the top
2. Banner shows "New version available! Update to get the latest features."
3. Two buttons: **Update** (recommended) and **Refresh**
4. Clicking **Update** automatically applies the update
5. Page reloads with new version

### **No More Manual Cache Clearing**
- Users never need to manually clear browser cache
- Updates happen automatically in the background
- Seamless experience across all devices

## 🛠️ **Development Workflow**

### **Building for Production**
```bash
# Activate conda environment
conda activate pep-venv

# Build (automatically updates service worker version)
npm run build

# Deploy to Firebase
firebase deploy --only hosting
```

### **What Happens During Build**
1. `prebuild` script runs automatically
2. Service worker version is updated to match `package.json`
3. Vite builds with asset hashing
4. New cache names are generated

### **Version Updates**
1. Update version in `package.json`
2. Run `npm run build`
3. Deploy to Firebase
4. Users automatically get update notifications

## 🔍 **Troubleshooting**

### **Version Mismatch Issues**
- Ensure `package.json` version is correct
- Check that `prebuild` script ran successfully
- Verify service worker version in browser dev tools

### **Cache Not Updating**
- Check browser console for service worker logs
- Verify Firebase hosting headers are deployed
- Test with incognito/private browsing mode

### **Service Worker Issues**
- Check browser console for errors
- Verify service worker is registered
- Check network tab for failed requests

## 📊 **Cache Headers**

### **Static Assets (JS/CSS)**
```
Cache-Control: public, max-age=31536000, immutable
```
- Long-term caching (1 year)
- Immutable flag prevents revalidation

### **HTML/JSON Files**
```
Cache-Control: no-cache, no-store, must-revalidate
```
- Always fetch fresh content
- No caching allowed

### **Images**
```
Cache-Control: public, max-age=31536000, immutable
```
- Long-term caching for performance
- Immutable flag for efficiency

## 🎉 **Benefits**

1. **No More Cache Issues**: Users always get the latest version
2. **Better Performance**: Smart caching strategies
3. **User-Friendly Updates**: Clear notifications and one-click updates
4. **Automatic Management**: No manual intervention needed
5. **Mobile Optimized**: Works perfectly on all devices

## 🔮 **Future Enhancements**

- **Background Updates**: Update while app is idle
- **Delta Updates**: Only download changed files
- **Update Scheduling**: Update during low-usage periods
- **Rollback Support**: Quick rollback to previous versions

---

**Remember**: This system eliminates the need for users to manually clear their cache. Updates are automatic and seamless!
