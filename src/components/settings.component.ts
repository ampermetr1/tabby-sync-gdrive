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
import { DriveConnectionStatus } from '../services/drive.service';
import { SyncVersion } from '../interfaces/sync.interface';

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

      <!-- Connection Status -->
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
          <span *ngIf="syncState?.status === 'idle' && syncState?.lastSyncTime">
            <i class="fas fa-clock"></i> Last sync:
            {{ formatTime(syncState.lastSyncTime) }}
          </span>
          <span *ngIf="syncState?.status === 'error'" class="error-text">
            <i class="fas fa-exclamation-triangle"></i> Error:
            {{ syncState?.lastSyncError }}
          </span>
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
          stored; only a local verification hash is saved.
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
            Unlock
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

      <!-- Google Drive Connection -->
      <div class="button-row">
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

      <!-- Status message when connected -->
      <div *ngIf="driveStatus?.connected" class="status-msg">
        <i class="fas fa-shield-alt"></i> Data encrypted with AES-256. Auto-sync
        active.
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
        transition: opacity 0.2s;
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

      .password-input-row {
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }

      .interval-input-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .interval-input {
        max-width: 120px;
      }

      .input-suffix {
        opacity: 0.8;
        font-size: 0.9rem;
      }

      .form-control {
        flex: 1;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid var(--bs-border-color);
        background: var(--bs-dark);
        color: var(--body-color);
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
        margin-bottom: 15px;
      }

      .input-group label {
        display: block;
        margin-bottom: 5px;
        font-size: 0.9rem;
        opacity: 0.9;
      }

      .input-group .form-control {
        width: 100%;
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
  masterPasswordInput = '';
  passwordError = '';
  passwordMessage = '';
  passwordConfigured = false;
  syncIntervalMinutes = 60;
  settingsError = '';
  settingsMessage = '';

  // Version History
  versions: SyncVersion[] = [];
  loadingVersions = false;
  showVersions = false;

  private subscriptions: Subscription[] = [];

  constructor(private sync: SyncService) {}

  get missingPlugins$(): Observable<string[]> {
    return this.sync.missingPlugins$;
  }

  ngOnInit(): void {
    this.passwordConfigured = this.sync.isPasswordConfigured();
    this.syncIntervalMinutes = this.sync.getSyncIntervalMinutes();

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
      this.passwordMessage = 'Sync password unlocked';
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
      if (await this.sync.changeMasterPassword(password)) {
        this.passwordConfigured = true;
        this.passwordMessage = 'Sync password saved';
        this.masterPasswordInput = '';
      } else {
        this.passwordError = 'Failed to save sync password';
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
      this.settingsMessage = 'Sync interval saved';
    } catch (error) {
      this.settingsError =
        'Failed to save sync interval: ' + (error as Error).message;
    } finally {
      this.isSavingSettings = false;
    }
  }

  async connectGoogleDrive(): Promise<void> {
    if (!this.sync.hasPassword()) {
      this.passwordError = 'Set or unlock sync password first';
      return;
    }

    this.isConnecting = true;
    try {
      const success = await this.sync.connectGoogleDrive();
      if (success) {
        await this.sync.setEnabled(true);
        // Trigger initial sync
        this.sync.fullSync();
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
