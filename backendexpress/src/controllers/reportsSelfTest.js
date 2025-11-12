'use strict';

const repo = require('../repositories/reportsRepo');
const { isConfigured, authUsersExists, getSupabaseDiagnostics, isValidUUID } = require('../services/supabaseClient');

/**
 * ReportsSelfTestController
 *
 * Self-test verifies that the server-side Supabase client (service role) can insert into weekly_reports.
 * It validates the foreign key on weekly_reports.user_id strictly against auth.users(id).
 * New behavior:
 *  - Requires a userId in the JSON body; it must be a valid UUID and present in auth.users.
 *  - Does not upsert into any public.users table (avoids mismatched FK assumptions).
 *  - Returns structured diagnostics without leaking secrets.
 */
class ReportsSelfTestController {
  // PUBLIC_INTERFACE
  /**
   * selfTestInsert
   * Body: { userId: string }
   * Behavior:
   *  - Validates UUID format and trims whitespace.
   *  - Confirms auth.users contains the userId via schema-targeted existence check.
   *  - Inserts a weekly_reports row for the current week using the service role client via the repo.
   * Responses:
   *  - 201 { ok: true, report }
   *  - 400 on validation/existence failures (with diagnostics)
   *  - 503 when Supabase not configured
   *  - 500 on unexpected errors
   */
  async selfTestInsert(req, res) {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          ok: false,
          message: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
      }

      const userId = (req.body && typeof req.body.userId === 'string') ? req.body.userId.trim() : '';
      if (!userId) {
        return res.status(400).json({
          ok: false,
          message: 'Provide body: { "userId": "<existing-auth.users-uuid>" }',
          diag: { hint: 'Fetch a UUID from your Supabase Auth users table and retry.' },
        });
      }
      if (!isValidUUID(userId)) {
        return res.status(400).json({
          ok: false,
          message: 'userId must be a valid UUID.',
        });
      }

      const chk = await authUsersExists(userId);
      if (chk.error) {
        return res.status(400).json({
          ok: false,
          message: `Unable to verify user in auth.users: ${chk.error}`,
          diag: { ...chk.diag, count: chk.count },
        });
      }
      if (!chk.exists) {
        return res.status(400).json({
          ok: false,
          message: 'User not found in auth.users. Provide a valid existing auth.users id.',
          diag: { ...chk.diag, count: chk.count },
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const result = await repo.createReport({
        userId,
        weekOf: today,
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
          diag: {
            ...result.diag,
            supabase: getSupabaseDiagnostics(),
          },
        });
      }

      return res.status(201).json({
        ok: true,
        message: 'Self-test succeeded using service role client',
        report: result.data,
        diag: {
          supabase: getSupabaseDiagnostics(),
          authUsers: { exists: true, count: chk.count, path: chk.diag?.path, schema: chk.diag?.schema },
        },
      });
    } catch (err) {
      return res.status(500).json({
        ok: false,
        message: 'Unexpected error during self-test',
        error: err && err.message ? err.message : String(err),
      });
    }
  }
}

module.exports = new ReportsSelfTestController();
