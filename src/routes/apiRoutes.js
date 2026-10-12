const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  customerValidator,
  leadValidator,
  opportunityValidator,
  followUpValidator
} = require('../middleware/validator');
const api = require('../controllers/apiController');

const router = express.Router();

router.post('/auth/login', api.login);
router.post('/auth/logout', requireAuth, api.logout);

router.get('/customers', requireAuth, api.listCustomers);
router.get('/customers/:id', requireAuth, api.getCustomer);
router.post('/customers', requireAuth, customerValidator(), api.createCustomer);
router.put('/customers/:id', requireAuth, customerValidator({ excludeIdFromParam: true }), api.updateCustomer);
router.delete('/customers/:id', requireAuth, api.deleteCustomer);

router.get('/leads', requireAuth, api.listLeads);
router.post('/leads', requireAuth, leadValidator(), api.createLead);

router.get('/opportunities', requireAuth, api.listOpportunities);
router.post('/opportunities', requireAuth, opportunityValidator(), api.createOpportunity);

router.get('/followups', requireAuth, api.listFollowUps);
router.post('/followups', requireAuth, followUpValidator({ isNew: true }), api.createFollowUp);

router.get('/reports/pipeline', requireAuth, requireRole('Admin', 'Manager'), api.pipelineReport);

module.exports = router;
