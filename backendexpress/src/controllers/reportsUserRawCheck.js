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
 * 2) Executes preferred explicit db.schema('auth') client; on error, falls back to REST via Accept-Profile: auth.
 * 3) Returns JSON indicating which method succeeded and includes error messages when both fail (no secrets).
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

      const results = {
        authClient: { ok: false, count: null, rows: [], error: null },
        rest: { ok: false, count: null, rows: [], error: null },
      };

      // Attempt 1: explicit auth client
      try {
        const authClient = getAuthClient();
        const r = await authClient
          .from('users')
          .select('id', { head: false, count: 'exact' })
          .eq('id', userId)
          .limit(2);
        if (!r.error) {
          results.authClient.ok = true;
          results.authClient.count = typeof r.count === 'number' ? r.count : null;
          results.authClient.rows = Array.isArray(r.data) ? r.data.map(x => x && x.id).filter(Boolean) : [];
        } else {
          results.authClient.error = r.error.message || String(r.error);
        }
      } catch (e1) {
        results.authClient.error = e1 && e1.message ? e1.message : String(e1);
      }

      // Attempt 2: REST fallback if needed
      if (!results.authClient.ok) {
        try {
          const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY } = process.env;
          const url = SUPABASE_URL;
          const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;
          const resp = await fetch(`${url}/rest/v1/users?id=eq.${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Accept-Profile': 'auth',
            },
          });
          if (resp.ok) {
            const rows = await resp.json().catch(() => []);
            results.rest.ok = true;
            results.rest.rows = Array.isArray(rows) ? rows.map(x => x && x.id).filter(Boolean) : [];
            results.rest.count = Array.isArray(rows) ? rows.length : null;
          } else {
            const text = await resp.text().catch(() => '');
            results.rest.error = `HTTP ${resp.status} ${resp.statusText}: ${text}`;
          }
        } catch (e2) {
          results.rest.error = e2 && e2.message ? e2.message : String(e2);
        }
      }

      // Choose success precedence: authClient, then REST
      const chosen = results.authClient.ok ? results.authClient : (results.rest.ok ? results.rest : null);

      if (!chosen) {
        // eslint-disable-next-line no-console
        console.error('[raw-check] Both methods failed', { authClient: results.authClient.error, rest: results.rest.error });
        return res.status(200).json({
          found: false,
          count: 0,
          rows: [],
          host,
          query: { schema: 'auth', table: 'users', eq: userId },
          notes: 'Tried explicit auth schema client first; then REST fallback with Accept-Profile: auth.',
          methods: {
            authClient: { ok: false, count: null, error: results.authClient.error },
            rest: { ok: false, count: null, error: results.rest.error },
          },
        });
      }

      const found = (typeof chosen.count === 'number' ? chosen.count : chosen.rows.length) > 0;
      const methodName = chosen === results.authClient ? 'authClient' : 'rest';

      return res.status(200).json({
        found,
        count: typeof chosen.count === 'number' ? chosen.count : chosen.rows.length,
        rows: chosen.rows,
        host,
        query: { schema: 'auth', table: 'users', eq: userId },
        notes: 'Performed auth.users lookup using auth schema client; used REST fallback if needed.',
        methods: {
          authClient: { ok: results.authClient.ok, count: results.authClient.count, error: results.authClient.error || null },
          rest: { ok: results.rest.ok, count: results.rest.count, error: results.rest.error || null },
          succeeded: methodName,
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
