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
   * Returns the effective SUPABASE_URL host and schema targeting status.
   * 200: { host, schemaTargeting: true, configured }
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
        host: diag.host,
        schemaTargeting: true,
        configured,
      });
    } catch (err) {
      // Return 200 with minimal info; never parse or coerce params.
      const d = getSupabaseDiagnostics();
      return res.status(200).json({
        host: d.host,
        schemaTargeting: true,
        configured: isConfigured(),
      });
    }
  }
}

module.exports = new ReportsDiagnosticsController();
