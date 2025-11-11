'use strict';

const repo = require('../repositories/reportsRepo');

/**
 * ReportsController (Supabase-backed)
 *
 * Provides CRUD endpoints:
 *  - POST /api/reports
 *  - GET /api/reports/:id
 *  - GET /api/reports?userId=...&page=1&pageSize=20
 *      - If userId provided -> listReportsByUser
 *      - Else -> listRecentReports
 *  - PATCH /api/reports/:id
 *  - DELETE /api/reports/:id
 *
 * TODO: Bind userId from Google auth when integrated (use req.user.id).
 * For now, accept userId via body (POST) or query param for listing.
 */
class ReportsController {
  // PUBLIC_INTERFACE
  /**
   * Create a weekly report.
   * Expects JSON body: { userId (string), weekOf (YYYY-MM-DD), content?, blockers?, plans? }
   */
  async create(req, res) {
    const { userId, weekOf, content, blockers, plans } = req.body || {};
    // TODO: when auth wired, derive userId from req.user?.id
    const result = await repo.createReport({ userId, weekOf, content, blockers, plans });
    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({ status: 'error', message: result.error });
    }
    return res.status(201).json(result.data);
  }

  // PUBLIC_INTERFACE
  /**
   * Get a report by id.
   * Path param: id
   */
  async getById(req, res) {
    const { id } = req.params;
    const result = await repo.getReportById(id);
    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({ status: 'error', message: result.error });
    }
    return res.status(200).json(result.data);
  }

  // PUBLIC_INTERFACE
  /**
   * List reports (recent or by user).
   * Query: userId? page? pageSize?
   * - If userId provided -> listReportsByUser
   * - Else -> listRecentReports
   */
  async list(req, res) {
    const { userId } = req.query;
    const page = req.query.page ? Number(req.query.page) : undefined;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : undefined;

    const result = userId
      ? await repo.listReportsByUser({ userId, page, pageSize })
      : await repo.listRecentReports({ page, pageSize });

    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({ status: 'error', message: result.error });
    }
    return res.status(200).json({
      items: result.data,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    });
  }

  // PUBLIC_INTERFACE
  /**
   * Patch a report.
   * Path param: id
   * Body: { weekOf?, content?, blockers?, plans? }
   */
  async patch(req, res) {
    const { id } = req.params;
    const patch = req.body || {};
    const result = await repo.updateReport(id, patch);
    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({ status: 'error', message: result.error });
    }
    return res.status(200).json(result.data);
  }

  // PUBLIC_INTERFACE
  /**
   * Delete a report by id.
   */
  async remove(req, res) {
    const { id } = req.params;
    const result = await repo.deleteReport(id);
    if (!result.ok) {
      const status = result.status || 500;
      return res.status(status).json({ status: 'error', message: result.error });
    }
    return res.status(204).send();
  }
}

module.exports = new ReportsController();
