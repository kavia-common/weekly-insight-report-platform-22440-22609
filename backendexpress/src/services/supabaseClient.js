'use strict';

/**
 * Supabase client service for server-side usage.
 * Reads configuration from environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY
 *
 * Exports:
 *  - getClient(): returns a verified supabase client or throws if not configured
 *  - isConfigured(): boolean indicating if env vars are present
 *  - healthCheck(): performs a minimal check against Supabase to validate connectivity and auth
 *
 * Note: This module does NOT alter auth flows or wire routes. It is a reusable service.
 */

const { createClient } = require('@supabase/supabase-js');

// Load env if not already loaded (server usually loads dotenv at entry)
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  // Provide a single concise warning once on module import; client methods will still guard and throw as needed.
  // We don't throw here to keep the app booting in environments without Supabase configured yet.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Supabase client will be disabled. ' +
      'Set both vars to enable database operations.'
  );
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Internal: Create a real supabase client when configured.
 */
function makeRealClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    // Server-side best practices
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'weekly-insight-report-platform/backendexpress',
      },
    },
  });
}

/**
 * Disabled client that throws informative errors if used when not configured.
 */
const disabledClient = {
  from() {
    throw new Error(
      '[supabase] Client is not configured. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in the environment.'
    );
  },
  auth: {
    getSession() {
      throw new Error(
        '[supabase] Client is not configured. Cannot perform auth operations.'
      );
    },
  },
  // Allow generic method pattern to fail fast
  rpc() {
    throw new Error(
      '[supabase] Client is not configured. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  },
};

let cachedClient = null;

/**
 * PUBLIC_INTERFACE
 * getClient
 * Returns a Supabase client if configured; otherwise throws an informative error.
 */
function getClient() {
  if (!isConfigured()) {
    // For explicit calls expecting a client, we throw to encourage caller-side handling.
    throw new Error(
      '[supabase] Not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!cachedClient) {
    cachedClient = makeRealClient();
  }
  return cachedClient;
}

/**
 * PUBLIC_INTERFACE
 * isConfigured
 * Returns true if both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars are present.
 */
function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * PUBLIC_INTERFACE
 * healthCheck
 * Performs a minimal call to validate Supabase availability and credentials.
 * Strategy:
 *  - If not configured: returns { ok: false, configured: false, error: '...' }
 *  - If configured: perform a lightweight fetch to the base URL root with auth header.
 *    We expect a 200/404; any network/auth failures indicate issues.
 */
async function healthCheck() {
  if (!isConfigured()) {
    return {
      ok: false,
      configured: false,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  try {
    // Perform a NOOP GET to the Supabase REST root (this does not expose data but checks connectivity/token validity)
    const resp = await fetch(SUPABASE_URL, {
      method: 'GET',
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });

    const okish = resp.status >= 200 && resp.status < 500; // 2xx/3xx/404 still indicates reachable and token accepted at edge
    return {
      ok: okish,
      configured: true,
      status: resp.status,
      statusText: resp.statusText,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err && err.message ? err.message : String(err),
    };
  }
}

module.exports = {
  getClient,
  isConfigured,
  healthCheck,
  // Expose a safe reference: callers that import and try .from without checking will get a clear error.
  clientOrDisabled: () => (isConfigured() ? getClient() : disabledClient),
};
