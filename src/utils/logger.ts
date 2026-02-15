/**
 * Universal logging utility with levels and context support
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
  json?: boolean;
}

export class Logger {
  private level: LogLevel;
  private prefix: string;
  private json: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.prefix = options.prefix ?? '';
    this.json = options.json ?? false;

    // Browser: check VITE_DEBUG flag
    if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_DEBUG === 'true' && this.level > LogLevel.DEBUG) {
      this.level = LogLevel.DEBUG;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, meta?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = this.prefix ? `[${this.prefix}] ` : '';

    if (this.json) {
      return JSON.stringify({
        timestamp,
        level,
        prefix: this.prefix || undefined,
        message,
        ...(meta && typeof meta === 'object' ? meta : { value: meta }),
      });
    }

    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${prefix}${level}: ${message}${metaStr}`;
  }

  debug(message: string, meta?: unknown): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage('DEBUG', message, meta);
      console.debug(formatted);
    }
  }

  info(message: string, meta?: unknown): void {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage('INFO', message, meta);
      console.log(formatted);
    }
  }

  warn(message: string, meta?: unknown): void {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage('WARN', message, meta);
      console.warn(formatted);
    }
  }

  error(message: string, meta?: unknown): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formatted = this.formatMessage('ERROR', message, meta);
      console.error(formatted);
    }
  }

  child(prefix: string): Logger {
    return new Logger({
      level: this.level,
      prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
      json: this.json,
    });
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

/**
 * Create a logger instance with default settings
 */
export function createLogger(options?: LoggerOptions): Logger {
  // Universal environment detection
  const isBrowser = typeof import.meta !== 'undefined';
  const isDev = isBrowser 
    ? (import.meta.env.DEV ?? true)
    : (process.env.NODE_ENV !== 'production');
  
  const defaultLevel = isDev ? LogLevel.DEBUG : LogLevel.INFO;

  return new Logger({
    level: options?.level ?? defaultLevel,
    prefix: options?.prefix,
    json: options?.json ?? !isDev,
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger({ prefix: 'wisp' });
