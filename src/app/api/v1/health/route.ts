/**
 * Health Check Endpoint — GET /api/v1/health
 * Returns 200 if the application is healthy.
 * Used by monitoring, load balancers, and post-deploy smoke tests.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database: 'ok' | 'error';
    uptime: number;
  };
}

export async function GET(): Promise<NextResponse> {
  const startTime = Date.now();
  
  const health: HealthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env['npm_package_version'] ?? '0.1.0',
    checks: {
      database: 'ok',
      uptime: process.uptime(),
    },
  };

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    health.status = 'unhealthy';
    health.checks.database = 'error';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  
  return NextResponse.json(health, { 
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Response-Time': `${Date.now() - startTime}ms`,
    },
  });
}
