'use strict';

const express = require('express');
const reportsController = require('../controllers/reports');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Reports
 *     description: Read-only report queries
 */

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Get all reports
 *     description: Returns an array of all reports. Read-only. No authentication required for this demo.
 *     tags: [Reports]
 *     responses:
 *       200:
 *         description: Array of Report objects
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string, description: "Report id" }
 *                   title: { type: string, description: "Report title" }
 *                   content: { type: string, description: "Report content" }
 *                   authorId: { type: string, description: "Author user id" }
 *                   authorName: { type: string, description: "Author display name" }
 *                   teamId: { type: string, description: "Team id" }
 *                   teamName: { type: string, description: "Team name" }
 *                   createdAt: { type: string, format: date-time, description: "Creation time" }
 *                   updatedAt: { type: string, format: date-time, description: "Last update time" }
 */
router.get('/api/reports', reportsController.getAll.bind(reportsController));

/**
 * @swagger
 * /api/reports/mine:
 *   get:
 *     summary: Get current user's reports
 *     description: Returns reports filtered by the x-user-id header.
 *     tags: [Reports]
 *     parameters:
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema:
 *           type: string
 *         description: The user id for filtering reports
 *     responses:
 *       200:
 *         description: Array of Report objects belonging to the current user
 *       400:
 *         description: Missing x-user-id header
 */
router.get('/api/reports/mine', reportsController.getMine.bind(reportsController));

/**
 * @swagger
 * /api/teams/{id}/reports:
 *   get:
 *     summary: Get reports for a team
 *     description: Returns reports filtered by team id in path parameter.
 *     tags: [Reports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Team ID
 *     responses:
 *       200:
 *         description: Array of Report objects for the team
 *       400:
 *         description: Missing team id parameter
 */
router.get('/api/teams/:id/reports', reportsController.getTeamReports.bind(reportsController));

module.exports = router;
