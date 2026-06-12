/**
 * Google Drive API service for file operations.
 *
 * DESIGN:
 * - Uses Google Drive API v3
 * - Stores data in AppData folder (hidden from user's Drive view)
 * - Implements OAuth 2.0 Desktop App flow
 * - Handles token refresh automatically
 *
 * SCOPE:
 * - https://www.googleapis.com/auth/drive.appdata for hidden app storage
 * - https://www.googleapis.com/auth/drive.file for visible Drive folder storage
 */

import { Injectable, NgZone } from '@angular/core';
import { Logger, LogService, PlatformService } from 'tabby-core';
import { google, drive_v3 } from 'googleapis';
import { OAuth2Client, Credentials } from 'google-auth-library';
import { BehaviorSubject, Observable } from 'rxjs';
import * as http from 'http';
import * as url from 'url';
import { VersionHistoryMode } from '../interfaces/sync.interface';

/** Google OAuth configuration */
const APP_DATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SYNC_FILE_NAME = 'tabby-sync.json';
const SNAPSHOT_FILE_PREFIX = 'tabby-sync-';
const SNAPSHOT_FILE_EXTENSION = '.json';
const REDIRECT_PORT = 45678; // Local port for OAuth callback
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

/** Built-in OAuth credentials can be injected by the package build. */
const GOOGLE_CLIENT_ID =
  typeof process !== 'undefined'
    ? process.env['TABBY_SYNC_GDRIVE_GOOGLE_CLIENT_ID'] || ''
    : '';
const GOOGLE_CLIENT_SECRET =
  typeof process !== 'undefined'
    ? process.env['TABBY_SYNC_GDRIVE_GOOGLE_CLIENT_SECRET'] || ''
    : '';

export type DriveStorageMode = 'appDataFolder' | 'driveFolder';

export interface DriveConfiguration {
  useDefaultCredentials?: boolean;
  clientId?: string;
  clientSecret?: string;
  storageMode?: DriveStorageMode;
  folderPath?: string;
  versionHistoryMode?: VersionHistoryMode;
  maxVersionFiles?: number;
}

export interface DriveVersion {
  id: string;
  modifiedTime: string;
  size?: string | null;
  name: string;
  source: VersionHistoryMode;
}

/**
 * Connection status for UI
 */
export interface DriveConnectionStatus {
  connected: boolean;
  email?: string;
  lastError?: string;
}

@Injectable()
export class DriveService {
  private readonly log: Logger;
  private oauth2Client: OAuth2Client | null = null;
  private drive: drive_v3.Drive | null = null;
  private activeServer: http.Server | null = null;

  // Stored credentials
  private clientId: string = '';
  private clientSecret: string = '';
  private storageMode: DriveStorageMode = 'appDataFolder';
  private folderPath: string = '/Tabby Sync/';
  private folderId: string | null = null;
  private versionHistoryMode: VersionHistoryMode = 'googleRevisions';
  private maxVersionFiles = 20;

  /** Observable for connection status updates */
  private connectionStatus = new BehaviorSubject<DriveConnectionStatus>({
    connected: false,
  });
  public connectionStatus$: Observable<DriveConnectionStatus> =
    this.connectionStatus.asObservable();

  /** Cached file ID for the sync file */
  private syncFileId: string | null = null;

  constructor(
    private platform: PlatformService,
    private zone: NgZone,
    logService: LogService,
  ) {
    this.log = logService.create('GDriveSync:Drive');

    // Auto-configure with build-provided credentials and hidden AppData storage.
    this.configure({});
  }

  /**
   * Configure OAuth credentials. Must be called before authorize().
   */
  configure(configuration: DriveConfiguration): void {
    const useDefaultCredentials = configuration.useDefaultCredentials !== false;
    this.clientId = useDefaultCredentials
      ? GOOGLE_CLIENT_ID
      : configuration.clientId || '';
    this.clientSecret = useDefaultCredentials
      ? GOOGLE_CLIENT_SECRET
      : configuration.clientSecret || '';
    this.storageMode = configuration.storageMode || 'appDataFolder';
    this.folderPath = this.normalizeFolderPath(
      configuration.folderPath || '/Tabby Sync/',
    );
    this.versionHistoryMode =
      configuration.versionHistoryMode || 'googleRevisions';
    this.maxVersionFiles = this.normalizeMaxVersionFiles(
      configuration.maxVersionFiles,
    );
    this.folderId = null;
    this.syncFileId = null;

    // Reinitialize OAuth2 client with new credentials
    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      REDIRECT_URI,
    );

