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
 *  - authUsersExists(userId): robust existence check against auth.users(id), schema-targeted
 *
 * Notes:
 * - Uses the Service Role key exclusively for server-side operations to bypass RLS.
 * - Adds global schema targeting support with supabase-js v2 via experimental schema() override.
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
if (
  !process.env.SUPABASE_URL ||
  !(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY)
) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Supabase client will be disabled until configured.'
  );
} else {
  // Extra startup diagnostics: identify which key type is being used (service vs anon heuristic)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  const keyPrefix = typeof key === 'string' ? key.split('.')[0] : '';
  const looksJwt = typeof key === 'string' && key.startsWith('ey'); // anon/service are both JWTs; we hint only
  // eslint-disable-next-line no-console
  console.log(
    `[supabase] Configuration detected. Using key from ${
      process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_KEY'
    }. JWT-like: ${looksJwt ? 'yes' : 'no'}; prefix: ${
      keyPrefix ? keyPrefix.slice(0, 4) + '...' : 'n/a'
    } (value not logged).`
  );
}

/**
 * Internal: Create a real supabase client when configured.
 * We attach a convenience .schema(name) method to select a schema by setting the PostgREST profile header.
 * This avoids relying on table name prefixes like 'auth.users'.
 */
function makeRealClient(url, key) {
  const client = createClient(url, key, {
    // Server-side best practices
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Client-Info': 'weekly-insight-report-platform/backendexpress',
        // Explicitly set default schema to 'public' via PostgREST profile header
        // We'll override when targeting auth schema using client.schema('auth')
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    },
  });

  /**
   * PUBLIC_INTERFACE
   * schema(name)
   * Returns a shallow wrapper that sends Accept-Profile/Content-Profile headers for a specific schema
   * allowing .from('users') to target that schema.
   */
  // PUBLIC_INTERFACE
  client.schema = function schema(name) {
    const baseHeaders = client.storage && client.storage.headers ? client.storage.headers : {};
    const schemaHeaders = {
      ...baseHeaders,
      'Accept-Profile': name,
      'Content-Profile': name,
    };
    // Create a new client instance that reuses the same URL/key but with overridden headers.
    // We avoid persisting sessions or other differences.
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: {
          ...schemaHeaders,
          'X-Client-Info': 'weekly-insight-report-platform/backendexpress',
        },
      },
    });
  };

  return client;
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
  rpc() {
    throw new Error(
      '[supabase] Client is not configured. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  },
  schema() {
    throw new Error(
      '[supabase] Client is not configured. Schema targeting unavailable.'
    );
  }
};

let cachedClient = null;
let cachedKey = null;
let cachedUrl = null;

/**
 * PUBLIC_INTERFACE
 * getClient
 * Returns an initialized Supabase client using service role credentials.
 * Throws an informative error if not configured.
 */
// PUBLIC_INTERFACE
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
 * Indicates whether SUPABASE_URL and a service key are present.
 * Returns boolean.
 */
// PUBLIC_INTERFACE
function isConfigured() {
  const { url, key } = getEnv();
  return Boolean(url && key);
}

/**
 * PUBLIC_INTERFACE
 * healthCheck
 * Lightweight connectivity check to Supabase edge using provided credentials.
 * Does not leak secrets; returns status booleans and minimal diagnostics.
 */
// PUBLIC_INTERFACE
async function healthCheck() {
  const { url, key } = getEnv();
  const keySource = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'SUPABASE_SERVICE_ROLE_KEY'
    : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : 'none');
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
 * Attempts to refresh public.latest_user_reports materialized view via SQL API.
 * @param {{concurrent?: boolean}} options
 * @returns {Promise<{success: boolean, concurrentUsed?: boolean, error?: string}>}
 */
// PUBLIC_INTERFACE
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

/**
 * PUBLIC_INTERFACE
 * authUsersExists
 * Robust existence check for a user id in auth.users schema.
 * Uses head+count exact query against schema('auth').from('users') to avoid selecting data.
 * Returns { exists: boolean, error?: string, count?: number }
 */
// PUBLIC_INTERFACE
async function authUsersExists(userId) {
  if (!isConfigured()) {
    return { exists: false, error: 'not_configured' };
  }
  if (!userId || typeof userId !== 'string') {
    return { exists: false, error: 'invalid_user_id' };
  }
  try {
    const base = getClient();
    const svc = base.schema('auth');
    const { count, error } = await svc
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .eq('id', userId)
      .limit(1);

    if (error) {
      return { exists: false, error: error.message || String(error) };
    }
    return { exists: count === 1, count: typeof count === 'number' ? count : undefined };
  } catch (err) {
    return { exists: false, error: err && err.message ? err.message : String(err) };
  }
}

module.exports = {
  getClient,
  isConfigured,
  healthCheck,
  refreshLatestUserReports,
  authUsersExists,
  // Expose a safe reference: callers that import and try .from without checking will get a clear error.
  clientOrDisabled: () => (isConfigured() ? getClient() : disabledClient),
};
