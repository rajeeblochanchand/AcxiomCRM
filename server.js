require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const cors = require('cors');
require('./src/data/db');

const webRoutes = require('./src/routes/webRoutes');
const apiRoutes = require('./src/routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors({ origin: true, credentials: true }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    name: 'acxiom.sid',
    secret: process.env.SESSION_SECRET || 'acxiom-crm-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') req.body[key] = req.body[key].trim();
    });
  }
  next();
});

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.activePath = req.path;
  res.locals.query = req.query;
  res.locals.formatCurrency = (value) => {
    const amount = Number(value || 0);
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };
  res.locals.formatDate = (value) => {
    if (!value) return '—';
    const text = String(value);
    return text.slice(0, 10);
  };
  res.locals.pillClass = (status) => {
    const value = String(status || '').toLowerCase();
    if (['active', 'won', 'converted', 'completed'].includes(value)) return 'pill pill-green';
    if (['planned', 'proposal', 'qualification', 'new', 'contacted', 'open', 'qualified'].includes(value)) return 'pill pill-amber';
    if (['lost', 'missed', 'inactive', 'unqualified', 'cancelled', 'overdue'].includes(value)) return 'pill pill-red';
    if (['negotiation'].includes(value)) return 'pill pill-blue';
    return 'pill pill-slate';
  };
  res.locals.isActive = (href) => {
    if (href === '/dashboard') return req.path === '/dashboard';
    return req.path === href || req.path.startsWith(`${href}/`);
  };
  next();
});

app.use('/api', apiRoutes);
app.use('/', webRoutes);

app.use((req, res) => {
  if (req.originalUrl.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!req.session.user) return res.redirect('/login');
  res.status(404).render('layout', { title: 'Not found', view: 'partials/notfound' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.originalUrl.startsWith('/api') || (req.headers.accept || '').includes('application/json')) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  res.status(500).send('Internal server error');
});

app.listen(PORT, () => {
  console.log(`AcxiomCRM running at http://localhost:${PORT}`);
});
