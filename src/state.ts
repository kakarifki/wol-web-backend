import { prisma } from './db.js';

interface State {
  wakeRequested: boolean;
  lastWakeTime: Date | null;
  activeLogId: string | null;
  lastRouterPoll: Date | null;
  routerIp: string | null;
  totalPolls: number;
}

class WakeCoordinatorState {
  private state: State = {
    wakeRequested: false,
    lastWakeTime: null,
    activeLogId: null,
    lastRouterPoll: null,
    routerIp: null,
    totalPolls: 0,
  };

  private lastDbHeartbeatSync: number = 0;

  // Set wake requested state and log to DB
  async triggerWake(ip?: string, userAgent?: string): Promise<{ success: boolean; timestamp: Date; logId: string }> {
    const now = new Date();
    this.state.wakeRequested = true;
    this.state.lastWakeTime = now;

    try {
      const log = await prisma.wakeLog.create({
        data: {
          requestedAt: now,
          status: 'PENDING',
          ip: ip || 'unknown',
          userAgent: userAgent || 'unknown',
        },
      });
      this.state.activeLogId = log.id;
      return { success: true, timestamp: now, logId: log.id };
    } catch (err) {
      console.error('[DB Error] Failed to create WakeLog in DB:', err);
      // In-memory state is still active even if DB has temporary issue
      return { success: true, timestamp: now, logId: 'in-memory' };
    }
  }

  // Atomic state consumption by router
  async consumeWake(ip?: string): Promise<{ action: 'wake' | 'idle'; timestamp?: string }> {
    this.recordRouterPoll(ip);

    if (this.state.wakeRequested) {
      // Consume atomically
      this.state.wakeRequested = false;
      const consumedAt = new Date();
      const currentLogId = this.state.activeLogId;
      this.state.activeLogId = null;

      // Update DB asynchronously
      if (currentLogId && currentLogId !== 'in-memory') {
        prisma.wakeLog
          .update({
            where: { id: currentLogId },
            data: {
              status: 'CONSUMED',
              consumedAt,
            },
          })
          .catch((err) => console.error('[DB Error] Failed to update WakeLog consumed status:', err));
      } else {
        // Fallback: update most recent pending log
        prisma.wakeLog
          .updateMany({
            where: { status: 'PENDING' },
            data: {
              status: 'CONSUMED',
              consumedAt,
            },
          })
          .catch((err) => console.error('[DB Error] Failed to update pending logs:', err));
      }

      return {
        action: 'wake',
        timestamp: consumedAt.toISOString(),
      };
    }

    return { action: 'idle' };
  }

  // Record router heartbeat (throttled DB update to prevent DB spam every 3 seconds)
  recordRouterPoll(ip?: string) {
    const now = new Date();
    this.state.lastRouterPoll = now;
    if (ip) this.state.routerIp = ip;
    this.state.totalPolls++;

    const nowMs = now.getTime();
    // Sync to PostgreSQL at most once every 30 seconds
    if (nowMs - this.lastDbHeartbeatSync > 30000) {
      this.lastDbHeartbeatSync = nowMs;
      prisma.routerHeartbeat
        .upsert({
          where: { id: 1 },
          update: {
            lastSeen: now,
            ip: this.state.routerIp,
            totalPolls: { increment: 10 },
          },
          create: {
            id: 1,
            lastSeen: now,
            ip: this.state.routerIp,
            totalPolls: BigInt(1),
          },
        })
        .catch((err) => console.error('[DB Error] Failed to update RouterHeartbeat:', err));
    }
  }

  // Get status for web UI
  async getStatus() {
    const now = Date.now();
    const lastPollMs = this.state.lastRouterPoll ? this.state.lastRouterPoll.getTime() : null;
    const isRouterOnline = lastPollMs !== null && now - lastPollMs <= 12000; // 12s threshold (router polls every 3s)
    const secondsSinceLastPoll = lastPollMs !== null ? Math.round((now - lastPollMs) / 1000) : null;

    let recentLogs: any[] = [];
    try {
      recentLogs = await prisma.wakeLog.findMany({
        take: 5,
        orderBy: { requestedAt: 'desc' },
        select: {
          id: true,
          requestedAt: true,
          status: true,
          consumedAt: true,
        },
      });
    } catch (err) {
      console.warn('[DB Warning] Could not fetch recent logs:', err);
    }

    return {
      router: {
        online: isRouterOnline,
        lastPoll: this.state.lastRouterPoll ? this.state.lastRouterPoll.toISOString() : null,
        secondsSinceLastPoll,
        totalPolls: this.state.totalPolls,
      },
      wakeState: {
        pending: this.state.wakeRequested,
        lastWakeTime: this.state.lastWakeTime ? this.state.lastWakeTime.toISOString() : null,
      },
      recentLogs,
    };
  }
}

export const coordinator = new WakeCoordinatorState();

