/**
 * Settings component for the Google Drive Sync plugin.
 * Provides UI for:
 * - Enabling/disabling sync
 * - Connecting to Google Drive
 * - Setting master password
 * - Manual sync trigger
 * - Status display
 */

import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subscription, Observable } from 'rxjs';
import { SyncService, SyncState } from '../services/sync.service';
import {
  DriveConnectionStatus,
  DriveStorageMode,
} from '../services/drive.service';
import {
  SyncVersion,
  VersionHistoryMode,
} from '../interfaces/sync.interface';

@Component({
  selector: 'gdrive-sync-settings',
  template: `
    <div class="gdrive-sync-settings">
      <h3>
        <i class="fas fa-cloud"></i>
        Google Drive Sync
      </h3>

      <!-- Missing Plugins Warning -->
      <div
        class="alert alert-warning"
        *ngIf="(missingPlugins$ | async)?.length"
      >
        <div class="d-flex align-items-center gap-2">
          <i class="fas fa-exclamation-triangle text-warning"></i>
          <strong>Missing Plugins Detected:</strong>
        </div>
        <div class="mt-2 pl-4">
          {{ (missingPlugins$ | async)?.join(', ') }}
        </div>
        <div class="mt-1 pl-4 opacity-75 small">
          Please install them manually to match your other machine.
        </div>
      </div>

      <!-- Google Drive Account -->
      <div class="settings-section">
        <h4>
          <i class="fab fa-google-drive"></i>
          Google Drive Account
        </h4>
        <div class="status-section">
          <div
            class="status-indicator"
            [class.connected]="driveStatus?.connected"
            [class.error]="syncState?.status === 'error'"
          >
            <i
              class="fas"
              [class.fa-check-circle]="driveStatus?.connected"
              [class.fa-times-circle]="!driveStatus?.connected"
            ></i>
            <span *ngIf="driveStatus?.connected">
              Connected as {{ driveStatus?.email }}
            </span>
            <span *ngIf="!driveStatus?.connected"> Not connected </span>
          </div>

          <div class="sync-status" *ngIf="driveStatus?.connected">
            <span *ngIf="syncState?.status === 'syncing'">
              <i class="fas fa-sync fa-spin"></i> Syncing...
            </span>
            <span
              *ngIf="syncState?.status === 'idle' && syncState?.lastSyncTime"
            >
              <i class="fas fa-clock"></i> Last sync:
              {{ formatTime(syncState.lastSyncTime) }}
            </span>
            <span *ngIf="syncState?.status === 'error'" class="error-text">
              <i class="fas fa-exclamation-triangle"></i> Error:
              {{ syncState?.lastSyncError }}
            </span>
          </div>
        </div>
        <div class="help-text">
          Built-in credentials are used by default when the build provides
          them. Use custom credentials to depend on your own Google Cloud OAuth
          app.
        </div>
        <div class="setting-row">
          <label>
            <input
              type="checkbox"
              [(ngModel)]="useCustomGoogleCredentials"
            />
            Use custom Google credentials
          </label>
        </div>
        <div *ngIf="useCustomGoogleCredentials">
          <div class="input-group">
            <label for="gdrive-client-id">Google Client ID</label>
            <input
              id="gdrive-client-id"
              class="form-control"
              type="text"
              [(ngModel)]="googleClientId"
            />
          </div>
          <div class="input-group">
            <label for="gdrive-client-secret">Google Client Secret</label>
            <input
              id="gdrive-client-secret"
              class="form-control"
              type="password"
              autocomplete="new-password"
              [(ngModel)]="googleClientSecret"
            />
            <div class="help-text" *ngIf="hasSavedGoogleClientSecret">
              Leave empty to keep the saved secret.
            </div>
          </div>
        </div>
        <button
          class="btn btn-secondary"
          [class.save-needed]="googleCredentialsDirty"
          (click)="saveGoogleCredentialsSettings()"
          [disabled]="isSavingGoogleSettings"
        >
          <i class="fas fa-save"></i>
          Save OAuth settings
        </button>
        <div class="password-ok" *ngIf="googleSettingsMessage">
          <i class="fas fa-check-circle"></i> {{ googleSettingsMessage }}
        </div>
        <div class="password-error" *ngIf="googleSettingsError">
          <i class="fas fa-exclamation-triangle"></i> {{ googleSettingsError }}
        </div>
        <div
          class="alert alert-warning mt-2"
          *ngIf="driveStatus?.connected && googleCredentialsResetPending"
        >
          Saving these OAuth settings will disconnect Google Drive. Connect
          again after saving.
        </div>
        <div class="button-row account-actions">
          <button
            *ngIf="!driveStatus?.connected"
            class="btn btn-primary"
            (click)="connectGoogleDrive()"
            [disabled]="isConnecting"
          >
            <i class="fab fa-google-drive"></i>
            {{ isConnecting ? 'Connecting...' : 'Connect Google Drive' }}
          </button>
          <div *ngIf="driveStatus?.connected" class="connected-actions">
            <button class="btn btn-warning" (click)="disconnectGoogleDrive()">
              <i class="fas fa-unlink"></i>
              Disconnect
            </button>
          </div>
        </div>
        <div *ngIf="driveStatus?.connected" class="status-msg">
          <i class="fas fa-shield-alt"></i> Data encrypted with AES-256.
        </div>
      </div>

      <!-- Sync Password -->
      <div class="password-section">
        <h4>
          <i class="fas fa-key"></i>
          Sync Password
        </h4>
        <div class="help-text">
          Use the same password on every machine. The password itself is not
          stored; only a local verification hash is saved. After restarting
          Tabby, unlock it again to sync or restore old versions.
        </div>
        <div class="password-input-row">
          <input
            class="form-control"
            type="password"
            autocomplete="new-password"
            placeholder="Sync password"
            [(ngModel)]="masterPasswordInput"
            (keyup.enter)="saveMasterPassword()"
          />
          <button
            class="btn btn-success"
            (click)="saveMasterPassword()"
            [disabled]="isSavingPassword || !masterPasswordInput"
          >
            <i class="fas fa-unlock"></i>
            Unlock for this session
          </button>
        </div>
        <div class="password-actions">
          <button
            class="btn btn-secondary"
            (click)="changeMasterPassword()"
            [disabled]="isSavingPassword || !masterPasswordInput"
          >
            <i class="fas fa-key"></i>
            Set / change password
          </button>
        </div>
        <div class="password-ok" *ngIf="passwordConfigured && !passwordMessage">
          <i class="fas fa-check-circle"></i> Sync password configured
        </div>
        <div class="password-ok" *ngIf="passwordMessage">
          <i class="fas fa-check-circle"></i> {{ passwordMessage }}
        </div>
        <div class="password-error" *ngIf="passwordError">
          <i class="fas fa-exclamation-triangle"></i> {{ passwordError }}
        </div>
      </div>

      <!-- Drive Storage -->
      <div class="settings-section">
        <h4>
          <i class="fas fa-folder"></i>
          Drive Storage
        </h4>
        <div class="help-text">
          Hidden app folder uses limited app data access. Visible Drive folder
          asks Google for file access and creates the configured folder path.
        </div>
        <div class="setting-row">
          <label>
            <input
              type="radio"
              name="driveStorageMode"
              value="appDataFolder"
              [(ngModel)]="driveStorageMode"
            />
            Hidden app folder
          </label>
        </div>
        <div class="setting-row">
          <label>
            <input
              type="radio"
              name="driveStorageMode"
              value="driveFolder"
              [(ngModel)]="driveStorageMode"
            />
            Visible Drive folder
          </label>
        </div>
        <div class="input-group" *ngIf="driveStorageMode === 'driveFolder'">
          <label for="gdrive-folder-path">Drive folder path</label>
          <input
            id="gdrive-folder-path"
            class="form-control"
            type="text"
            placeholder="/Tabby Sync/"
            [(ngModel)]="driveFolderPath"
            (blur)="normalizeDriveFolderPath()"
          />
        </div>
        <button
          class="btn btn-secondary"
          [class.save-needed]="storageSettingsDirty"
          (click)="saveDriveStorageSettings()"
          [disabled]="isSavingStorageSettings"
        >
          <i class="fas fa-save"></i>
          Save storage settings
        </button>
        <div class="password-ok" *ngIf="storageSettingsMessage">
          <i class="fas fa-check-circle"></i> {{ storageSettingsMessage }}
        </div>
        <div class="password-error" *ngIf="storageSettingsError">
          <i class="fas fa-exclamation-triangle"></i> {{ storageSettingsError }}
        </div>
        <div
          class="alert alert-warning mt-2"
          *ngIf="driveStatus?.connected && storageResetPending"
        >
          Changing storage type will disconnect Google Drive. Connect again
          after saving to grant the matching permissions.
        </div>
      </div>

      <!-- Version History Storage -->
      <div class="settings-section">
        <h4>
          <i class="fas fa-history"></i>
          Version History
        </h4>
        <div class="setting-row">
          <label>
            <input
              type="radio"
              name="versionHistoryMode"
              value="googleRevisions"
              [(ngModel)]="versionHistoryMode"
            />
            Google Drive file history
          </label>
          <div class="help-text option-help">
            Uses Google revisions for one sync file. Google usually keeps
            revisions for about 30 days or the latest 100 versions.
          </div>
        </div>
        <div class="setting-row">
          <label>
            <input
              type="radio"
              name="versionHistoryMode"
              value="timestampedFiles"
              [(ngModel)]="versionHistoryMode"
            />
            Separate timestamped files
          </label>
          <div class="help-text option-help">
            Creates files with different names. Older visible Drive files are
            moved to Trash when the limit is exceeded.
          </div>
        </div>
        <div class="input-group" *ngIf="versionHistoryMode === 'timestampedFiles'">
          <label for="gdrive-max-version-files">Maximum files to keep</label>
          <input
            id="gdrive-max-version-files"
            class="form-control compact-number-input"
            type="number"
            min="1"
            max="1000"
            step="1"
            [(ngModel)]="maxVersionFiles"
          />
        </div>
        <button
          class="btn btn-secondary"
          [class.save-needed]="versionSettingsDirty"
          (click)="saveVersionHistorySettings()"
          [disabled]="isSavingVersionSettings"
        >
          <i class="fas fa-save"></i>
          Save version settings
        </button>
        <div class="password-ok" *ngIf="versionSettingsMessage">
          <i class="fas fa-check-circle"></i> {{ versionSettingsMessage }}
        </div>
        <div class="password-error" *ngIf="versionSettingsError">
          <i class="fas fa-exclamation-triangle"></i>
          {{ versionSettingsError }}
        </div>
      </div>

      <!-- Sync Settings -->
      <div class="settings-section">
        <h4>
          <i class="fas fa-sliders-h"></i>
          Sync Settings
        </h4>
        <div class="input-group">
          <label for="gdrive-sync-interval">Automatic sync interval</label>
          <div class="interval-input-row">
            <input
              id="gdrive-sync-interval"
              class="form-control interval-input"
              type="number"
              min="1"
              step="1"
              [(ngModel)]="syncIntervalMinutes"
              (keyup.enter)="saveSyncInterval()"
            />
            <span class="input-suffix">minutes</span>
            <button
              class="btn btn-secondary"
              [class.save-needed]="syncIntervalDirty"
              (click)="saveSyncInterval()"
              [disabled]="isSavingSettings"
            >
              <i class="fas fa-save"></i>
              Save
            </button>
          </div>
        </div>
        <div class="password-ok" *ngIf="settingsMessage">
          <i class="fas fa-check-circle"></i> {{ settingsMessage }}
        </div>
        <div class="password-error" *ngIf="settingsError">
          <i class="fas fa-exclamation-triangle"></i> {{ settingsError }}
        </div>
      </div>

      <!-- Version History (Time Machine) -->
      <div class="version-section" *ngIf="driveStatus?.connected">
        <h4 (click)="toggleVersions()" class="section-header">
          <i
            class="fas"
            [class.fa-chevron-right]="!showVersions"
            [class.fa-chevron-down]="showVersions"
          ></i>
          <i class="fas fa-history"></i> Time Machine (Version History)
        </h4>

        <div *ngIf="showVersions" class="version-list-container">
          <button
            class="btn btn-secondary btn-sm mb-2"
            (click)="loadVersions()"
            [disabled]="loadingVersions"
          >
            <i class="fas fa-sync" [class.fa-spin]="loadingVersions"></i>
            Refresh Versions
          </button>

          <div class="password-error" *ngIf="versionRestoreError">
            <i class="fas fa-exclamation-triangle"></i>
            {{ versionRestoreError }}
          </div>

          <div
            *ngIf="versions.length === 0 && !loadingVersions"
            class="text-muted help-text"
          >
            No versions found.
          </div>

          <div class="version-list">
            <div *ngFor="let version of versions" class="version-item">
              <div class="version-info">
                <span class="version-name">{{ version.name }}</span>
                <span class="version-meta" *ngIf="version.size"
                  >{{ (+version.size! / 1024).toFixed(1) }} KB</span
                >
              </div>
              <button
                class="btn btn-sm btn-warning"
                (click)="restoreVersion(version.id)"
                [disabled]="loadingVersions"
              >
                <i class="fas fa-undo"></i> Restore
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .gdrive-sync-settings {
        padding: 20px;
      }

      h3 {
        margin-bottom: 20px;
        color: var(--body-color);
      }

      h3 i,
      h4 i {
        margin-right: 8px;
        color: var(--theme-primary);
      }

      h4 {
        margin-top: 20px;
        margin-bottom: 10px;
        font-size: 1rem;
      }

      .status-msg {
        margin-top: 20px;
        opacity: 0.7;
        font-size: 0.9rem;
      }

      .status-section {
        background: var(--bs-body-bg);
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
      }

      .status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.95rem;
      }

      .status-indicator.connected i {
        color: var(--bs-success);
      }

      .status-indicator:not(.connected) i {
        color: var(--bs-warning);
      }

      .status-indicator.error i {
        color: var(--bs-danger);
      }

      .sync-status {
        margin-top: 8px;
        font-size: 0.85rem;
        opacity: 0.8;
      }

      .error-text {
        color: var(--bs-danger);
      }

      .setting-row {
        margin-bottom: 10px;
      }

      .setting-row label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }

      .setting-row input[type='checkbox'],
      .setting-row input[type='radio'] {
        width: 16px;
        height: 16px;
        accent-color: var(--theme-primary);
      }

      .button-row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 15px;
      }

      .btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        cursor: pointer;
        font-size: 0.9rem;
        transition:
          background-color 0.2s,
          color 0.2s,
          box-shadow 0.2s,
          opacity 0.2s;
      }

      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-primary {
        background: var(--theme-primary);
        color: white;
      }

      .btn-secondary {
        background: var(--bs-secondary);
        color: white;
      }

      .btn.save-needed:not(:disabled) {
        background: #111827;
        color: white;
        box-shadow: 0 0 0 2px rgba(17, 24, 39, 0.18);
      }

      .btn-success {
        background: var(--bs-success);
        color: white;
      }

      .btn-warning {
        background: var(--bs-warning);
        color: black;
      }

      .btn-info {
        background: var(--bs-info);
        color: white;
      }

      .btn-icon {
        background: transparent;
        padding: 8px;
        color: var(--body-color);
      }

      .password-section {
        background: var(--bs-body-bg);
        border-radius: 8px;
        padding: 15px;
        margin: 20px 0;
      }

      .settings-section {
        background: var(--bs-body-bg);
        border-radius: 8px;
        padding: 15px;
        margin: 20px 0;
      }

      .help-text {
        font-size: 0.85rem;
        opacity: 0.8;
        margin-bottom: 10px;
      }

      .option-help {
        margin: 4px 0 12px 24px;
      }

      .password-input-row {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }

      .interval-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .interval-input {
        flex: 0 0 96px;
        width: 96px;
        max-width: 96px;
        text-align: center;
      }

      .input-suffix {
        opacity: 0.8;
        font-size: 0.9rem;
      }

      .form-control {
        flex: 1;
        box-sizing: border-box;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid rgba(120, 120, 120, 0.55);
        background: rgba(120, 120, 120, 0.12);
        color: var(--body-color);
        min-height: 38px;
        box-shadow: inset 0 0 0 1px rgba(120, 120, 120, 0.08);
      }

      .form-control:focus {
        border-color: var(--theme-primary);
        outline: none;
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
      }

      .interval-input-row .interval-input {
        flex: 0 0 96px;
        width: 96px;
        max-width: 96px;
        text-align: center;
      }

      .compact-number-input {
        flex: 0 0 120px;
        width: 120px;
        max-width: 120px;
      }

      .password-actions {
        display: flex;
        gap: 10px;
      }

      .password-error {
        color: var(--bs-danger);
        font-size: 0.85rem;
        margin-top: 10px;
      }

      .password-ok {
        color: var(--bs-success);
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.9rem;
      }

      .credentials-section {
        background: var(--bs-body-bg);
        border-radius: 8px;
        padding: 20px;
        margin-bottom: 20px;
      }

      .credentials-section a {
        color: var(--theme-primary);
      }

      .input-group {
        display: block;
        margin-bottom: 15px;
        width: 100%;
      }

      .input-group label {
        display: block;
        margin-bottom: 5px;
        font-size: 0.9rem;
        opacity: 0.9;
      }

      .input-group .form-control {
        width: 100%;
        max-width: 100%;
      }

      .reset-section {
        margin-top: 15px;
        opacity: 0.7;
      }

      .btn-link {
        background: transparent;
        border: none;
        color: var(--bs-secondary);
        padding: 5px 0;
        font-size: 0.85rem;
        cursor: pointer;
      }

      .btn-link:hover {
        color: var(--theme-primary);
      }

      .alert {
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 20px;
        border: 1px solid transparent;
      }
      .alert-warning {
        background: rgba(255, 193, 7, 0.1);
        border-color: rgba(255, 193, 7, 0.2);
        color: var(--body-color);
      }
      .text-warning {
        color: var(--bs-warning);
      }
      .gap-2 {
        gap: 0.5rem;
      }
      .d-flex {
        display: flex;
      }
      .align-items-center {
        align-items: center;
      }
      .pl-4 {
        padding-left: 1.5rem;
      }
      .mt-2 {
        margin-top: 0.5rem;
      }
      .mt-1 {
        margin-top: 0.25rem;
      }
      .opacity-75 {
        opacity: 0.75;
      }
      .small {
        font-size: 0.85rem;
      }

      .version-section {
        margin-top: 20px;
        background: var(--bs-body-bg);
        border-radius: 8px;
        padding: 15px;
      }

      .section-header {
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
        padding: 5px 0;
      }

      .version-list-container {
        margin-top: 15px;
      }

      .version-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        border-bottom: 1px solid var(--bs-border-color);
      }

      .version-info {
        display: flex;
        flex-direction: column;
      }

      .version-name {
        font-weight: bold;
        font-size: 0.9rem;
      }

      .version-meta {
        font-size: 0.8rem;
        opacity: 0.7;
      }
    `,
  ],
})
export class SettingsComponent implements OnInit, OnDestroy {
  // State
  driveStatus: DriveConnectionStatus | null = null;
  syncState: SyncState | null = null;
  isConnecting = false;
  isSavingPassword = false;
  isSavingSettings = false;
  isSavingGoogleSettings = false;
  isSavingStorageSettings = false;
  isSavingVersionSettings = false;
  masterPasswordInput = '';
  passwordError = '';
  passwordMessage = '';
  passwordConfigured = false;
  syncIntervalMinutes = 60;
  savedSyncIntervalMinutes = 60;
  settingsError = '';
  settingsMessage = '';
  useCustomGoogleCredentials = false;
  googleClientId = '';
  googleClientSecret = '';
  hasSavedGoogleClientSecret = false;
  savedUseCustomGoogleCredentials = false;
  savedGoogleClientId = '';
  googleSettingsError = '';
  googleSettingsMessage = '';
  driveStorageMode: DriveStorageMode = 'appDataFolder';
  driveFolderPath = '/Tabby Sync/';
  savedDriveStorageMode: DriveStorageMode = 'appDataFolder';
  savedDriveFolderPath = '/Tabby Sync/';
  storageSettingsError = '';
  storageSettingsMessage = '';
  versionHistoryMode: VersionHistoryMode = 'googleRevisions';
  maxVersionFiles = 20;
  savedVersionHistoryMode: VersionHistoryMode = 'googleRevisions';
  savedMaxVersionFiles = 20;
  versionSettingsError = '';
  versionSettingsMessage = '';

