'use strict';

const { refreshLatestUserReports, isConfigured } = require('../services/supabaseClient');

/**
 * AdminMaintenanceController
 *
 * Exposes operational maintenance handlers for admin usage.
 */
class AdminMaintenanceController {
  // PUBLIC_INTERFACE
  /**
   * refreshLatestReportsMV
   * Manually refresh the materialized view public.latest_user_reports.
   * Query: ?concurrent=true|false (default true)
   * Response:
   *  - 200 { refreshed: true, concurrent: boolean }
   *  - 503 { refreshed: false, error } when not configured
   *  - 500 { refreshed: false, error } on execution error
   */
  async refreshLatestReportsMV(req, res) {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          refreshed: false,
          error: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
      }
      const concurrent = req.query.concurrent !== 'false';
      const result = await refreshLatestUserReports({ concurrent });
      if (result && result.success) {
        return res.status(200).json({
          refreshed: true,
          concurrent: !!result.concurrentUsed,
        });
      }
      return res.status(500).json({
        refreshed: false,
        error: result && result.error ? result.error : 'Unknown error',
      });
    } catch (err) {
      return res.status(500).json({
        refreshed: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  }
}

module.exports = new AdminMaintenanceController();
