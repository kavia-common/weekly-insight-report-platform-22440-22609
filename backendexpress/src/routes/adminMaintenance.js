'use strict';

const express = require('express');
const controller = require('../controllers/adminMaintenance');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: AdminMaintenance
 *     description: Operational maintenance for admins
 */

/**
 * @swagger
 * /api/admin/maintenance/refresh-latest-reports:
 *   get:
 *     summary: Refresh materialized view latest_user_reports
 *     description: >
 *       Triggers a refresh of the MV public.latest_user_reports. Attempts a concurrent refresh by default,
 *       which requires a unique index on the MV. If concurrent refresh fails due to index/constraint issues,
 *       the system falls back to a non-concurrent refresh.
 *     tags: [AdminMaintenance]
 *     parameters:
 *       - in: query
 *         name: concurrent
 *         required: false
 *         schema: { type: boolean, default: true }
 *         description: Attempt concurrent refresh first (requires unique index on MV)
 *     responses:
 *       200:
 *         description: Refresh started and completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 refreshed: { type: boolean }
 *                 concurrent: { type: boolean, description: "Whether concurrent refresh was used" }
 *       500:
 *         description: Error executing refresh
 *       503:
 *         description: Supabase not configured
 */
router.get('/api/admin/maintenance/refresh-latest-reports', controller.refreshLatestReportsMV.bind(controller));

module.exports = router;