  // Version History
  versions: SyncVersion[] = [];
  loadingVersions = false;
  showVersions = false;
  versionRestoreError = '';

  private subscriptions: Subscription[] = [];

  constructor(private sync: SyncService) {}

  get missingPlugins$(): Observable<string[]> {
    return this.sync.missingPlugins$;
  }

  get googleCredentialsResetPending(): boolean {
    if (
      this.savedUseCustomGoogleCredentials !==
      this.useCustomGoogleCredentials
    ) {
      return true;
    }

    if (!this.useCustomGoogleCredentials) {
      return false;
    }

    return (
      this.savedGoogleClientId !== this.googleClientId.trim() ||
      !!this.googleClientSecret.trim()
    );
  }

  get googleCredentialsDirty(): boolean {
    return this.googleCredentialsResetPending;
  }

  get storageResetPending(): boolean {
    return this.savedDriveStorageMode !== this.driveStorageMode;
  }

  get storageSettingsDirty(): boolean {
    return (
      this.savedDriveStorageMode !== this.driveStorageMode ||
      this.savedDriveFolderPath !==
        this.sync.normalizeDriveFolderPath(this.driveFolderPath || '/Tabby Sync/')
    );
  }

  get versionSettingsDirty(): boolean {
    return (
      this.savedVersionHistoryMode !== this.versionHistoryMode ||
      (this.versionHistoryMode === 'timestampedFiles' &&
        Number(this.maxVersionFiles) !== this.savedMaxVersionFiles)
    );
  }

