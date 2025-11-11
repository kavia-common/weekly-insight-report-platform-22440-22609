'use strict';

/**
 * ReportService provides read-only access to reports.
 * Uses an in-memory repository by default. Structure allows future swap to MongoDB.
 */

/**
 * @typedef {Object} Report
 * @property {string} id - Unique identifier
 * @property {string} title - Report title
 * @property {string} content - Report body/content
 * @property {string} authorId - Author user ID
 * @property {string} authorName - Author display name
 * @property {string} teamId - Team ID
 * @property {string} teamName - Team display name
 * @property {string} createdAt - ISO datetime string
 * @property {string} updatedAt - ISO datetime string
 */

class InMemoryReportRepository {
  constructor() {
    // Seed with a couple of sample reports to avoid empty UX while allowing empty handling
    const now = new Date();
    this.reports = [
      {
        id: 'rpt-1',
        title: 'Sprint 12 - Week 1 Summary',
        content: 'Completed login flow, started report views.',
        authorId: 'user-123',
        authorName: 'Alice Johnson',
        teamId: 'team-42',
        teamName: 'Platform',
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(),
        updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
      },
      {
        id: 'rpt-2',
        title: 'Sprint 12 - Week 1 QA',
        content: 'Tested health endpoint; no regressions.',
        authorId: 'user-456',
        authorName: 'Bob Smith',
        teamId: 'team-42',
        teamName: 'Platform',
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 2).toISOString(),
        updatedAt: new Date(now.getTime() - 1000 * 60 * 60 * 12).toISOString(),
      },
      {
        id: 'rpt-3',
        title: 'Growth team weekly',
        content: 'Launched A/B test for new landing page.',
        authorId: 'user-789',
        authorName: 'Carol Davis',
        teamId: 'team-7',
        teamName: 'Growth',
        createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 1).toISOString(),
        updatedAt: now.toISOString(),
      },
    ];
  }

  /**
   * Returns all reports
   * @returns {Report[]}
   */
  findAll() {
    return this.reports.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  /**
   * Returns reports for a specific author
   * @param {string} authorId
   * @returns {Report[]}
   */
  findByAuthorId(authorId) {
    if (!authorId) return [];
    return this.findAll().filter((r) => r.authorId === authorId);
  }

  /**
   * Returns reports for a specific team
   * @param {string} teamId
   * @returns {Report[]}
   */
  findByTeamId(teamId) {
    if (!teamId) return [];
    return this.findAll().filter((r) => r.teamId === teamId);
  }
}

class ReportService {
  constructor(options = {}) {
    // Placeholder for future Mongo integration:
    // if (options.mongoClient) { this.repo = new MongoReportRepository(options.mongoClient); } else { ... }
    this.repo = new InMemoryReportRepository();
  }

  // PUBLIC_INTERFACE
  /**
   * Get all reports.
   * @returns {Report[]}
   */
  getAllReports() {
    return this.repo.findAll();
  }

  // PUBLIC_INTERFACE
  /**
   * Get all reports authored by a given user.
   * @param {string} userId - The user id to filter by
   * @returns {Report[]}
   */
  getReportsForUser(userId) {
    return this.repo.findByAuthorId(userId);
  }

  // PUBLIC_INTERFACE
  /**
   * Get all reports for a given team.
   * @param {string} teamId - The team id to filter by
   * @returns {Report[]}
   */
  getReportsForTeam(teamId) {
    return this.repo.findByTeamId(teamId);
  }
}

module.exports = new ReportService();
