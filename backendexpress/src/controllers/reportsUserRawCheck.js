'use strict';

const { isConfigured, getSupabaseDiagnostics, getClient } = require('../services/supabaseClient');

/**
 * ReportsUserRawCheckController
 *
 * PUBLIC_INTERFACE
 * GET /api/reports/users/:userId/raw-check
 *
 * Purpose:
 * - Perform a raw diagnostic query to Supabase public.profiles (mirror of auth.users)
 *   using the service-role client and exact query path used by the repository.
 * - This endpoint helps validate the mirror and availability under public schema.
 * - Deprecated note: previous versions targeted auth.users; that path is now reserved for deeper diagnostics only.
 *
 * Behavior:
 * 1) Trims the provided userId (no UUID validation gate to allow checking raw behavior).
 * 2) Executes query via public schema client; on error, falls back to REST with Accept-Profile: public.
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
          query: { schema: 'public', table: 'profiles', eq: userId },
          notes: 'Provide a UUID or string to test direct equality against public.profiles.id.',
        });
      }

      const results = {
        publicClient: { ok: false, count: null, rows: [], error: null },
        rest: { ok: false, count: null, rows: [], error: null },
      };

      // Attempt 1: public schema client -> public.profiles
      try {
        const publicClient = getClient();
        const r = await publicClient
          .from('profiles')
          .select('id', { head: false, count: 'exact' })
          .eq('id', userId)
          .limit(2);
        if (!r.error) {
          results.publicClient.ok = true;
          results.publicClient.count = typeof r.count === 'number' ? r.count : null;
          results.publicClient.rows = Array.isArray(r.data) ? r.data.map(x => x && x.id).filter(Boolean) : [];
        } else {
          results.publicClient.error = r.error.message || String(r.error);
        }
      } catch (e1) {
        results.publicClient.error = e1 && e1.message ? e1.message : String(e1);
      }

      // Attempt 2: REST fallback if needed (public schema)
      if (!results.publicClient.ok) {
        try {
          const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_KEY } = process.env;
          const url = SUPABASE_URL;
          const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_KEY;
          const resp = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
              'Accept-Profile': 'public',
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

      // Choose success precedence: publicClient, then REST
      const chosen = results.publicClient.ok ? results.publicClient : (results.rest.ok ? results.rest : null);

      if (!chosen) {
        // eslint-disable-next-line no-console
        console.error('[raw-check] Both methods failed', { publicClient: results.publicClient.error, rest: results.rest.error });
        return res.status(200).json({
          found: false,
          count: 0,
          rows: [],
          host,
          query: { schema: 'public', table: 'profiles', eq: userId },
          notes: 'Tried public.profiles query via client first; then REST fallback with Accept-Profile: public.',
          methods: {
            publicClient: { ok: false, count: null, error: results.publicClient.error },
            rest: { ok: false, count: null, error: results.rest.error },
          },
        });
      }

      const found = (typeof chosen.count === 'number' ? chosen.count : chosen.rows.length) > 0;
      const methodName = chosen === results.publicClient ? 'publicClient' : 'rest';

      return res.status(200).json({
        found,
        count: typeof chosen.count === 'number' ? chosen.count : chosen.rows.length,
        rows: chosen.rows,
        host,
        query: { schema: 'public', table: 'profiles', eq: userId },
        notes: 'Performed public.profiles lookup using public schema client; used REST fallback if needed.',
        methods: {
          publicClient: { ok: results.publicClient.ok, count: results.publicClient.count, error: results.publicClient.error || null },
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
