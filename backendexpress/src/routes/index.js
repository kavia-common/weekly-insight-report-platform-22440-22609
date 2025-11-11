const express = require('express');
const healthController = require('../controllers/health');
const supabaseHealthController = require('../controllers/supabaseHealth');
const reportsRoutes = require('./reports');
const reportsCrudRoutes = require('./reportsCrud');
const adminMaintenanceRoutes = require('./adminMaintenance');

const router = express.Router();
// Health endpoint

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

/**
 * @swagger
 * /api/health/supabase:
 *   get:
 *     summary: Supabase health
 *     description: Returns Supabase configuration presence and connectivity status. Does not leak secret values.
 *     responses:
 *       200:
 *         description: Supabase health payload
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 configured:
 *                   type: boolean
 *                 status:
 *                   type: integer
 *                   description: HTTP status from Supabase edge (when reachable)
 *                 statusText:
 *                   type: string
 *                 error:
 *                   type: string
 *                 env:
 *                   type: object
 *                   properties:
 *                     SUPABASE_URL_present:
 *                       type: boolean
 *                     SUPABASE_SERVICE_ROLE_KEY_present:
 *                       type: boolean
 *                 keySource:
 *                   type: string
 *                   description: Which env var provided the key (diagnostic only)
 */
router.get('/api/health/supabase', supabaseHealthController.check.bind(supabaseHealthController));

// Mount existing read-only demo routes
router.use('/', reportsRoutes);

/* Mount new CRUD routes */
router.use('/', reportsCrudRoutes);

/* Mount admin maintenance routes */
router.use('/', adminMaintenanceRoutes);

module.exports = router;
