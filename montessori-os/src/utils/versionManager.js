// Version Manager for Montessori OS
// Handles automatic updates and cache invalidation

import { version } from '../../../package.json';

class VersionManager {
  constructor() {
    this.currentVersion = version;
    this.serviceWorker = null;
    this.updateAvailable = false;
    this.init();
  }

  async init() {
    // Check if service worker is supported
    if ('serviceWorker' in navigator) {
      try {
        // Register service worker
        const registration = await navigator.serviceWorker.register('/sw.js');
        this.serviceWorker = registration;
        
        // Listen for updates
        this.setupUpdateListeners(registration);
        
        // Check for immediate updates
        await this.checkForUpdates();
      } catch { /* ignored */ }
    }
  }

  setupUpdateListeners(registration) {
    // Listen for new service worker installation
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          this.updateAvailable = true;
          this.notifyUpdateAvailable();
        }
      });
    });

    // Listen for service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // Reload the page to get the new version
      window.location.reload();
    });
  }

  async checkForUpdates() {
    if (!this.serviceWorker) return;

    try {
      // Check if there's a waiting service worker
      if (this.serviceWorker.waiting) {
        this.updateAvailable = true;
        this.notifyUpdateAvailable();
      }

      // Check for updates
      await this.serviceWorker.update();
    } catch { /* ignored */ }
  }

  async applyUpdate() {
    if (!this.serviceWorker || !this.updateAvailable) return;

    try {
      // Send message to waiting service worker to skip waiting
      if (this.serviceWorker.waiting) {
        this.serviceWorker.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch { /* ignored */ }
  }

  notifyUpdateAvailable() {
    // Create a custom event to notify the app
    const updateEvent = new CustomEvent('appUpdateAvailable', {
      detail: { version: this.currentVersion }
    });
    window.dispatchEvent(updateEvent);
  }

  getCurrentVersion() {
    return this.currentVersion;
  }

  isUpdateAvailable() {
    return this.updateAvailable;
  }

  // Force check for updates (can be called periodically)
  async forceCheck() {
    await this.checkForUpdates();
  }
}

// Create singleton instance
const versionManager = new VersionManager();

export default versionManager;
