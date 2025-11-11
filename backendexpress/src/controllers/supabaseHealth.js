'use strict';

const { healthCheck, isConfigured } = require('../services/supabaseClient');

class SupabaseHealthController {
  // PUBLIC_INTERFACE
  /**
   * Check Supabase configuration and connectivity.
   * Response:
   *  - 200 with JSON: { ok, configured, status?, statusText?, error?, keySource }
   */
  async check(req, res) {
    try {
      // If not configured, still return 200 to surface details to the operator.
      const result = await healthCheck();
      return res.status(200).json({
        ...result,
        env: {
          SUPABASE_URL_present: Boolean(process.env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          SUPABASE_KEY_present: Boolean(process.env.SUPABASE_KEY),
          // Do not echo actual values for security
        },
        note: isConfigured()
          ? `Supabase env vars detected. Using key from ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : 'none')}.`
          : 'Supabase env vars missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      });
    } catch (err) {
      return res.status(200).json({
        ok: false,
        configured: isConfigured(),
        error: err && err.message ? err.message : String(err),
        env: {
          SUPABASE_URL_present: Boolean(process.env.SUPABASE_URL),
          SUPABASE_SERVICE_ROLE_KEY_present: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
          SUPABASE_KEY_present: Boolean(process.env.SUPABASE_KEY),
        },
        note: isConfigured()
          ? `Supabase env vars detected. Using key from ${process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : 'none')}.`
          : 'Supabase env vars missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
      });
    }
  }
}

module.exports = new SupabaseHealthController();
