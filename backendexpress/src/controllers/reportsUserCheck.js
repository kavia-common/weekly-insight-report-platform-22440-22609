'use strict';

const repo = require('../repositories/reportsRepo');
const { isConfigured, getSupabaseDiagnostics } = require('../services/supabaseClient');

/**
 * ReportsUserCheckController
 *
 * PUBLIC_INTERFACE
 * GET /api/reports/users/:userId/check
 * Validates provided userId (trim + UUID) and checks for existence in auth.users (schema-targeted).
 * Returns non-sensitive diagnostics to aid troubleshooting.
 */
class ReportsUserCheckController {
  // PUBLIC_INTERFACE
  /**
   * check
   * Path param: userId
   * Responses:
   *  - 200 { found: boolean, count?: number, host, notes }
   *  - 400 { found: false, error, host, notes }
   *  - 503 { found: false, error } when Supabase not configured
   */
  async check(req, res) {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          found: false,
          error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
      }
      const userId = (req.params && typeof req.params.userId === 'string') ? req.params.userId.trim() : '';
      const result = await repo.checkAuthUserExists(userId);
      const host = getSupabaseDiagnostics().host;
      if (!result.ok) {
        return res.status(result.status || 400).json({
          found: false,
          error: result.error,
          host,
          notes: 'Checked against auth.users using head+count exact with schema targeting.',
          diag: result.diag,
        });
      }
      return res.status(200).json({
        found: !!result.found,
        count: result.count,
        host,
        notes: 'Validated userId format and queried auth.users via schema targeting.',
        diag: result.diag,
      });
    } catch (err) {
      return res.status(500).json({
        found: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }
}

module.exports = new ReportsUserCheckController();
