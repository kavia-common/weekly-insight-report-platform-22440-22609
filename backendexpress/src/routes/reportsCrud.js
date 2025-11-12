'use strict';

const express = require('express');
const controller = require('../controllers/reportsController');
const selfTestController = require('../controllers/reportsSelfTest');
const reportsDiagnosticsController = require('../controllers/reportsControllerDiagnostics');
const reportsUserCheckController = require('../controllers/reportsUserCheck');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: WeeklyReports
 *     description: CRUD for weekly reports (Supabase-backed)
 */

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Create a weekly report
 *     description: Create a weekly report. Authentication is not yet enforced. TODO to bind to Google auth and derive userId from req.user.id.
 *     tags: [WeeklyReports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, weekOf]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The author user id (temporary until auth integration)
 *               weekOf:
 *                 type: string
 *                 description: ISO date string YYYY-MM-DD representing week start
 *                 example: "2025-01-06"
 *               content:
 *                 type: string
 *               blockers:
 *                 type: string
 *               plans:
 *                 type: string
 *     responses:
 *       201:
 *         description: Report created
 *       400:
 *         description: Invalid payload or user does not exist
 *       503:
 *         description: Database not ready (table missing or Supabase not configured)
 */
router.post('/api/reports', controller.create.bind(controller));

/**
 * @swagger
 * /api/reports/selftest:
 *   post:
 *     summary: Self-test insert (service role)
 *     description: >
 *       Attempts to insert a test report using the server-side Supabase service role client.
 *       Requires an existing auth.users UUID (schema-targeted) and does not upsert into public.users.
 *     tags: [WeeklyReports]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Existing UUID from auth.users to use for the self-test.
 *     responses:
 *       201:
 *         description: Self-test succeeded (report inserted)
 *       400:
 *         description: Invalid UUID or user not found in auth.users
 *       503:
 *         description: Supabase not configured
 *       500:
 *         description: Unexpected server error
 */
router.post('/api/reports/selftest', selfTestController.selfTestInsert.bind(selfTestController));

/**
 * @swagger
 * /api/reports/{id}:
 *   get:
 *     summary: Get a report by id
 *     tags: [WeeklyReports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Report found }
 *       400: { description: Bad request }
 *       503: { description: Database not ready }
 */
router.get('/api/reports/:id', controller.getById.bind(controller));

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: List reports (recent or by user)
 *     description: If userId is provided, returns that user's paginated reports. Otherwise returns recent reports site-wide.
 *     tags: [WeeklyReports]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *         required: false
 *         description: Filter by author user id
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated reports
 *       400:
 *         description: Bad request
 *       503:
 *         description: Database not ready
 */
router.get('/api/reports', controller.list.bind(controller));

/**
 * @swagger
 * /api/reports/{id}:
 *   patch:
 *     summary: Update a report
 *     description: Minimal partial update. Fields: weekOf (YYYY-MM-DD), content, blockers, plans
 *     tags: [WeeklyReports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               weekOf: { type: string, description: ISO date YYYY-MM-DD }
 *               content: { type: string }
 *               blockers: { type: string }
 *               plans: { type: string }
 *     responses:
 *       200: { description: Report updated }
 *       400: { description: Invalid payload }
 *       503: { description: Database not ready }
 */
router.patch('/api/reports/:id', controller.patch.bind(controller));

/**
 * @swagger
 * /api/reports/{id}:
 *   delete:
 *     summary: Delete a report
 *     tags: [WeeklyReports]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: Deleted }
 *       400: { description: Invalid id }
 *       503: { description: Database not ready }
 */
router.delete('/api/reports/:id', controller.remove.bind(controller));

/**
 * @swagger
 * /api/reports/diagnostics:
 *   get:
 *     summary: Reports diagnostics
 *     description: Returns non-sensitive diagnostics including SUPABASE_URL host and schema-qualified path used for auth.users checks.
 *     tags: [WeeklyReports]
 *     responses:
 *       200:
 *         description: Diagnostics payload
 */
router.get('/api/reports/diagnostics', reportsDiagnosticsController.get.bind(reportsDiagnosticsController));

/**
 * @swagger
 * /api/reports/users/{userId}/check:
 *   get:
 *     summary: Check if a user exists in auth.users
 *     description: >
 *       Trims and validates the provided userId as UUID and checks existence against auth.users using schema targeting
 *       with a head+count exact query. Returns non-sensitive diagnostics including Supabase host.
 *     tags: [WeeklyReports]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           description: UUID from auth.users(id)
 *     responses:
 *       200:
 *         description: Existence check completed
 *       400:
 *         description: Invalid UUID or verification error
 *       503:
 *         description: Supabase not configured
 */
router.get('/api/reports/users/:userId/check', reportsUserCheckController.check.bind(reportsUserCheckController));

module.exports = router;
