// SPDX-License-Identifier: Apache-2.0
import { PgBoss, type Job, type ConstructorOptions } from 'pg-boss';

export interface JobContext { id: string; name: string; idempotencyKey: string }
export type JobHandler<T extends object> = (data: T, context: JobContext) => Promise<object | void>;
function queueName(name: string) { if (!/^[a-z][a-z0-9_-]{0,49}$/u.test(name)) throw new Error('Use a lowercase queue name of at most 50 characters.'); }
function payload(value: object) { const json = JSON.stringify(value); if (!json || Buffer.byteLength(json) > 1_048_576) throw new Error('Job payload exceeds 1 MiB.'); }

/** Explicit lifecycle: constructing this runner neither connects nor migrates a database. */
export function createJobRunner(options: {
  connectionString: string; schema?: string; onError: (error: Error) => void;
  bossOptions?: Pick<ConstructorOptions, 'max' | 'application_name'>;
}) {
  const boss = new PgBoss({ ...options.bossOptions, connectionString: options.connectionString, schema: options.schema ?? 'pgboss' });
  boss.on('error', options.onError);
  let started = false;
  const registered = new Set<string>();
  const ready = (name: string) => { queueName(name); if (!started || !registered.has(name)) throw new Error('Start the runner and register this queue first.'); };
  return {
    async start() { await boss.start(); started = true; },
    async stop() { started = false; await boss.stop({ graceful: true, timeout: 10_000 }); },
    async register<T extends object>(name: string, parse: (value: unknown) => T, handler: JobHandler<T>, options: { concurrency?: number; expireSeconds?: number } = {}) {
      queueName(name); if (!started) throw new Error('Start the runner before registering queues.');
      if (registered.has(name)) throw new Error('Queue already registered by this runner.');
      const concurrency = options.concurrency ?? 2, expireSeconds = options.expireSeconds ?? 300;
      if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32 || !Number.isSafeInteger(expireSeconds) || expireSeconds < 1) throw new Error('Invalid worker limits.');
      await boss.createQueue(`${name}-dead`, { retryLimit: 0, deleteAfterSeconds: 0 });
      await boss.createQueue(name, { retryLimit: 5, retryDelay: 10, retryBackoff: true, expireInSeconds: expireSeconds, deadLetter: `${name}-dead` });
      await boss.work<T>(name, { batchSize: 1, localConcurrency: concurrency }, async (jobs: Job<T>[]) => {
        const job = jobs[0]; if (!job) return;
        return handler(parse(job.data), { id: job.id, name, idempotencyKey: `${name}:${job.id}` });
      });
      registered.add(name);
    },
    async enqueue(name: string, data: object, deduplicate?: { key: string; seconds: number }): Promise<string | null> {
      ready(name); payload(data);
      if (deduplicate && (!deduplicate.key || !Number.isSafeInteger(deduplicate.seconds) || deduplicate.seconds < 1)) throw new Error('Invalid deduplication window.');
      return boss.send(name, data, deduplicate ? { singletonKey: deduplicate.key, singletonSeconds: deduplicate.seconds } : {});
    },
    async schedule(name: string, cron: string, data: object, timezone = 'UTC') { ready(name); payload(data); await boss.schedule(name, cron, data, { tz: timezone }); },
    async unschedule(name: string) { ready(name); await boss.unschedule(name); },
  };
}
