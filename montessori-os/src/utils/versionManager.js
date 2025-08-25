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
        
        console.log(`Version Manager initialized. Current version: ${this.currentVersion}`);
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    }
  }

  setupUpdateListeners(registration) {
    // Listen for new service worker installation
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      console.log('New service worker installing...');
      
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('New version available!');
          this.updateAvailable = true;
          this.notifyUpdateAvailable();
        }
      });
    });

    // Listen for service worker updates
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('Service worker updated, reloading...');
      // Reload the page to get the new version
      window.location.reload();
    });
  }

  async checkForUpdates() {
    if (!this.serviceWorker) return;

    try {
      // Check if there's a waiting service worker
      if (this.serviceWorker.waiting) {
        console.log('Update waiting to be activated');
        this.updateAvailable = true;
        this.notifyUpdateAvailable();
      }

      // Check for updates
      await this.serviceWorker.update();
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  }

  async applyUpdate() {
    if (!this.serviceWorker || !this.updateAvailable) return;

    try {
      // Send message to waiting service worker to skip waiting
      if (this.serviceWorker.waiting) {
        this.serviceWorker.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch (error) {
      console.error('Error applying update:', error);
    }
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