  get syncIntervalDirty(): boolean {
    return Number(this.syncIntervalMinutes) !== this.savedSyncIntervalMinutes;
  }

  ngOnInit(): void {
    this.passwordConfigured = this.sync.isPasswordConfigured();
    this.syncIntervalMinutes = this.sync.getSyncIntervalMinutes();
    this.savedSyncIntervalMinutes = this.syncIntervalMinutes;
    const googleSettings = this.sync.getGoogleCredentialsSettings();
    this.useCustomGoogleCredentials =
      googleSettings.useCustomGoogleCredentials;
    this.googleClientId = googleSettings.googleClientId;
    this.googleClientSecret = googleSettings.googleClientSecret;
    this.hasSavedGoogleClientSecret =
      googleSettings.hasSavedGoogleClientSecret;
    this.savedUseCustomGoogleCredentials =
      googleSettings.useCustomGoogleCredentials;
    this.savedGoogleClientId = googleSettings.googleClientId;

    const storageSettings = this.sync.getDriveStorageSettings();
    this.driveStorageMode = storageSettings.driveStorageMode;
    this.driveFolderPath = storageSettings.driveFolderPath;
    this.savedDriveStorageMode = storageSettings.driveStorageMode;
    this.savedDriveFolderPath = storageSettings.driveFolderPath;

    const versionSettings = this.sync.getVersionHistorySettings();
    this.versionHistoryMode = versionSettings.versionHistoryMode;
    this.maxVersionFiles = versionSettings.maxVersionFiles;
    this.savedVersionHistoryMode = versionSettings.versionHistoryMode;
    this.savedMaxVersionFiles = versionSettings.maxVersionFiles;

    // Subscribe to drive status
    this.subscriptions.push(
      this.sync.getDriveStatus().subscribe((status) => {
        this.driveStatus = status;
      }),
    );

    // Subscribe to sync state
    this.subscriptions.push(
      this.sync.syncState$.subscribe((state) => {
        this.syncState = state;
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  async saveMasterPassword(): Promise<void> {
    const password = this.masterPasswordInput.trim();
    if (!password) {
      this.passwordError = 'Enter sync password';
      return;
    }

    this.isSavingPassword = true;
    this.passwordError = '';
    this.passwordMessage = '';
    try {
      if (this.sync.isPasswordConfigured()) {
        if (!this.sync.setMasterPassword(password)) {
          this.passwordError = 'Wrong sync password';
          return;
        }
      } else {
        await this.sync.setupMasterPassword(password);
      }

      this.passwordConfigured = true;
      this.passwordMessage = 'Sync password unlocked for this Tabby session';
      this.versionRestoreError = '';
      this.masterPasswordInput = '';

      if (this.driveStatus?.connected) {
        this.sync.fullSync();
      }
    } finally {
      this.isSavingPassword = false;
    }
  }

  async changeMasterPassword(): Promise<void> {
    const password = this.masterPasswordInput.trim();
    if (!password) {
      this.passwordError = 'Enter new sync password';
      return;
    }

    this.isSavingPassword = true;
    this.passwordError = '';
    this.passwordMessage = '';
    try {
      const result = await this.sync.changeMasterPassword(password);
      if (!result.savedLocal) {
        this.passwordError =
          'Failed to save sync password' +
          (result.error ? ': ' + result.error : '');
        return;
      }

      this.passwordConfigured = true;
      this.masterPasswordInput = '';

      if (result.remoteSynced || !this.driveStatus?.connected) {
        this.passwordMessage = 'Sync password saved';
      } else {
        this.passwordMessage =
          'Password saved locally; remote re-encryption failed';
        this.passwordError =
          'Try syncing manually' + (result.error ? ': ' + result.error : '');
      }
    } finally {
      this.isSavingPassword = false;
    }
  }

  async saveSyncInterval(): Promise<void> {
    const minutes = Number(this.syncIntervalMinutes);
    if (!Number.isFinite(minutes) || minutes < 1) {
      this.settingsError = 'Enter an interval of at least 1 minute';
      return;
    }

    this.isSavingSettings = true;
    this.settingsError = '';
    this.settingsMessage = '';
    try {
      await this.sync.setSyncIntervalMinutes(minutes);
      this.syncIntervalMinutes = this.sync.getSyncIntervalMinutes();
      this.savedSyncIntervalMinutes = this.syncIntervalMinutes;
      this.settingsMessage = 'Sync interval saved';
    } catch (error) {
      this.settingsError =
        'Failed to save sync interval: ' + (error as Error).message;
    } finally {
      this.isSavingSettings = false;
    }
  }

  async saveGoogleCredentialsSettings(): Promise<void> {
    if (
      this.driveStatus?.connected &&
      this.googleCredentialsResetPending &&
      !window.confirm(
        'Changing Google OAuth settings will disconnect Google Drive. ' +
          'You will need to connect again. Continue?',
      )
    ) {
      return;
    }

    this.isSavingGoogleSettings = true;
    this.googleSettingsError = '';
    this.googleSettingsMessage = '';
    try {
      const result = await this.sync.setGoogleCredentialsSettings({
        useCustomGoogleCredentials: this.useCustomGoogleCredentials,
        googleClientId: this.googleClientId,
        googleClientSecret: this.googleClientSecret,
      });
      const googleSettings = this.sync.getGoogleCredentialsSettings();
      this.useCustomGoogleCredentials =
        googleSettings.useCustomGoogleCredentials;
      this.googleClientId = googleSettings.googleClientId;
      this.googleClientSecret = '';
      this.hasSavedGoogleClientSecret =
        googleSettings.hasSavedGoogleClientSecret;
      this.savedUseCustomGoogleCredentials =
        googleSettings.useCustomGoogleCredentials;
      this.savedGoogleClientId = googleSettings.googleClientId;
      this.googleSettingsMessage = result.reconnectRequired
        ? 'OAuth settings saved. Connect Google Drive again to apply them.'
        : 'OAuth settings saved.';
    } catch (error) {
      this.googleSettingsError =
        'Failed to save OAuth settings: ' + (error as Error).message;
    } finally {
      this.isSavingGoogleSettings = false;
    }
  }

  normalizeDriveFolderPath(): void {
    this.driveFolderPath = this.sync.normalizeDriveFolderPath(
      this.driveFolderPath,
    );
  }

  async saveDriveStorageSettings(): Promise<void> {
    if (
      this.driveStatus?.connected &&
      this.storageResetPending &&
      !window.confirm(
        'Changing Drive storage type will disconnect Google Drive. ' +
          'You will need to connect again with the new permissions. Continue?',
      )
    ) {
      return;
    }

    this.isSavingStorageSettings = true;
    this.storageSettingsError = '';
    this.storageSettingsMessage = '';
    try {
      this.normalizeDriveFolderPath();
      const result = await this.sync.setDriveStorageSettings({
        driveStorageMode: this.driveStorageMode,
        driveFolderPath: this.driveFolderPath,
      });
      const storageSettings = this.sync.getDriveStorageSettings();
      this.driveStorageMode = storageSettings.driveStorageMode;
      this.driveFolderPath = storageSettings.driveFolderPath;
      this.savedDriveStorageMode = storageSettings.driveStorageMode;
      this.savedDriveFolderPath = storageSettings.driveFolderPath;
      this.storageSettingsMessage = result.reconnectRequired
        ? 'Storage settings saved. Connect Google Drive again to apply them.'
        : 'Storage settings saved.';
    } catch (error) {
      this.storageSettingsError =
        'Failed to save storage settings: ' + (error as Error).message;
    } finally {
      this.isSavingStorageSettings = false;
    }
  }

  async saveVersionHistorySettings(): Promise<void> {
    this.isSavingVersionSettings = true;
    this.versionSettingsError = '';
    this.versionSettingsMessage = '';
    try {
      await this.sync.setVersionHistorySettings({
        versionHistoryMode: this.versionHistoryMode,
        maxVersionFiles: this.maxVersionFiles,
      });
      const versionSettings = this.sync.getVersionHistorySettings();
      this.versionHistoryMode = versionSettings.versionHistoryMode;
      this.maxVersionFiles = versionSettings.maxVersionFiles;
      this.savedVersionHistoryMode = versionSettings.versionHistoryMode;
      this.savedMaxVersionFiles = versionSettings.maxVersionFiles;
      this.versions = [];
      this.versionSettingsMessage = 'Version settings saved.';
    } catch (error) {
      this.versionSettingsError =
        'Failed to save version settings: ' + (error as Error).message;
    } finally {
      this.isSavingVersionSettings = false;
    }
  }

  async connectGoogleDrive(): Promise<void> {
    if (!this.sync.hasGoogleCredentials()) {
      this.googleSettingsError =
        'Save Google Client ID and Client Secret first';
      return;
    }

    this.isConnecting = true;
    try {
      const success = await this.sync.connectGoogleDrive();
      if (success) {
        if (this.sync.hasPassword()) {
          await this.sync.setEnabled(true);
          // Trigger initial sync
          this.sync.fullSync();
        } else {
          this.passwordMessage =
            'Google Drive connected. Set or unlock sync password next.';
        }
      }
    } finally {
      this.isConnecting = false;
    }
  }

  async disconnectGoogleDrive(): Promise<void> {
    await this.sync.disconnectGoogleDrive();
    await this.sync.setEnabled(false);
  }

  formatTime(date: Date): string {
    if (!date) return '';
    return date.toLocaleString();
  }

  toggleVersions(): void {
    this.showVersions = !this.showVersions;
    if (this.showVersions && this.versions.length === 0) {
      this.loadVersions();
    }
  }

  async loadVersions(): Promise<void> {
    this.loadingVersions = true;
    try {
      this.versions = await this.sync.listRemoteVersions();
    } finally {
      this.loadingVersions = false;
    }
  }

  async restoreVersion(id: string): Promise<void> {
    this.versionRestoreError = '';
    if (!this.sync.hasPassword()) {
      this.versionRestoreError =
        'Enter Sync Password above and click "Unlock for this session" before restoring versions.';
      return;
    }

    if (
      !confirm(
        'Are you sure you want to restore this version? Current settings will be overwritten.',
      )
    ) {
      return;
    }

    this.loadingVersions = true;
    try {
      const success = await this.sync.restoreRemoteVersion(id);
      if (success) {
        alert(
          'Restored successfully! Please restart Tabby to apply all changes.',
        );
        // Refresh versions to update list? Not needed.
      } else {
        alert('Failed to restore version. Check logs.');
      }
    } finally {
      this.loadingVersions = false;
    }
  }
}
