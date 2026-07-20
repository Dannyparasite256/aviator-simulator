import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private connected = false;
  private disabled = false;
  private lastErrorLog = 0;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableReadyCheck: true,
      retryStrategy: (times) => {
        // After a few failed attempts, stop reconnect spam for local dev without Redis
        if (times > 3) {
          this.disabled = true;
          this.connected = false;
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });
    this.client.on('connect', () => {
      this.connected = true;
      this.disabled = false;
      this.logger.log('Redis connected');
    });
    this.client.on('error', (err) => {
      this.connected = false;
      const now = Date.now();
      if (now - this.lastErrorLog > 30_000) {
        this.lastErrorLog = now;
        this.logger.warn(`Redis unavailable (optional): ${err.message || 'connection failed'}`);
      }
    });
    void this.client.connect().catch((err: Error) => {
      this.disabled = true;
      this.logger.warn(`Redis connect failed (continuing without): ${err.message}`);
    });
  }

  get isConnected(): boolean {
    return this.connected;
  }

  async get(key: string): Promise<string | null> {
    if (this.disabled) return null;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.disabled) return;
    try {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
    } catch {
      this.disabled = true;
    }
  }

  async del(key: string): Promise<void> {
    if (this.disabled) return;
    try {
      await this.client.del(key);
    } catch {
      /* ignore */
    }
  }

  async incr(key: string): Promise<number> {
    if (this.disabled) return 0;
    try {
      return await this.client.incr(key);
    } catch {
      return 0;
    }
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
