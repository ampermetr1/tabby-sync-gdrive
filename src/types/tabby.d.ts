/**
 * Type declarations for Tabby modules
 * These stub out the Tabby APIs we depend on
 */

// tabby-core types
declare module 'tabby-core' {
  import { Observable } from 'rxjs';

  export abstract class ConfigProvider {
    defaults: Record<string, unknown>;
    platformDefaults: Record<string, unknown>;
  }

  export interface ConfigProxy {
    [key: string]: unknown;
  }

  export class ConfigService {
    store: ConfigProxy;
    restartRequested: boolean;
    ready$: Observable<boolean>;
    changed$: Observable<void>;
    save(): Promise<void>;
    readRaw(): Promise<string>;
    writeRaw(data: string): Promise<void>;
    requestRestart(): void;
  }

  export class Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
    debug(...args: unknown[]): void;
  }

  export class LogService {
    create(name: string): Logger;
  }

  export class PlatformService {
    openExternal(url: string): void;
    loadConfig(): Promise<string | null>;
    saveConfig(data: string): Promise<void>;
  }

  export class HostAppService {
    platform: string;
    configPlatform: string;
    configChangeBroadcast$: Observable<void>;
  }

  export function configMerge(a: unknown, b: unknown): unknown;
}

// tabby-settings types
declare module 'tabby-settings' {
  import { Type } from '@angular/core';

  export abstract class SettingsTabProvider {
    id: string;
    title: string;
    icon: string;
    abstract getComponentType(): Type<unknown>;
  }
}

declare module 'electron' {
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(value: string): Buffer;
    decryptString(value: Buffer): string;
  };
}
