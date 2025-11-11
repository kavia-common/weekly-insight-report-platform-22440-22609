'use strict';

/**
 * Weekly Reports repository backed by Supabase.
 * Table: weekly_reports
 *
 * Expected columns (minimal):
 *  - id: uuid (default)
 *  - user_id: text or uuid
 *  - week_of: date (ISO YYYY-MM-DD)
 *  - content: text
 *  - blockers: text
 *  - plans: text
 *  - created_at: timestamp (default now)
 *  - updated_at: timestamp (default now, updated via trigger or app)
 *
 * All methods return objects of shape:
 *  - { ok: true, data, ... } on success
 *  - { ok: false, status?, error } on error
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
  // Fire-and-forget; log any errors but don't disrupt main flow
  Promise.resolve()
    .then(() => supabaseService.refreshLatestUserReports(preferConcurrent))
    .then((res) => {
      // eslint-disable-next-line no-console
      if (res && res.ok) {
        console.log(`[mv-refresh] latest_user_reports refreshed (concurrent=${res.concurrent === true})`);
      } else if (res && res.error) {
        console.warn(`[mv-refresh] refresh attempt failed: ${res.error}`);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[mv-refresh] refresh attempt threw:', err && err.message ? err.message : String(err));
    });
}

const TABLE = 'weekly_reports';

// Map common Supabase error codes/messages to user-friendly messages/status.
function normalizeDbError(err) {
  const message = (err && (err.message || err.msg)) ? (err.message || err.msg) : String(err);
  // Detect missing table
  if (/relation .* does not exist/i.test(message) || /table .* does not exist/i.test(message)) {
    return {
      status: 503,
      error: 'Database table "weekly_reports" is missing. Please run migrations.',
    };
  }
  return { status: 500, error: message };
}

// Sanitize string inputs
function sanitizeString(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val !== 'string') return String(val);
  // Basic trim; escaping/HTML handling should be done at render layer. DB paramization avoids injection.
  return val.trim();
}

// Validate ISO date (YYYY-MM-DD) for weekOf
function isISODate(val) {
  if (typeof val !== 'string') return false;
  // Accept full date only, not datetime
  return /^\d{4}-\d{2}-\d{2}$/.test(val);
}

// PUBLIC_INTERFACE
async function createReport({ userId, weekOf, content, blockers, plans }) {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  if (!userId || !isISODate(weekOf)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid payload: userId (string) and weekOf (YYYY-MM-DD) are required.',
    };
  }

  const row = {
    user_id: sanitizeString(userId),
    week_of: weekOf,
    content: sanitizeString(content) || '',
    blockers: sanitizeString(blockers) || '',
    plans: sanitizeString(plans) || '',
  };

  try {
    const client = supabaseService.getClient();
    const { data, error } = await client.from(TABLE).insert(row).select('*').single();
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    // Non-blocking refresh; prefer concurrent path
    triggerRefreshLatestMV(true);
    return { ok: true, data };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function getReportById(id) {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  if (!id) {
    return { ok: false, status: 400, error: 'Report id is required.' };
  }
  try {
    const client = supabaseService.getClient();
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
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  if (!userId) {
    return { ok: false, status: 400, error: 'userId is required.' };
  }
  const p = Number(page) || 1;
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  try {
    const client = supabaseService.getClient();
    const { data, error, count } = await client
      .from(TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('week_of', { ascending: false })
      .range(from, to);

    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return {
      ok: true,
      data: data || [],
      page: p,
      pageSize: ps,
      total: typeof count === 'number' ? count : undefined,
    };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function updateReport(id, patch) {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  if (!id || !patch || typeof patch !== 'object') {
    return { ok: false, status: 400, error: 'id and patch object are required.' };
  }
  const payload = {};
  if (patch.weekOf !== undefined) {
    if (!isISODate(patch.weekOf)) {
      return { ok: false, status: 400, error: 'weekOf must be YYYY-MM-DD.' };
    }
    payload.week_of = patch.weekOf;
  }
  if (patch.content !== undefined) payload.content = sanitizeString(patch.content);
  if (patch.blockers !== undefined) payload.blockers = sanitizeString(patch.blockers);
  if (patch.plans !== undefined) payload.plans = sanitizeString(patch.plans);
  // Optionally update updated_at via DB trigger; if not available, set here:
  payload.updated_at = new Date().toISOString();

  try {
    const client = supabaseService.getClient();
    const { data, error } = await client.from(TABLE).update(payload).eq('id', id).select('*').single();
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
async function deleteReport(id) {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  if (!id) {
    return { ok: false, status: 400, error: 'Report id is required.' };
  }
  try {
    const client = supabaseService.getClient();
    const { error } = await client.from(TABLE).delete().eq('id', id);
    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return { ok: true, data: { id } };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

// PUBLIC_INTERFACE
async function listRecentReports({ page = 1, pageSize = 20 } = {}) {
  if (!supabaseService.isConfigured()) {
    return {
      ok: false,
      status: 503,
      error:
        'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    };
  }
  const p = Number(page) || 1;
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  try {
    const client = supabaseService.getClient();
    const { data, error, count } = await client
      .from(TABLE)
      .select('*', { count: 'exact' })
      .order('week_of', { ascending: false })
      .range(from, to);

    if (error) {
      const norm = normalizeDbError(error);
      return { ok: false, status: norm.status, error: norm.error };
    }
    return {
      ok: true,
      data: data || [],
      page: p,
      pageSize: ps,
      total: typeof count === 'number' ? count : undefined,
    };
  } catch (err) {
    const norm = normalizeDbError(err);
    return { ok: false, status: norm.status, error: norm.error };
  }
}

module.exports = {
  // legacy placeholder retained (not used by new routes)
  tryFetchSample: async () => {
    if (!supabaseService.isConfigured()) {
      return {
        ok: false,
        error:
          'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      };
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

  createReport,
  getReportById,
  listReportsByUser,
  updateReport,
  deleteReport,
  listRecentReports,
};
