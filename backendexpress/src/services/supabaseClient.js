'use strict';

/**
 * Supabase client service for server-side usage.
 * Reads configuration from environment variables:
 *  - SUPABASE_URL
 *  - SUPABASE_SERVICE_ROLE_KEY (preferred)
 * Also supports SUPABASE_KEY as a backward-compatible alias for the service role key.
 *
 * Exports:
 *  - getClient(): default client for public schema operations
 *  - getAuthClient(): explicit client bound to auth schema (preferred for auth.users queries)
 *  - isConfigured(): boolean indicating if env vars are present
 *  - healthCheck(): performs a minimal check against Supabase to validate connectivity and auth
 *  - refreshLatestUserReports(): triggers MV refresh via SQL API
 *  - authUsersExists(userId): robust existence check against auth.users(id), with REST fallback
 *  - getSupabaseDiagnostics(): returns non-sensitive diagnostics (host, keySource)
 *  - isValidUUID(v): validate UUID format
 *  - selfSchemaCheck(): internal check to verify both header-based and db.schema-based targeting work
 *
 * Notes:
 * - Uses the Service Role key exclusively for server-side operations to bypass RLS.
 * - supabase-js v2 supports db.schema for explicit schema binding; we prefer this for auth.users.
 */

const { createClient } = require('@supabase/supabase-js');

// Helper: parse host safely
function getUrlHost(url) {
  try {
    const u = new URL(url);
    return u.host || '';
  } catch {
    return '';
  }
}

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
  const looksJwt = typeof key === 'string' && key.startsWith('ey');
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
 * Internal: create base client with default public schema headers and auth token.
 * This client is used for public schema operations (public schema).
 */
// PUBLIC_INTERFACE
function makeDefaultClient(url, key) {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'X-Client-Info': 'weekly-insight-report-platform/backendexpress',
        'Accept-Profile': 'public',
        'Content-Profile': 'public',
      },
    },
  });
}

/**
 * Internal: create an explicit auth schema client using db.schema='auth' and required headers.
 * We keep Authorization and apikey set explicitly to service role for PostgREST.
 */
