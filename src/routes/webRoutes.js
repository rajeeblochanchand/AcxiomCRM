const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const customerController = require('../controllers/customerController');
const leadController = require('../controllers/leadController');
const opportunityController = require('../controllers/opportunityController');
const followUpController = require('../controllers/followUpController');
const activityController = require('../controllers/activityController');
const userController = require('../controllers/userController');
const reportController = require('../controllers/reportController');

const router = express.Router();

router.get('/login', authController.loginPage);
router.post('/login', authController.login);
router.get('/register', authController.registerPage);
router.post('/register', authController.register);
router.post('/logout', requireAuth, authController.logout);

router.get('/', requireAuth, (req, res) => res.redirect('/dashboard'));
router.get('/dashboard', requireAuth, dashboardController.page);

router.get('/customers', requireAuth, customerController.listPage);
router.get('/customers/new', requireAuth, customerController.newPage);
router.post('/customers', requireAuth, customerController.create);
router.get('/customers/:id/edit', requireAuth, customerController.editPage);
router.post('/customers/:id', requireAuth, customerController.update);
router.post('/customers/:id/delete', requireAuth, customerController.remove);
router.get('/customers/:id', requireAuth, customerController.detailPage);

router.get('/leads', requireAuth, leadController.listPage);
router.get('/leads/new', requireAuth, leadController.newPage);
router.post('/leads', requireAuth, leadController.create);
router.get('/leads/:id/edit', requireAuth, leadController.editPage);
router.post('/leads/:id/convert', requireAuth, leadController.convert);
router.post('/leads/:id', requireAuth, leadController.update);
router.get('/leads/:id', requireAuth, leadController.detailPage);

router.get('/opportunities', requireAuth, opportunityController.listPage);
router.get('/opportunities/new', requireAuth, opportunityController.newPage);
router.post('/opportunities', requireAuth, opportunityController.create);
router.get('/opportunities/:id/edit', requireAuth, opportunityController.editPage);
router.post('/opportunities/:id', requireAuth, opportunityController.update);
router.get('/opportunities/:id', requireAuth, opportunityController.detailPage);

router.get('/followups', requireAuth, followUpController.listPage);
router.get('/followups/new', requireAuth, followUpController.newPage);
router.post('/followups', requireAuth, followUpController.create);
router.post('/followups/:id/complete', requireAuth, followUpController.complete);
router.post('/followups/:id/reschedule', requireAuth, followUpController.reschedule);

router.get('/activities', requireAuth, activityController.listPage);
router.get('/activities/new', requireAuth, activityController.newPage);
router.post('/activities', requireAuth, activityController.create);
router.post('/activities/:id/status', requireAuth, activityController.updateStatus);

router.get('/users', requireAuth, requireRole('Admin'), userController.listPage);
router.post('/users', requireAuth, requireRole('Admin'), userController.create);
router.post('/users/:id/role', requireAuth, requireRole('Admin'), userController.updateRole);
router.post('/users/:id/toggle', requireAuth, requireRole('Admin'), userController.toggleActive);
router.post('/users/:id/lockout', requireAuth, requireRole('Admin'), userController.toggleLockout);

router.get('/audit', requireAuth, requireRole('Admin'), userController.auditPage);
router.get('/reports', requireAuth, reportController.page);

module.exports = router;