    // Set up token refresh handling
    this.oauth2Client.on('tokens', (_tokens) => {
      this.log.info('OAuth tokens refreshed');
      // Tokens will be saved by SyncService
    });

    this.log.debug(
      `OAuth credentials configured with storage mode ${this.storageMode}`,
    );
  }

  /**
   * Returns the configured remote storage mode.
   */
  getStorageMode(): DriveStorageMode {
    return this.storageMode;
  }

  /**
   * Updates the sync file location without changing OAuth credentials.
   */
  updateStorageTarget(
    storageMode: DriveStorageMode,
    folderPath: string,
  ): void {
    this.storageMode = storageMode;
    this.folderPath = this.normalizeFolderPath(folderPath);
    this.folderId = null;
    this.syncFileId = null;
    this.log.debug(`Drive storage target updated to ${this.storageMode}`);
  }

  /**
   * Updates how historical versions are stored.
   */
  updateVersionHistory(
    versionHistoryMode: VersionHistoryMode,
    maxVersionFiles: number,
  ): void {
    this.versionHistoryMode = versionHistoryMode;
    this.maxVersionFiles = this.normalizeMaxVersionFiles(maxVersionFiles);
    this.syncFileId = null;
  }

  private normalizeMaxVersionFiles(maxVersionFiles?: number): number {
    const normalized = Math.floor(Number(maxVersionFiles || 20));
    if (!Number.isFinite(normalized) || normalized < 1) {
      return 1;
    }
    return Math.min(normalized, 1000);
  }

  /**
   * Normalizes a Drive folder path to /Folder/Subfolder/ format.
   */
  normalizeFolderPath(folderPath: string): string {
    const parts = folderPath
      .replace(/\\/g, '/')
      .split('/')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return '/';
    }

    return `/${parts.join('/')}/`;
  }

  /**
   * Check if credentials are configured
   */
  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Get OAuth2 client, throws if not configured
   */
  private getOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      throw new Error(
        'OAuth credentials not configured. Please set up Google API credentials first.',
      );
    }
    return this.oauth2Client;
  }

  /**
   * Initializes the Drive client with stored tokens.
   *
   * @param tokens - Stored OAuth tokens
   * @returns True if initialization successful
   */
  async initialize(tokens: Credentials): Promise<boolean> {
    try {
      const client = this.getOAuth2Client();
      client.setCredentials(tokens);

      // Verify tokens are valid by making a simple request
      await client.getAccessToken();

      this.drive = google.drive({ version: 'v3', auth: client });

      // Get user email for display
      const about = await this.drive.about.get({ fields: 'user' });
      const email = about.data.user?.emailAddress ?? undefined;

      this.connectionStatus.next({
        connected: true,
        email,
      });

      this.log.info(`Connected to Google Drive as ${email}`);
      return true;
    } catch (error) {
      this.log.error('Failed to initialize Drive client:', error);
      this.connectionStatus.next({
        connected: false,
        lastError: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Gets the current OAuth tokens.
   *
   * @returns Current credentials or null
   */
  getTokens(): Credentials | null {
    if (!this.oauth2Client) return null;
    return this.oauth2Client.credentials;
  }

  /**
   * Starts the OAuth 2.0 authorization flow.
   * Opens a browser window for user to grant permissions.
   *
   * @returns Promise resolving to OAuth tokens
   */
  async authorize(): Promise<Credentials> {
    return new Promise((resolve, reject) => {
      const client = this.getOAuth2Client();

      // Generate auth URL
      const authUrl = client.generateAuthUrl({
        access_type: 'offline', // Get refresh token
        scope:
          this.storageMode === 'driveFolder'
            ? [DRIVE_FILE_SCOPE]
            : [APP_DATA_SCOPE],
        prompt: 'consent', // Force consent screen to get refresh_token
      });

      this.log.info('Starting OAuth flow');

      // Create temporary local server to receive the callback
      if (this.activeServer) {
        this.activeServer.close();
        this.activeServer = null;
      }

      const server = http.createServer(async (req, res) => {
        try {
          if (!req.url) {
            res.writeHead(400);
            res.end('Invalid request');
            return;
          }

          const parsedUrl = url.parse(req.url, true);

          if (parsedUrl.pathname !== '/oauth2callback') {
            res.writeHead(404);
            res.end('Not found');
            return;
          }

          const code = parsedUrl.query.code as string;
          const error = parsedUrl.query.error as string;

          if (error) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h1>❌ Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </body>
              </html>
            `);
            server.close();
            this.activeServer = null;
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          if (!code) {
            res.writeHead(400);
            res.end('No authorization code received');
            server.close();
            this.activeServer = null;
            reject(new Error('No authorization code received'));
            return;
          }

          // Exchange code for tokens
          const { tokens } = await client.getToken(code);
          client.setCredentials(tokens);

          // Initialize Drive client
          this.drive = google.drive({ version: 'v3', auth: client });

          // Get user email
          const about = await this.drive.about.get({ fields: 'user' });
          const email = about.data.user?.emailAddress ?? undefined;

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1>Authorization Successful</h1>
                <p>Connected as: ${email}</p>
                <p>You can close this window and return to Tabby.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
              </body>
            </html>
          `);

          server.close();
          this.activeServer = null;

          this.zone.run(() => {
            this.connectionStatus.next({
              connected: true,
              email,
            });
          });

          this.log.info(`OAuth flow completed successfully for ${email}`);
          resolve(tokens);
        } catch (err) {
          this.log.error('OAuth callback error:', err);
          res.writeHead(500);
          res.end('Internal server error');
          server.close();
          this.activeServer = null;
          reject(err);
        }
      });

      server.listen(REDIRECT_PORT, () => {
        this.activeServer = server;
        this.log.debug(
          `OAuth callback server listening on port ${REDIRECT_PORT}`,
        );
        // Open browser for authorization
        this.platform.openExternal(authUrl);
      });

      // Handle server errors
      server.on('error', (err) => {
        this.log.error('OAuth server error:', err);
        reject(err);
      });

      // Timeout after 5 minutes
      setTimeout(
        () => {
          if (server.listening) {
            server.close();
            this.activeServer = null;
            reject(new Error('OAuth flow timed out'));
          }
        },
        5 * 60 * 1000,
      );
    });
  }

  /**
   * Disconnects from Google Drive.
   * Revokes tokens and clears cached state.
   */
  async disconnect(): Promise<void> {
    try {
      if (this.oauth2Client?.credentials?.access_token) {
        await this.oauth2Client.revokeCredentials();
      }
    } catch (error) {
      this.log.warn('Error revoking credentials:', error);
    }

    if (this.oauth2Client) {
      this.oauth2Client.setCredentials({});
    }
    this.drive = null;
    this.syncFileId = null;
    this.folderId = null;

    this.connectionStatus.next({
      connected: false,
    });

    this.log.info('Disconnected from Google Drive');
  }

  private escapeQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private createSnapshotFileName(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${SNAPSHOT_FILE_PREFIX}${timestamp}${SNAPSHOT_FILE_EXTENSION}`;
  }

  private isSnapshotFileName(name?: string | null): boolean {
    return !!(
      name &&
      name.startsWith(SNAPSHOT_FILE_PREFIX) &&
      name.endsWith(SNAPSHOT_FILE_EXTENSION)
    );
  }

  private async ensureDriveFolder(): Promise<string> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    if (this.folderId) {
      try {
        await this.drive.files.get({
          fileId: this.folderId,
          fields: 'id',
        });
        return this.folderId;
      } catch {
        this.folderId = null;
      }
    }

    const parts = this.normalizeFolderPath(this.folderPath)
      .split('/')
      .filter(Boolean);
    let parentId = 'root';

    for (const part of parts) {
      const escapedName = this.escapeQueryValue(part);
      const escapedParent = this.escapeQueryValue(parentId);
      const response = await this.drive.files.list({
        q:
          `name = '${escapedName}' and ` +
          'mimeType = \'application/vnd.google-apps.folder\' and ' +
          `'${escapedParent}' in parents and trashed = false`,
        fields: 'files(id, name)',
        pageSize: 1,
      });

      const existingFolder = response.data.files?.[0];
      if (existingFolder?.id) {
        parentId = existingFolder.id;
        continue;
      }

      const createResponse = await this.drive.files.create({
        requestBody: {
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        fields: 'id',
      });

      if (!createResponse.data.id) {
        throw new Error(`Failed to create Drive folder: ${part}`);
      }

      parentId = createResponse.data.id;
    }

    this.folderId = parentId;
    return parentId;
  }

  private async getSyncParent(): Promise<{
    spaces?: string;
    parents: string[];
  }> {
    if (this.storageMode === 'driveFolder') {
      return {
        parents: [await this.ensureDriveFolder()],
      };
    }

    return {
      spaces: 'appDataFolder',
      parents: ['appDataFolder'],
    };
  }

  /**
   * Finds the sync file in configured storage.
   *
   * @returns File ID or null if not found
   */
  private async findSyncFile(): Promise<string | null> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    if (this.versionHistoryMode === 'timestampedFiles') {
      const latestSnapshot = await this.findLatestSnapshotFile();
      if (latestSnapshot?.id) {
        this.syncFileId = latestSnapshot.id;
        return latestSnapshot.id;
      }
    } else if (this.syncFileId) {
      // Verify file still exists
      try {
        await this.drive.files.get({
          fileId: this.syncFileId,
        });
        return this.syncFileId;
      } catch {
        // File no longer exists, clear cache
        this.syncFileId = null;
      }
    }

    const syncParent = await this.getSyncParent();
    const escapedFileName = this.escapeQueryValue(SYNC_FILE_NAME);
    const q =
      this.storageMode === 'driveFolder'
        ? `name = '${escapedFileName}' and ` +
          `'${this.escapeQueryValue(syncParent.parents[0])}' in parents and ` +
          'trashed = false'
        : `name = '${escapedFileName}' and trashed = false`;

    // Search for the file
    const response = await this.drive.files.list({
      spaces: syncParent.spaces,
      q,
      fields: 'files(id, name, modifiedTime)',
      pageSize: 1,
    });

    if (response.data.files && response.data.files.length > 0) {
      this.syncFileId = response.data.files[0].id || null;
      return this.syncFileId;
    }

    return null;
  }

  private async listSnapshotFiles(): Promise<drive_v3.Schema$File[]> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    const syncParent = await this.getSyncParent();
    const escapedParent = this.escapeQueryValue(syncParent.parents[0]);
    const q =
      this.storageMode === 'driveFolder'
        ? `name contains '${SNAPSHOT_FILE_PREFIX}' and ` +
          `'${escapedParent}' in parents and trashed = false`
        : `name contains '${SNAPSHOT_FILE_PREFIX}' and trashed = false`;

    const response = await this.drive.files.list({
      spaces: syncParent.spaces,
      q,
      fields: 'files(id, name, modifiedTime, size)',
      orderBy: 'modifiedTime desc',
      pageSize: 1000,
    });

    return (response.data.files || [])
      .filter((file) => this.isSnapshotFileName(file.name))
      .sort(
        (a, b) =>
          new Date(b.modifiedTime || 0).getTime() -
          new Date(a.modifiedTime || 0).getTime(),
      );
  }

  private async findLatestSnapshotFile(): Promise<drive_v3.Schema$File | null> {
    const snapshots = await this.listSnapshotFiles();
    return snapshots[0] || null;
  }

  /**
   * Downloads the sync file content.
   *
   * @returns File content as string, or null if file doesn't exist
   */
  async downloadSyncFile(): Promise<string | null> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    const fileId = await this.findSyncFile();
    if (!fileId) {
      this.log.debug('Sync file not found on Drive');
      return null;
    }

    try {
      const response = await this.drive.files.get(
        {
          fileId,
          alt: 'media',
        },
        {
          responseType: 'text',
        },
      );

      this.log.debug('Sync file downloaded successfully');
      return response.data as string;
    } catch (error) {
      this.log.error('Failed to download sync file:', error);
      throw error;
    }
  }

  /**
   * Uploads content to the sync file.
   * Creates the file if it doesn't exist.
   *
   * @param content - Content to upload
   * @returns File ID
   */
  async uploadSyncFile(content: string): Promise<string> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    const media = {
      mimeType: 'application/json',
      body: content,
    };

    let response: { data: drive_v3.Schema$File };

    if (this.versionHistoryMode === 'timestampedFiles') {
      const syncParent = await this.getSyncParent();

      this.log.debug('Creating new timestamped sync snapshot');
      response = await this.drive.files.create({
        requestBody: {
          name: this.createSnapshotFileName(),
          parents: syncParent.parents,
        },
        media,
        fields: 'id',
      });
      this.syncFileId = response.data.id || null;
      await this.cleanupOldSnapshotFiles();
    } else {
      const fileId = await this.findSyncFile();

      if (fileId) {
        // Update existing file
        this.log.debug('Updating existing sync file');
        response = await this.drive.files.update({
          fileId,
          media,
          fields: 'id',
        });
      } else {
        const syncParent = await this.getSyncParent();

        // Create new file
        this.log.debug('Creating new sync file');
        response = await this.drive.files.create({
          requestBody: {
            name: SYNC_FILE_NAME,
            parents: syncParent.parents,
          },
          media,
          fields: 'id',
        });
      }

      this.syncFileId = response.data.id || null;
    }
    this.log.info('Sync file uploaded successfully');

    return this.syncFileId || '';
  }

  private async cleanupOldSnapshotFiles(): Promise<void> {
    const snapshots = await this.listSnapshotFiles();
    const extraFiles = snapshots.slice(this.maxVersionFiles);

    for (const file of extraFiles) {
      if (!file.id) {
        continue;
      }

      try {
        if (this.storageMode === 'driveFolder') {
          await this.drive?.files.update({
            fileId: file.id,
            requestBody: { trashed: true },
            fields: 'id',
          });
        } else {
          await this.drive?.files.delete({ fileId: file.id });
        }
      } catch (error) {
        this.log.warn(`Failed to clean up old snapshot ${file.id}:`, error);
      }
    }
  }

  /**
   * Gets metadata about the sync file.
   *
   * @returns File metadata or null
   */
  async getSyncFileMetadata(): Promise<{ modifiedTime: Date } | null> {
    if (!this.drive) {
      return null;
    }

    const fileId = await this.findSyncFile();
    if (!fileId) {
      return null;
    }

    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'modifiedTime',
      });

      if (response.data.modifiedTime) {
        return {
          modifiedTime: new Date(response.data.modifiedTime),
        };
      }
    } catch (error) {
      this.log.warn('Failed to get sync file metadata:', error);
    }

    return null;
  }

  /**
   * Deletes the sync file from Drive.
   */
  async deleteSyncFile(): Promise<void> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    const fileId = await this.findSyncFile();
    if (fileId) {
      await this.drive.files.delete({
        fileId,
      });
      this.syncFileId = null;
      this.log.info('Sync file deleted');
    }
  }

  /**
   * Lists available versions of the sync file.
   */
  async listVersions(): Promise<DriveVersion[]> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    if (this.versionHistoryMode === 'timestampedFiles') {
      const snapshots = await this.listSnapshotFiles();
      return snapshots
        .filter((file) => file.id && file.modifiedTime)
        .map((file) => ({
          id: file.id as string,
          modifiedTime: file.modifiedTime as string,
          size: file.size,
          name: file.name || 'Sync snapshot',
          source: 'timestampedFiles',
        }));
    }

    const fileId = await this.findSyncFile();
    if (!fileId) {
      return [];
    }

    try {
      const response = await this.drive.revisions.list({
        fileId,
        fields: 'revisions(id, modifiedTime, size)',
        pageSize: 100,
      });
      return (response.data.revisions || [])
        .filter((revision) => revision.id && revision.modifiedTime)
        .map((revision) => ({
          id: revision.id as string,
          modifiedTime: revision.modifiedTime as string,
          size: revision.size,
          name: `Version ${new Date(
            revision.modifiedTime as string,
          ).toLocaleString()}`,
          source: 'googleRevisions',
        }));
    } catch (error) {
      this.log.error('Failed to list versions:', error);
      throw error;
    }
  }

  /**
   * Downloads a specific version of the sync file.
   */
  async downloadVersion(revisionId: string): Promise<string | null> {
    if (!this.drive) {
      throw new Error('Drive client not initialized');
    }

    if (this.versionHistoryMode === 'timestampedFiles') {
      try {
        const response = await this.drive.files.get(
          {
            fileId: revisionId,
            alt: 'media',
          },
          {
            responseType: 'text',
          },
        );
        return response.data as string;
      } catch (error) {
        this.log.error(`Failed to download snapshot ${revisionId}:`, error);
        throw error;
      }
    }

    const fileId = await this.findSyncFile();
    if (!fileId) {
      return null;
    }

    try {
      const response = await this.drive.revisions.get(
        {
          fileId,
          revisionId,
          alt: 'media',
        },
        {
          responseType: 'text',
        },
      );
      return response.data as string;
    } catch (error) {
      this.log.error(`Failed to download version ${revisionId}:`, error);
      throw error;
    }
  }

  /**
   * Checks if the service is connected and ready.
   */
  isConnected(): boolean {
    return this.drive !== null && this.connectionStatus.value.connected;
  }
}
