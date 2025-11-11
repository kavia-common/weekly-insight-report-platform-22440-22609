'use strict';

const reportService = require('../services/reports');

/**
 * ReportsController exposes read-only endpoints for reports.
 * Minimal mock authentication via headers:
 *   - x-user-id: string user id used by /api/reports/mine
 *   - x-user-name: optional, not required for these routes
 *
 * All routes return arrays and handle empty results gracefully.
 */
class ReportsController {
  // PUBLIC_INTERFACE
  /**
   * Get all reports.
   * Returns array of reports with fields:
   * title, content, authorId, authorName, teamId, teamName, createdAt, updatedAt, id
   */
  getAll(req, res) {
    const data = reportService.getAllReports();
    return res.status(200).json(data);
  }

  // PUBLIC_INTERFACE
  /**
   * Get current user's reports.
   * Uses header x-user-id to identify the user.
   * If header missing, returns 400 with message.
   */
  getMine(req, res) {
    const userId = req.header('x-user-id');
    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing x-user-id header for /api/reports/mine',
      });
    }
    const data = reportService.getReportsForUser(userId);
    return res.status(200).json(data);
  }

  // PUBLIC_INTERFACE
  /**
   * Get team reports by team id param.
   * Path: /api/teams/:id/reports
   */
  getTeamReports(req, res) {
    const teamId = req.params.id;
    if (!teamId) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing team id parameter',
      });
    }
    const data = reportService.getReportsForTeam(teamId);
    return res.status(200).json(data);
  }
}

module.exports = new ReportsController();
