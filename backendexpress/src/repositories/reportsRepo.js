'use strict';

/**
 * Weekly Reports repository backed by Supabase.
 * Table: weekly_reports
 *
 * Expected columns (minimal):
 *  - id: uuid (default)
 *  - user_id: uuid (FK to auth.users(id))
 *  - week_of: date (ISO YYYY-MM-DD)
 *  - progress: text
 *  - blockers: text
 *  - plans: text
 *  - created_at: timestamp (default now)
 *  - updated_at: timestamp (default now, updated via trigger or app)
 *
 * All methods return objects of shape:
 *  - { ok: true, data, ... } on success
 *  - { ok: false, status?, error, diag? } on error
 *
 * Missing table or not-configured Supabase should be handled gracefully so API
 * can return 503 with a clear message.
 */

const supabaseService = require('../services/supabaseClient');

// Background refresh helper: non-blocking best effort
function triggerRefreshLatestMV(preferConcurrent = true) {
  if (!supabaseService.isConfigured() || typeof supabaseService.refreshLatestUserReports !== 'function') {
    return;
  }
  Promise.resolve()
    .then(() => supabaseService.refreshLatestUserReports(preferConcurrent))
    .catch(() => {});
}

const TABLE = 'weekly_reports';

// Map common Supabase error codes/messages to user-friendly messages/status.
function normalizeDbError(err) {
  const message = (err && (err.message || err.msg)) ? (err.message || err.msg) : String(err);
  if (/relation .* does not exist/i.test(message) || /table .* does not exist/i.test(message)) {
    return { status: 503, error: 'Database table "weekly_reports" is missing. Please run migrations.' };
  }
  if (/row-level security/i.test(message) || /violates row-level security/i.test(message)) {
    return {
      status: 500,
      error: `${message}. Hint: ensure the backend uses SUPABASE_SERVICE_ROLE_KEY (service role) and not the anon key. See README for RLS guidance.`,
    };
  }
  const enriched = { status: 500, error: message };
  if (err && typeof err === 'object') {
    if (err.code) enriched.code = err.code;
    if (err.hint) enriched.hint = err.hint;
    if (err.details) enriched.details = err.details;
  }
  return enriched;
}

// Sanitize string inputs
function sanitizeString(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') return String(val);
  return val.trim();
}

