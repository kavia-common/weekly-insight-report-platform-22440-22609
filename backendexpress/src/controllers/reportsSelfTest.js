'use strict';

const repo = require('../repositories/reportsRepo');
const { getClient, isConfigured } = require('../services/supabaseClient');

/**
 * ReportsSelfTestController
 *
 * Self-test verifies that the server-side Supabase client (service role) can insert into weekly_reports.
 * It also ensures the foreign key on weekly_reports.user_id is satisfied by:
 *  - Accepting an optional userId in the JSON body and using it when provided, OR
 *  - Upserting a synthetic test user in public.users when userId is not provided or does not exist.
 * Clear response indicates whether a user was created/used and whether the report was inserted.
 */
class ReportsSelfTestController {
  // PUBLIC_INTERFACE
  /**
   * selfTestInsert
   * Optional body: { userId?: string }
   * Behavior:
   *  - If userId provided: use it; if referenced user is not found in public.users, self-test will create it.
   *  - If not provided: create or reuse a deterministic synthetic user row in public.users.
   *  - Then insert a weekly_reports row for the current week using the service role client.
   * Responses:
   *  - 201 { ok: true, report, user: { id, existed, created } }
   *  - 503 when Supabase not configured
   *  - 500 on DB errors
   */
  async selfTestInsert(req, res) {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          ok: false,
          message: 'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
        });
      }

      const client = getClient();
      const today = new Date();
      const weekISO = today.toISOString().slice(0, 10);
      const providedUserId = (req.body && typeof req.body.userId === 'string') ? req.body.userId.trim() : undefined;
      const fallbackUserId = '00000000-0000-0000-0000-000000000001';

      // Helper: ensure a user exists in public.users, using service role client.
      const ensureUser = async (id) => {
        // Try select first
        const { data: existing, error: selErr } = await client.from('users').select('id').eq('id', id).limit(1);
        if (!selErr && Array.isArray(existing) && existing.length > 0) {
          return { id, existed: true, created: false };
        }
        // If table missing, surface meaningful error
        if (selErr && /relation .* does not exist/i.test(selErr.message || '')) {
          throw new Error('Table "users" does not exist. Create public.users with primary key id to satisfy the foreign key, or adjust FK.');
        }
        // Upsert (insert with on conflict) - best effort
        const upsertPayload = { id, email: `selftest+${id}@example.com`, name: 'SelfTest User', created_at: new Date().toISOString() };
        const { data: upData, error: upErr } = await client.from('users').upsert(upsertPayload, { onConflict: 'id' }).select('id').single();
        if (upErr) {
          throw upErr;
        }
        return { id: upData.id || id, existed: false, created: true };
      };

      let userMeta;
      if (providedUserId) {
        // Try to ensure user exists; create if not
        try {
          userMeta = await ensureUser(providedUserId);
        } catch (uErr) {
          return res.status(500).json({
            ok: false,
            message: 'Failed to ensure provided user exists in users table.',
            error: uErr && uErr.message ? uErr.message : String(uErr),
          });
        }
      } else {
        // Create or reuse synthetic user
        try {
          userMeta = await ensureUser(fallbackUserId);
        } catch (uErr2) {
          return res.status(500).json({
            ok: false,
            message: 'Failed to upsert synthetic self-test user in users table.',
            error: uErr2 && uErr2.message ? uErr2.message : String(uErr2),
          });
        }
      }

      // Insert report using repo (which uses the service client)
      const result = await repo.createReport({
        userId: userMeta.id,
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
          user: userMeta,
        });
      }

      return res.status(201).json({
        ok: true,
        message: 'Self-test succeeded using service role client',
        user: userMeta,
        report: result.data,
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
