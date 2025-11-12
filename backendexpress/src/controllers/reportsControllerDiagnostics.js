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
   *
   * Note:
   * - This endpoint does not accept or parse any URL parameters.
   * - It must never attempt to coerce path segments like 'diagnostics' into UUIDs.
   */
  async get(req, res) {
    try {
      const configured = isConfigured();
      const diag = getSupabaseDiagnostics();
      // Only safe diagnostics; do not echo secrets or parse path params.
      return res.status(200).json({
        configured,
        supabase: {
          host: diag.host,
          keySource: diag.keySource,
        },
        schemaTargetingEnabled: true,
        authUsersQueryPath: 'auth.users',
        notes: 'Diagnostics contain only non-sensitive information. No URL params are interpreted.',
      });
    } catch (err) {
      // Return 200 with current configured state, no throwing further.
      return res.status(200).json({
        configured: isConfigured(),
        error: err && err.message ? err.message : String(err),
        schemaTargetingEnabled: true,
      });
    }
  }
}

module.exports = new ReportsDiagnosticsController();