// Validate ISO date (YYYY-MM-DD) for weekOf
function isISODate(val) {
  if (typeof val !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(val);
}

// Helper to get a known service-role client (never request-scoped)
function getServiceClient() {
  return supabaseService.getClient();
}

// Optional diagnostics toggle (set DIAGNOSTICS=1 in env to enable richer logs/returns)
const DIAGNOSTICS = process.env.DIAGNOSTICS === '1';

/**
 * Ensures user existence checks target auth.users explicitly using schema('auth')
 * with head+count exact, and that no controller/route attempts to coerce
 * non-UUID path fragments (like 'diagnostics') into UUIDs.
 */
// PUBLIC_INTERFACE
async function createReport({ userId, weekOf, content, blockers, plans }) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  const trimmedUserId = sanitizeString(userId);
  if (!trimmedUserId || !isISODate(weekOf)) {
    return { ok: false, status: 400, error: 'Invalid payload: userId (string) and weekOf (YYYY-MM-DD) are required.' };
  }
  // UUID validation + trimming to avoid hidden whitespace issues
  if (!supabaseService.isValidUUID(trimmedUserId)) {
    return { ok: false, status: 400, error: 'userId must be a valid UUID.' };
  }

  const row = {
    user_id: trimmedUserId,
    week_of: weekOf,
    progress: sanitizeString(content) || '',
    blockers: sanitizeString(blockers) || '',
    plans: sanitizeString(plans) || '',
  };

  try {
    const client = getServiceClient();
    // Preflight table existence
    const preflight = await client.from(TABLE).select('id').limit(1);
    if (preflight.error) {
      const norm = normalizeDbError(preflight.error);
      return { ok: false, status: norm.status, error: norm.error, ...(DIAGNOSTICS ? { diag: { stage: 'preflight_select', ...norm } } : {}) };
    }

    // Verify user exists in auth.users with schema-qualified existence check; include diagnostics
    const { exists, count, error: existErr, diag: existDiag } = await supabaseService.authUsersExists(trimmedUserId);
    if (existErr) {
      // Include diagnostics to help operators (host, schema, path)
      return {
        ok: false,
        status: 400,
        error: `Failed to verify user in auth.users: ${existErr}`,
        ...(DIAGNOSTICS ? { diag: { existenceSource: 'auth.users', count, error: existErr, ...existDiag } } : {}),
      };
    }
    if (!exists) {
      // Temporarily include count and error details when not found to surface via POST /api/reports
      return {
        ok: false,
        status: 400,
        error: 'User not found in auth.users for provided userId. Ensure the user exists in Supabase Auth and try again.',
        ...(DIAGNOSTICS ? { diag: { existenceSource: 'auth.users', count, error: existErr || null, ...existDiag } } : {}),
      };
    }

    // Attempt insert using the same service-role client instance
    const { data, error } = await client.from(TABLE).insert(row).select('*').single();
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error, ...(DIAGNOSTICS ? { diag: { stage: 'insert', ...norm } } : {}) };
    }

    // Trigger MV refresh (best effort)
    triggerRefreshLatestMV(true);
    return { ok: true, data, ...(DIAGNOSTICS ? { diag: { existence: { count, ...existDiag } } } : {}) };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function getReportById(id) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  if (!id) return { ok: false, status: 400, error: 'Report id is required.' };
  try {
    const client = getServiceClient();
    const { data, error } = await client.from(TABLE).select('*').eq('id', id).single();
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return { ok: true, data };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function listReportsByUser({ userId, page = 1, pageSize = 20 }) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  if (!userId) return { ok: false, status: 400, error: 'userId is required.' };
  const p = Number(page) || 1;
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  try {
    const client = getServiceClient();
    const { data, error, count } = await client
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', sanitizeString(userId))
      .order('week_of', { ascending: false })
      .range(from, to);

    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return { ok: true, data: data || [], page: p, pageSize: ps, total: typeof count === 'number' ? count : undefined };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function updateReport(id, patch) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  if (!id || !patch || typeof patch !== 'object') {
    return { ok: false, status: 400, error: 'id and patch object are required.' };
  }
  const payload = {};
  if (patch.weekOf !== undefined) {
    if (!isISODate(patch.weekOf)) return { ok: false, status: 400, error: 'weekOf must be YYYY-MM-DD.' };
    payload.week_of = patch.weekOf;
  }
  if (patch.content !== undefined) payload.progress = sanitizeString(patch.content);
  if (patch.blockers !== undefined) payload.blockers = sanitizeString(patch.blockers);
  if (patch.plans !== undefined) payload.plans = sanitizeString(patch.plans);
  payload.updated_at = new Date().toISOString();

  try {
    const client = getServiceClient();
    const { data, error } = await client.from(TABLE).update(payload).eq('id', id).select('*').single();
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    triggerRefreshLatestMV(true);
    return { ok: true, data };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function deleteReport(id) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  if (!id) return { ok: false, status: 400, error: 'Report id is required.' };
  try {
    const client = getServiceClient();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    triggerRefreshLatestMV(true);
    return { ok: true, data: { id } };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function listRecentReports({ page = 1, pageSize = 20 } = {}) {
  if (!supabaseService.isConfigured()) {
    return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
  }
  const p = Number(page) || 1;
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  try {
    const client = getServiceClient();
    const { data, error, count } = await client
      .from(TABLE)
      .select('*', { count: 'exact' })
      .order('week_of', { ascending: false })
      .range(from, to);

    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return { ok: true, data: data || [], page: p, pageSize: ps, total: typeof count === 'number' ? count : undefined };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

/**
 * INTERNAL: quick verification used by operators to simulate a lookup and insert.
 * Uses schema-targeted auth.users existence check under the hood.
 * Not exported publicly via routes; used for debugging in development/diagnostics.
 */
async function __debugVerifyAndInsertExample() {
  const testUserId = '391eb516-4e8e-43e8-84a4-5e24a8a3d1d6';
  const today = new Date().toISOString().slice(0, 10);
  return createReport({
    userId: testUserId,
    weekOf: today,
    content: 'debug verification insert',
    blockers: '',
    plans: '',
  });
}

module.exports = {
  tryFetchSample: async () => {
    if (!supabaseService.isConfigured()) {
      return { ok: false, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
    }
    try {
      const client = supabaseService.getClient();
      const { data, error } = await client.from(TABLE).select('*').limit(1);
      if (error) return { ok: false, error: error.message || String(error) };
      return { ok: true, data: data || [], count: Array.isArray(data) ? data.length : 0 };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // PUBLIC_INTERFACE
  /**
   * checkAuthUserExists
   * Validates and checks if a provided userId exists in auth.users using schema-targeted existence check.
   * Returns: { ok: true, found: boolean, count?: number, diag: { host, schema, path } } or { ok: false, status, error, diag? }
   */
  async checkAuthUserExists(userId) {
    if (!supabaseService.isConfigured()) {
      return { ok: false, status: 503, error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' };
    }
    const trimmed = sanitizeString(userId);
    if (!trimmed) {
      return { ok: false, status: 400, error: 'userId is required.' };
    }
    if (!supabaseService.isValidUUID(trimmed)) {
      return { ok: false, status: 400, error: 'userId must be a valid UUID.' };
    }
    try {
      // Prefer explicit auth client for reliability across Supabase versions
      const { exists, count, error, diag } = await supabaseService.authUsersExists(trimmed);
      if (error) {
        return { ok: false, status: 400, error: `Unable to verify user in auth.users: ${error}`, diag: { ...diag, count } };
      }
      // Include which mechanism is used in diagnostics for operators
      return {
        ok: true,
        found: !!exists,
        count: typeof count === 'number' ? count : undefined,
        diag: { ...diag, mechanism: 'db.schema(auth)' }
      };
    } catch (err) {
      const norm = normalizeDbError(err);
      return { ok: false, status: norm.status, error: norm.error };
    }
  },

  createReport,
  getReportById,
  listReportsByUser,
  updateReport,
  deleteReport,
  listRecentReports,
  __debugVerifyAndInsertExample: process.env.NODE_ENV !== 'production' ? __debugVerifyAndInsertExample : undefined,
};