// PUBLIC_INTERFACE
function makeAuthClient(url, key) {
  return createClient(url, key, {
    db: {
      schema: 'auth',
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
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
  rpc() {
    throw new Error(
      '[supabase] Client is not configured. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
    );
  },
};

let cachedDefault = null;
let cachedAuth = null;
let cachedKey = null;
let cachedUrl = null;

/**
 * PUBLIC_INTERFACE
 * getClient
 * Returns the default Supabase client (public schema).
 */
// PUBLIC_INTERFACE
function getClient() {
  const { url, key } = getEnv();
  if (!url || !key) {
    throw new Error(
      '[supabase] Not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!cachedDefault || cachedUrl !== url || cachedKey !== key) {
    cachedDefault = makeDefaultClient(url, key);
    cachedAuth = makeAuthClient(url, key);
    cachedUrl = url;
    cachedKey = key;
  }
  return cachedDefault;
}

/**
 * PUBLIC_INTERFACE
 * getAuthClient
 * Returns a Supabase client that targets the auth schema explicitly.
 */
// PUBLIC_INTERFACE
function getAuthClient() {
  const { url, key } = getEnv();
  if (!url || !key) {
    throw new Error(
      '[supabase] Not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }
  if (!cachedAuth || cachedUrl !== url || cachedKey !== key) {
    cachedDefault = makeDefaultClient(url, key);
    cachedAuth = makeAuthClient(url, key);
    cachedUrl = url;
    cachedKey = key;
  }
  return cachedAuth;
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
 * getSupabaseDiagnostics
 * Returns non-sensitive diagnostics about the current Supabase configuration.
 */
// PUBLIC_INTERFACE
function getSupabaseDiagnostics() {
  const { url } = getEnv();
  return {
    host: getUrlHost(url || ''),
    keySource: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? 'SUPABASE_SERVICE_ROLE_KEY'
      : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : 'none'),
  };
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
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });

    const okish = resp.status >= 200 && resp.status < 500;
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
    // Ensure env/keys are valid and clients can be created
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
 * isValidUUID
 * Validate UUID string (v4 style). Trims input first.
 */
// PUBLIC_INTERFACE
function isValidUUID(v) {
  if (typeof v !== 'string') return false;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/**
 * PUBLIC_INTERFACE
 * authUsersExists
 * Robust existence check for a user id in auth.users schema.
 * Primary: supabase-js v2 authClient.from('users') with head+count exact
 * Fallback: REST call to /rest/v1/users with Accept-Profile: auth
 * Returns { exists: boolean, error?: string, count?: number, diag?: { host, schema: string, method: 'authClient'|'rest', primaryError?: string } }
 */
// PUBLIC_INTERFACE
async function authUsersExists(userId) {
  if (!isConfigured()) {
    return { exists: false, error: 'not_configured' };
  }
  if (!userId || typeof userId !== 'string') {
    return { exists: false, error: 'invalid_user_id' };
  }
  const trimmed = userId.trim();
  const { url, key } = getEnv();
  try {
    // First try the explicit auth client (db.schema('auth'))
    const svc = getAuthClient();
    const { count, error } = await svc
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .eq('id', trimmed)
      .limit(1);

    const baseDiag = {
      host: getSupabaseDiagnostics().host,
      schema: 'auth',
      path: 'auth.users',
      method: 'authClient',
    };

    if (error) {
      const primaryError = error.message || String(error);
      // Fallback: direct REST call with Accept-Profile: auth
      try {
        const resp = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(trimmed)}`, {
          method: 'GET',
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
            'Accept-Profile': 'auth',
          },
        });
        if (!resp.ok) {
          const text = await resp.text().catch(() => '');
          return {
            exists: false,
            error: `REST fallback error ${resp.status} ${resp.statusText}: ${text}`,
            diag: { ...baseDiag, method: 'rest', primaryError },
          };
        }
        const rows = await resp.json().catch(() => []);
        const cnt = Array.isArray(rows) ? rows.length : 0;
        return { exists: cnt > 0, count: cnt, diag: { ...baseDiag, method: 'rest', primaryError } };
      } catch (restErr) {
        return {
          exists: false,
          error: `authClient error: ${primaryError}; REST fallback exception: ${restErr && restErr.message ? restErr.message : String(restErr)}`,
          diag: { ...baseDiag, method: 'rest' },
        };
      }
    }
    return { exists: count === 1, count: typeof count === 'number' ? count : undefined, diag: baseDiag };
  } catch (err) {
    // If the auth client errors before query, attempt REST fallback directly
    try {
      const resp = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(trimmed)}`, {
        method: 'GET',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Accept-Profile': 'auth',
        },
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        return {
          exists: false,
          error: `authClient exception: ${err && err.message ? err.message : String(err)}; REST error ${resp.status} ${resp.statusText}: ${text}`,
          diag: { host: getSupabaseDiagnostics().host, schema: 'auth', path: 'auth.users', method: 'rest' },
        };
      }
      const rows = await resp.json().catch(() => []);
      const cnt = Array.isArray(rows) ? rows.length : 0;
      return { exists: cnt > 0, count: cnt, diag: { host: getSupabaseDiagnostics().host, schema: 'auth', path: 'auth.users', method: 'rest' } };
    } catch (restErr) {
      return {
        exists: false,
        error: `authClient exception: ${err && err.message ? err.message : String(err)}; REST fallback exception: ${restErr && restErr.message ? restErr.message : String(restErr)}`,
        diag: { host: getSupabaseDiagnostics().host, schema: 'auth', path: 'auth.users', method: 'rest' },
      };
    }
  }
}

/**
 * PUBLIC_INTERFACE
 * selfSchemaCheck
 * Performs two quick checks against auth.users:
 *  1) Header-based Accept-Profile via default client with .from('users')
 *  2) db.schema('auth') explicit client via getAuthClient()
 * Returns which approach succeeds for diagnostics. Does not leak secrets.
 */
// PUBLIC_INTERFACE
async function selfSchemaCheck(testUserId) {
  const result = {
    headerProfile: { ok: false, count: null, error: null },
    dbSchemaAuth: { ok: false, count: null, error: null },
  };
  if (!isConfigured()) return result;
  const { url, key } = getEnv();
  try {
    // Approach 1: Default client but force Accept-Profile=auth on a per-request basis via a temporary client
    const acceptProfileClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Accept-Profile': 'auth',
          'Content-Profile': 'auth',
          'X-Client-Info': 'weekly-insight-report-platform/backendexpress/selfcheck',
        },
      },
    });
    const { count: c1, error: e1 } = await acceptProfileClient
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .eq('id', testUserId)
      .limit(1);
    result.headerProfile.ok = !e1;
    result.headerProfile.count = typeof c1 === 'number' ? c1 : null;
    result.headerProfile.error = e1 ? (e1.message || String(e1)) : null;
  } catch (err1) {
    result.headerProfile.ok = false;
    result.headerProfile.error = err1 && err1.message ? err1.message : String(err1);
  }

  try {
    // Approach 2: Explicit auth client
    const svc = getAuthClient();
    const { count: c2, error: e2 } = await svc
      .from('users')
      .select('id', { head: true, count: 'exact' })
      .eq('id', testUserId)
      .limit(1);
    result.dbSchemaAuth.ok = !e2;
    result.dbSchemaAuth.count = typeof c2 === 'number' ? c2 : null;
    result.dbSchemaAuth.error = e2 ? (e2.message || String(e2)) : null;
  } catch (err2) {
    result.dbSchemaAuth.ok = false;
    result.dbSchemaAuth.error = err2 && err2.message ? err2.message : String(err2);
  }

  return result;
}

module.exports = {
  getClient,
  getAuthClient,
  isConfigured,
  healthCheck,
  refreshLatestUserReports,
  authUsersExists,
  getSupabaseDiagnostics,
  isValidUUID,
  selfSchemaCheck,
  // Expose a safe reference: callers that import and try .from without checking will get a clear error.
  clientOrDisabled: () => (isConfigured() ? getClient() : disabledClient),
};
