'use strict';

const { isConfigured, getSupabaseDiagnostics, getClient } = require('../services/supabaseClient');

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

      const base = getClient();
      const svc = base.schema('auth'); // ensure Accept-Profile/Content-Profile headers target auth
      // Execute full select to obtain rows (no UUID casting, direct eq against id)
      const { data, error, count } = await svc
        .from('users')
        .select('id', { head: false, count: 'exact' })
        .eq('id', userId)
        .limit(2);

      if (error) {
        // Log concise error without secrets
        // eslint-disable-next-line no-console
        console.error('[raw-check] Supabase error:', {
          message: error.message || String(error),
          details: error.details,
          hint: error.hint,
          code: error.code,
        });

        return res.status(200).json({
          found: false,
          count: typeof count === 'number' ? count : null,
          rows: Array.isArray(data) ? data.map(r => r && r.id).filter(Boolean) : [],
          host,
          error: error.message || String(error),
          query: { schema: 'auth', table: 'users', eq: userId },
          notes: 'Executed schema-targeted select against auth.users (no UUID casting). Returned error from Supabase.',
        });
      }

      const rows = Array.isArray(data) ? data.map(r => r && r.id).filter(Boolean) : [];
      const found = typeof count === 'number' ? count > 0 : rows.length > 0;

      return res.status(200).json({
        found,
        count: typeof count === 'number' ? count : rows.length,
        rows,
        host,
        query: { schema: 'auth', table: 'users', eq: userId },
        notes: 'Direct equality against auth.users.id using client.schema("auth") with { head: false, count: "exact" }.',
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
