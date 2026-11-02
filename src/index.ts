import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import dotenv from 'dotenv';
import { coordinator } from './state.js';

dotenv.config();

const app = new Hono();

const PORT = Number(process.env.PORT) || 3000;
const WOL_TOKEN = process.env.WOL_TOKEN || 'wol-pc-kakarifki-12';
const WEB_PASSWORD = process.env.WEB_PASSWORD || process.env.WEB_PIN || 'Komputer-Kaka-12';

// CORS configuration for frontend
app.use('*', async (c, next) => {
  const rawOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : [
        'https://wol-app.kakarifki.web.id',
        'https://wakeonlan.kakarifki.web.id',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
      ];

  // Strip trailing slashes and spaces from allowed origins
  const allowedOrigins = rawOrigins
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return '*';
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (
        allowedOrigins.includes(cleanOrigin) ||
        allowedOrigins.includes('*') ||
        cleanOrigin.endsWith('.kakarifki.web.id')
      ) {
        return origin;
      }
      return allowedOrigins[0] || '*';
    },
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-web-pin',
      'Cache-Control',
      'cache-control',
      'Pragma',
      'pragma',
      'X-Requested-With',
    ],
    exposeHeaders: ['Content-Length'],
    maxAge: 86400,
    credentials: true,
  });

  return corsMiddleware(c, next);
});

// Explicit OPTIONS preflight handler
app.options('*', (c) => c.body(null, 204));

// Request logging
app.use('*', logger());

// Health Check
app.get('/health', (c) => {
  return c.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Router polling endpoint (Called every 3s by OpenWrt /usr/bin/wol-poller.sh)
app.get('/api/poll', async (c) => {
  const token = c.req.query('token');

  // Validate polling token
  if (!token || token !== WOL_TOKEN) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const clientIp =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    'router';

  const response = await coordinator.consumeWake(clientIp);
  return c.json(response);
});

// Web Client Wake Trigger (Called when user clicks "Nyalakan PC")
app.post('/api/wake', async (c) => {
  let body: { pin?: string; password?: string } = {};

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, message: 'Invalid JSON payload' }, 400);
  }

  const submittedKey = body.password || body.pin;

  // Validate Web Password / PIN
  if (!submittedKey || submittedKey !== WEB_PASSWORD) {
    return c.json(
      {
        success: false,
        message: 'Password / PIN salah!',
      },
      403
    );
  }

  const clientIp =
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for') ||
    c.req.header('x-real-ip') ||
    'web-client';

  const userAgent = c.req.header('user-agent') || 'unknown';

  const result = await coordinator.triggerWake(clientIp, userAgent);

  return c.json({
    success: true,
    message: 'Sinyal bangun berhasil dimasukkan ke antrean router!',
    timestamp: result.timestamp.toISOString(),
    logId: result.logId,
  });
});

// Web Client Status & Live Heartbeat Dashboard
app.get('/api/status', async (c) => {
  const status = await coordinator.getStatus();
  return c.json({
    success: true,
    data: status,
  });
});

// Fallback route
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

console.log(`[WOL Coordinator] Server running on port ${PORT}`);

serve({
  fetch: app.fetch,
  port: PORT,
});

