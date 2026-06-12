/**
 * Configuration provider for the Google Drive Sync plugin.
 * Defines default settings that get merged into Tabby's config.
 */

import { ConfigProvider } from 'tabby-core';

export class GDriveSyncConfigProvider extends ConfigProvider {
  defaults = {
    gdrivesync: {
      // Whether sync is enabled
      enabled: false,

      // Auto-sync when config changes
      autoSyncOnChange: true,

      // Auto-sync on Tabby startup
      autoSyncOnStartup: true,

      // Minimum interval between automatic syncs (in minutes)
      syncIntervalMinutes: 60,

      // OAuth tokens - stored encrypted by Tabby vault
      googleAuthTokens: null,

      // OAuth app credentials
      useCustomGoogleCredentials: false,
      googleClientId: null,
      googleClientSecret: null,

      // Remote storage target
      driveStorageMode: 'appDataFolder',
      driveFolderPath: '/Tabby Sync/',

      // Version history
      versionHistoryMode: 'googleRevisions',
      maxVersionFiles: 20,

      // Master password hash (NEVER store plaintext)
      masterPasswordHash: null,
      masterPasswordSalt: null,

      // Sync status
      lastSyncTime: null,
      lastSyncError: null,
      lastSyncHost: null,

      // Drive file reference
      driveFileId: null,
    },
  };
}
