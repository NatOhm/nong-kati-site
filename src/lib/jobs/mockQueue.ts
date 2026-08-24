/**
 * Mock Job Queue — Simulates BullMQ for M4 without Redis/Railway worker.
 * 16-devops.md §5 — In production, BullMQ runs on Railway worker service.
 *
 * Queues:
 *   delivery    — Code delivery jobs (HIGH priority, 3× retry, 2s/4s/8s backoff)
 *   inventory   — Reservation sweep (5min), expiry sweep (15min)
 *   notification — Email/LINE delivery (MEDIUM priority, 3× retry)
 *
 * For M4 mock: jobs execute inline (synchronously) for testing.
 * In production: BullMQ with Redis backend on Railway worker.
 */

export interface Job {
  id: string;
  queue: string;
  name: string;
  data: Record<string, unknown>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retries: number;
  maxRetries: number;
  createdAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
}

type JobHandler = (data: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();
const jobs: Job[] = [];

/**
 * Register a job handler for a given job name.
 */
export function registerJobHandler(name: string, handler: JobHandler): void {
  handlers.set(name, handler);
}

/**
 * Enqueue a job for immediate (mock) processing.
 */
export async function enqueueJob(
  queue: string,
  name: string,
  data: Record<string, unknown>,
  options: { priority?: 'HIGH' | 'MEDIUM' | 'LOW'; maxRetries?: number } = {},
): Promise<Job> {
  const job: Job = {
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queue,
    name,
    data,
    status: 'pending',
    retries: 0,
    maxRetries: options.maxRetries ?? 3,
    createdAt: new Date(),
  };

  jobs.push(job);

  // Process immediately in mock mode
  const handler = handlers.get(name);
  if (handler) {
    job.status = 'processing';
    try {
      await handler(data);
      job.status = 'completed';
      job.completedAt = new Date();
    } catch (err) {
      job.status = 'failed';
      job.failedAt = new Date();
      job.error = err instanceof Error ? err.message : String(err);

      // Retry logic
      if (job.retries < job.maxRetries) {
        job.retries++;
        job.status = 'pending';
        // In real BullMQ, this would use exponential backoff
        // For mock, re-process immediately
        try {
          await handler(data);
          job.status = 'completed';
          job.completedAt = new Date();
        } catch (retryErr) {
          job.status = 'failed';
          job.failedAt = new Date();
          job.error = retryErr instanceof Error ? retryErr.message : String(retryErr);
        }
      }
    }
  } else {
    // No handler registered — mark as completed (no-op)
    job.status = 'completed';
    job.completedAt = new Date();
  }

  return job;
}

/**
 * Get all jobs (for testing/debugging).
 */
export function getJobs(): Job[] {
  return [...jobs];
}

/**
 * Get jobs by queue.
 */
export function getJobsByQueue(queue: string): Job[] {
  return jobs.filter((j) => j.queue === queue);
}

/**
 * Clear all jobs (for testing).
 */
export function clearJobs(): void {
  jobs.length = 0;
}
