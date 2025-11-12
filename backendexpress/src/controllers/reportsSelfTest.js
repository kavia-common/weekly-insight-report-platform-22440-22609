'use strict';

const repo = require('../repositories/reportsRepo');

/**
 * ReportsSelfTestController
 *
 * Provides a minimal self-test to verify that server-side Supabase client
 * with service role key can insert into weekly_reports despite RLS.
 * Returns 201 on success with the created row (so operators can confirm behavior from Swagger).
 */
class ReportsSelfTestController {
  // PUBLIC_INTERFACE
  /**
   * selfTestInsert
   * Creates a test weekly report row using a synthetic user and the current date.
   * Does not require any body. Returns 201 on success.
   * Response:
   *  - 201 { ok: true, data: row }
   *  - 503 when Supabase not configured
   *  - 500/other on DB errors
   */
  async selfTestInsert(req, res) {
    const today = new Date();
    const weekISO = today.toISOString().slice(0, 10);
    const testUserId = 'selftest-user-' + today.getTime();

    const result = await repo.createReport({
      userId: testUserId,
      weekOf: weekISO,
      content: 'self-test insert',
      blockers: '',
      plans: '',
    });

    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({
        ok: false,
        message: 'Self-test insert failed',
        error: result.error,
        diag: result.diag,
      });
    }
    return res.status(201).json({ ok: true, data: result.data });
  }
}

module.exports = new ReportsSelfTestController();
