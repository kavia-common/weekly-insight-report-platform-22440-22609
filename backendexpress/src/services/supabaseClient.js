'use strict';

/**
 * Supabase client service for server-side usage.
 * Reads configuration from environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (preferred)
 * Also supports SUPABASE_KEY as a backward-compatible alias for the service role key.
 *
 * Exports:
 *  - getClient(): returns a verified supabase client or throws if not configured
 *  - isConfigured(): boolean indicating if env vars are present
 *  - healthCheck(): performs a minimal check against Supabase to validate connectivity and auth
 *  - refreshLatestUserReports(): triggers MV refresh via SQL API
 *
 * Note: This module does NOT alter auth flows or wire routes. It is a reusable service.
 */

const { createClient } = require('@supabase/supabase-js');

// Resolve env on-demand to avoid stale values if dotenv loaded later
function getEnv() {
  const url = process.env.SUPABASE_URL;
  // Prefer SERVICE_ROLE_KEY, but accept SUPABASE_KEY as alias for backward compatibility
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '';

  if (process.env.SUPABASE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // eslint-disable-next-line no-console
    console.warn(
      '[supabase] Detected SUPABASE_KEY. Please migrate to SUPABASE_SERVICE_ROLE_KEY. Using it as a fallback.'
    );
  }

  return { url, key };
}

// Single import-time notice to help operators if missing
if (!process.env.SUPABASE_URL || !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Supabase client will be disabled until configured.'
  );
} else {
  // Extra startup diagnostics: identify which key type is being used (service vs anon heuristic)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const keyPrefix = typeof key === 'string' ? key.split('.')[0] : '';
  const looksAnon = typeof key === 'string' && key.startsWith('ey'); // anon/service are both JWTs; we hint only
  // eslint-disable-next-line no-console
  console.log(
    `[supabase] Configuration detected. Using key from ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_KEY'}. JWT-like: ${looksAnon ? 'yes' : 'no'}; prefix: ${keyPrefix ? keyPrefix.slice(0, 4) + '...' : 'n/a'} (value not logged).`
  );
}

/**
 * Internal: Create a real supabase client when configured.
 */
function makeRealClient(url, key) {
  return createClient(url, key, {
    // Server-side best practices
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      // IMPORTANT: we never set a per-request user JWT on this client;
      // doing so would downgrade privileges and trigger RLS unexpectedly.
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
let cachedKey = null;
let cachedUrl = null;

/**
 * PUBLIC_INTERFACE
 * getClient
 * Returns a Supabase client if configured; otherwise throws an informative error.
 */
/** PUBLIC_INTERFACE */
function getClient() {
  const { url, key } = getEnv();
  if (!url || !key) {
    throw new Error(
      '[supabase] Not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  // Rebuild client if env changed since last creation
  if (!cachedClient || cachedUrl !== url || cachedKey !== key) {
    cachedClient = makeRealClient(url, key);
    cachedUrl = url;
    cachedKey = key;
  }
  return cachedClient;
}

/**
 * PUBLIC_INTERFACE
 * isConfigured
 * Returns true if both SUPABASE_URL and a service role key env var are present.
 */
/** PUBLIC_INTERFACE */
function isConfigured() {
  const { url, key } = getEnv();
  return Boolean(url && key);
}

/**
 * PUBLIC_INTERFACE
 * healthCheck
 * Performs a minimal call to validate Supabase availability and credentials.
 * Strategy:
 *  - If not configured: returns { ok: false, configured: false, error: '...' }
 *  - If configured: perform a lightweight fetch to the base URL root with auth header.
 *    We expect a 200/404; any network/auth failures indicate issues.
 * Adds diag: keySource to show which env var provided the key.
 */
/** PUBLIC_INTERFACE */
async function healthCheck() {
  const { url, key } = getEnv();
  const keySource = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : 'none');
  if (!url || !key) {
    return {
      ok: false,
      configured: false,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      keySource,
    };
  }
  try {
    // Perform a NOOP GET to the Supabase REST root (this checks connectivity/token acceptance at edge)
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    const okish = resp.status >= 200 && resp.status < 500; // 2xx/3xx/404 indicate reachable edge
    return {
      ok: okish,
      configured: true,
      status: resp.status,
      statusText: resp.statusText,
      keySource,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      error: err && err.message ? err.message : String(err),
      keySource,
    };
  }
}

/**
 * PUBLIC_INTERFACE
 * refreshLatestUserReports
 * Refreshes the materialized view public.latest_user_reports.
 * Tries CONCURRENTLY first (requires a unique index on the MV), and falls back to non-concurrent
 * if CONCURRENTLY is not supported. Returns an object indicating success/failure and whether
 * concurrency was used.
 *
 * Note:
 * - Requires service role key.
 * - Non-concurrent refresh may lock the MV for reads/writes until completion.
 *
 * @param {{concurrent?: boolean}} [options] - Whether to attempt concurrent refresh first (default true).
 * @returns {Promise<{success: boolean, concurrentUsed?: boolean, error?: string}>}
 */
/** PUBLIC_INTERFACE */
async function refreshLatestUserReports({ concurrent = true } = {}) {
  const { url, key } = getEnv();
  if (!url || !key) {
    return {
      success: false,
      concurrentUsed: false,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  const sqlConcurrent =
    'REFRESH MATERIALIZED VIEW CONCURRENTLY public.latest_user_reports;';
  const sqlNonConcurrent = 'REFRESH MATERIALIZED VIEW public.latest_user_reports;';
  try {
    // Ensure env/keys are valid and client can be created
    // eslint-disable-next-line no-unused-vars
    const client = getClient();

    const tryExecSql = async (sql) => {
      const endpoint = `${url}/pg/sql`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: sql }),
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new Error(`SQL endpoint error ${resp.status} ${resp.statusText}: ${text}`);
      }
      return true;
    };

    if (concurrent) {
      try {
        await tryExecSql(sqlConcurrent);
        return { success: true, concurrentUsed: true };
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        const canFallback =
          /concurrently/i.test(msg) ||
          /unique index/i.test(msg) ||
          /cannot refresh/i.test(msg) ||
          /could not create unique index/i.test(msg);
        if (!canFallback) {
          return { success: false, concurrentUsed: true, error: msg };
        }
        try {
          await tryExecSql(sqlNonConcurrent);
          return { success: true, concurrentUsed: false };
        } catch (err2) {
          return {
            success: false,
            concurrentUsed: false,
            error: err2 && err2.message ? err2.message : String(err2),
          };
        }
      }
    } else {
      await tryExecSql(sqlNonConcurrent);
      return { success: true, concurrentUsed: false };
    }
  } catch (errOuter) {
    return {
      success: false,
      concurrentUsed: false,
      error: errOuter && errOuter.message ? errOuter.message : String(errOuter),
    };
  }
}

module.exports = {
  getClient,
  isConfigured,
  healthCheck,
  refreshLatestUserReports,
  // Expose a safe reference: callers that import and try .from without checking will get a clear error.
  clientOrDisabled: () => (isConfigured() ? getClient() : disabledClient),
};
