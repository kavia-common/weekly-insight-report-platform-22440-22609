'use strict';

const { isConfigured, getSupabaseDiagnostics, getClient, getAuthClient } = require('../services/supabaseClient');

/**
 * ReportsUserRawCheckController
 *
 * PUBLIC_INTERFACE
 * GET /api/reports/users/:userId/raw-check
 *
 * Purpose:
 * - Perform a raw diagnostic query to Supabase auth.users using the same schema-targeted
 *   service-role client and exact query path used by the repository.
 * - This endpoint helps validate PostgREST schema targeting and any unexpected filters.
 *
 * Behavior:
 * 1) Trims the provided userId (no UUID validation gate to allow checking raw behavior).
 * 2) Executes:
 *      client
 *        .schema('auth')
 *        .from('users')
 *        .select('id', { head: false, count: 'exact' })
 *        .eq('id', userId)
 *        .limit(2);
 * 3) Returns JSON:
 *      {
 *        found: boolean,
 *        count: number | null,
 *        rows: array of ids (max 2),
 *        host: string,
 *        notes: string,
 *        query: { schema: 'auth', table: 'users', eq: userId }
 *      }
 * 4) If Supabase returns error, logs a concise message and returns it in payload without secrets.
 */
class ReportsUserRawCheckController {
  // PUBLIC_INTERFACE
  /**
   * rawCheck
   * Path: /api/reports/users/:userId/raw-check
   * Returns:
   *  - 200 on successful query (even if not found)
   *  - 503 when Supabase not configured
   *  - 500 on unexpected errors
   */
  async rawCheck(req, res) {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          found: false,
          error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
      }

      const userId = (req.params && typeof req.params.userId === 'string') ? req.params.userId.trim() : '';
      const host = getSupabaseDiagnostics().host;

      if (!userId) {
        return res.status(400).json({
          found: false,
          error: 'userId is required as a non-empty string.',
          host,
          query: { schema: 'auth', table: 'users', eq: userId },
          notes: 'Provide a UUID or string to test direct equality against auth.users.id using schema targeting.',
        });
      }

      // First attempt: Accept-Profile header approach via base.schema('auth')
      const base = getClient();
      const svc = base.schema('auth');
      const res1 = await svc
        .from('users')
        .select('id', { head: false, count: 'exact' })
        .eq('id', userId)
        .limit(2);

      // Second attempt: explicit db.schema('auth') client
      const authClient = getAuthClient();
      const res2 = await authClient
        .from('users')
        .select('id', { head: false, count: 'exact' })
        .eq('id', userId)
        .limit(2);

      // Prefer a successful result among the two attempts
      const pick = (r) => ({
        ok: !r.error,
        data: Array.isArray(r.data) ? r.data : [],
        count: typeof r.count === 'number' ? r.count : null,
        error: r.error ? (r.error.message || String(r.error)) : null,
      });

      const a = pick(res1);
      const b = pick(res2);
      const chosen = a.ok ? a : (b.ok ? b : a); // choose first ok else a (to report its error)

      if (!a.ok && !b.ok) {
        // eslint-disable-next-line no-console
        console.error('[raw-check] Supabase errors', {
          acceptProfile: a.error,
          dbSchemaAuth: b.error,
        });
      }

      const rows = chosen.data.map(r => r && r.id).filter(Boolean);
      const found = chosen.count !== null ? chosen.count > 0 : rows.length > 0;

      return res.status(200).json({
        found,
        count: chosen.count !== null ? chosen.count : rows.length,
        rows,
        host,
        query: { schema: 'auth', table: 'users', eq: userId },
        notes: 'Tried Accept-Profile schema("auth") and explicit db.schema("auth"); returns the first success.',
        methods: {
          acceptProfile: { ok: a.ok, count: a.count, error: a.error ? 'present' : null },
          dbSchemaAuth: { ok: b.ok, count: b.count, error: b.error ? 'present' : null },
        },
      });
    } catch (err) {
      return res.status(500).json({
        found: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }
}

module.exports = new ReportsUserRawCheckController();
