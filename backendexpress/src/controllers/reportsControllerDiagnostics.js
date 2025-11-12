'use strict';

const { isConfigured, getSupabaseDiagnostics } = require('../services/supabaseClient');

/**
 * ReportsDiagnosticsController
 *
 * Provides minimal, non-sensitive diagnostics about Supabase targeting as used by the reports module.
 */
class ReportsDiagnosticsController {
  // PUBLIC_INTERFACE
  /**
   * get
   * Returns the effective SUPABASE_URL host and the schema-qualified path used to check auth users.
   * 200: { configured: boolean, supabase: { host, keySource }, authUsersQueryPath: "auth.users" }
   */
  async get(req, res) {
    try {
      const configured = isConfigured();
      const diag = getSupabaseDiagnostics();
      return res.status(200).json({
        configured,
        supabase: diag,
        authUsersQueryPath: 'auth.users',
      });
    } catch (err) {
      return res.status(200).json({
        configured: isConfigured(),
        error: err && err.message ? err.message : String(err),
      });
    }
  }
}

module.exports = new ReportsDiagnosticsController();
