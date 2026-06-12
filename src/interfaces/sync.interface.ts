/**
 * Core interfaces for the Google Drive Sync plugin.
 * These define the data structures used throughout the sync process.
 */

/**
 * SSH Profile that will be synced.
 * Excludes private keys and local file paths for security.
 */
export interface SyncableSSHProfile {
  id: string;
  name: string;
  type: string;
  group?: string;
  icon?: string;
  color?: string;

  // SSH connection options (sanitized)
  options?: {
    host?: string;
    port?: number;
    user?: string;
    auth?: string; // 'password' | 'publicKey' | 'agent' | 'keyboardInteractive'
    password?: string; // Will be encrypted
    // NOTE: privateKeys and privateKeyPath are explicitly EXCLUDED
    algorithms?: {
      hmac?: string[];
      kex?: string[];
      cipher?: string[];
      serverHostKey?: string[];
    };
    keepaliveInterval?: number;
    keepaliveCountMax?: number;
    readyTimeout?: number;
    x11?: boolean;
    agentForward?: boolean;
    jumpHost?: string;
  };

  // UI/behavior settings
  weight?: number;
  disableDynamicTitle?: boolean;
  behaviorOnSessionEnd?: string;
}

/**
 * Syncable profile group
 */
export interface SyncableProfileGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

/**
 * Vault secret for saved passwords
 * Passwords are already encrypted by Tabby's vault
 */
export interface SyncableVaultSecret {
  type: string;
  key: {
    type: string;
    id?: string;
    host?: string;
    user?: string;
  };
  value: string; // Encrypted password
}

/**
 * Quick command item from quick-cmds plugin
 */
export interface QuickCommand {
  name: string;
  text: string;
  appendCR?: boolean;
  group?: string;
  id?: string;
}

/**
 * Quick command group from quick-cmds plugin
 */
export interface QuickCommandGroup {
  name: string;
  id?: string;
}

/**
 * Syncable UI/Terminal settings
 */
export interface SyncableSettings {
  terminal?: {
    frontend?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: number;
    fontWeightBold?: number;
    ligatures?: boolean;
    cursor?: string;
    cursorBlink?: boolean;
    bell?: string;
    bracketedPaste?: boolean;
    background?: string;
    colorScheme?: {
      name?: string;
      foreground?: string;
      background?: string;
      cursor?: string;
      colors?: string[];
    };
    lightColorScheme?: {
      name?: string;
      foreground?: string;
      background?: string;
      cursor?: string;
      colors?: string[];
    };
    customColorSchemes?: Array<{
      name: string;
      foreground: string;
      background: string;
      cursor?: string;
      cursorText?: string;
      colors: string[];
    }>;
    searchOptions?: Record<string, unknown>;
    scrollbackLines?: number;
    rightClick?: string;
    wordSeparator?: string;
    copyOnSelect?: boolean;
    pasteOnMiddleClick?: boolean;
    shellIntegration?: boolean;
    // Additional terminal settings
    autoOpen?: boolean;
    warnOnMultiLinePaste?: boolean;
    altIsMeta?: boolean;
    scrollOnInput?: boolean;
    focusOnCreation?: boolean;
    hideCloseButton?: boolean;
    hideTabOptions?: boolean;
  };

  // List of installed plugins (names only)
  installedPlugins?: string[];

  // Quick commands/snippets from quick-cmds plugin
  quickCmds?: {
    commands?: Array<{
      name: string;
      text: string;
      appendCR?: boolean;
      group?: string;
      id?: string;
    }>;
    groups?: Array<{
      name: string;
      id?: string;
    }>;
  };

  appearance?: {
    theme?: string;
    frame?: string;
    opacity?: number;
    vibrancy?: boolean;
    tabsOnTop?: boolean;
    dockPosition?: string;
    spaciness?: number;
    colorSchemeMode?: string;
    // Additional appearance settings
    css?: string;
    font?: string;
    fontSize?: number;
    lastTabClosesWindow?: boolean;
  };

  hotkeys?: Record<string, string[]>;

  // SSH settings
  ssh?: {
    warnOnClose?: boolean;
    winSCPPath?: string;
    agentType?: string;
    agentPath?: string;
    x11Display?: string;
  };

  // Custom color schemes
  colorSchemes?: Array<{
    name: string;
    foreground: string;
    background: string;
    cursor?: string;
    cursorText?: string;
    colors: string[];
  }>;

  // Plugin settings
  pluginBlacklist?: string[];

  // Application settings
  application?: {
    restoreTerminalOnStartup?: boolean;
    enableAnalytics?: boolean;
    enableAutoupdate?: boolean;
    language?: string;
  };

  // Window settings
  window?: {
    startInTray?: boolean;
    startMinimized?: boolean;
    closeToTray?: boolean;
    confirmClose?: boolean;
    restoreWindowProtocol?: boolean;
  };
}

/**
 * The complete sync payload that gets encrypted and stored on Drive
 */
export interface SyncPayload {
  // Metadata
  version: number;
  lastUpdated: number; // Unix timestamp in ms
  sourceHost: string; // Machine hostname for conflict detection

  // Syncable content
  profiles: SyncableSSHProfile[];
  groups: SyncableProfileGroup[];
  vault?: {
    // Vault encryption metadata - required to decrypt secrets on another machine
    iv?: string; // Initialization Vector (hex)
    keySalt?: string; // Key Salt (hex) - used to derive encryption key from passphrase
    contents?: string; // Encrypted vault contents (base64) - contains all secrets
    version?: number; // Vault format version
  };
  settings: SyncableSettings;
}

export type DriveStorageMode = 'appDataFolder' | 'driveFolder';

export type VersionHistoryMode = 'googleRevisions' | 'timestampedFiles';

/**
 * Plugin-specific configuration stored in Tabby config
 */
export interface GDriveSyncConfig {
  enabled: boolean;
  autoSyncOnChange: boolean;
  autoSyncOnStartup: boolean;
  syncIntervalMinutes: number;

  // Auth state (tokens are stored encrypted)
  googleAuthTokens?: {
    access_token?: string;
    refresh_token?: string;
    expiry_date?: number;
  };

  // Optional custom OAuth app credentials
  useCustomGoogleCredentials?: boolean;
  googleClientId?: string;
  googleClientSecretEncrypted?: string;
  /** @deprecated legacy plaintext secret, migrated when settings are saved */
  googleClientSecret?: string;

  // Remote storage target
  driveStorageMode?: DriveStorageMode;
  driveFolderPath?: string;

  // Version history storage
  versionHistoryMode?: VersionHistoryMode;
  maxVersionFiles?: number;

  // Master password hash for verification (NEVER store plaintext password)
  masterPasswordHash?: string;
  masterPasswordSalt?: string;

  // Sync status
  lastSyncTime?: number;
  lastSyncError?: string;
  lastSyncHost?: string;

  // Remote file info
  driveFileId?: string;
}

/**
 * File version info
 */
export interface SyncVersion {
  id: string;
  modifiedTime: string;
  size?: string | null;
  name?: string;
  source?: VersionHistoryMode;
}

/**
 * Result of a sync operation
 */
export interface SyncResult {
  success: boolean;
  action: 'upload' | 'download' | 'merge' | 'none';
  timestamp: number;
  error?: string;
  conflictsResolved?: number;
}

/**
 * Merge conflict information
 */
export interface MergeConflict {
  profileId: string;
  localProfile: SyncableSSHProfile;
  remoteProfile: SyncableSSHProfile;
  resolution: 'local' | 'remote' | 'merged';
}
