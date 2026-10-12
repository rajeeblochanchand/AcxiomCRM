(function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^[0-9]{10}$/;
  const SPECIAL_RE = /[!@#$%^&*(),.?":{}|<>]/;
  const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Unqualified', 'Converted', 'Lost'];

  function todayIso() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function setError(form, field, message) {
    const el = form.querySelector(`[data-error-for="${field}"]`);
    if (el) el.textContent = message || '';
  }

  function clearErrors(form) {
    form.querySelectorAll('.field-error').forEach((el) => {
      el.textContent = '';
    });
  }

  function passwordError(value) {
    if (!value || value.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(value)) return 'Password must contain at least one digit.';
    if (!SPECIAL_RE.test(value)) return 'Password must contain at least one special symbol.';
    return '';
  }

  function validate(form) {
    const type = form.getAttribute('data-validate');
    const data = new FormData(form);
    const errors = {};
    const get = (name) => (data.get(name) || '').toString().trim();

    if (type === 'auth') {
      if (!EMAIL_RE.test(get('Email'))) errors.Email = 'Enter a valid email address.';
      if (!get('Password')) errors.Password = 'Password is required.';
    }

    if (type === 'register') {
      if (!get('Name')) errors.Name = 'Name is required.';
      if (!EMAIL_RE.test(get('Email'))) errors.Email = 'Enter a valid email address.';
      const pwd = passwordError(get('Password'));
      if (pwd) errors.Password = pwd;
      if (form.querySelector('[name="ConfirmPassword"]') && get('Password') !== get('ConfirmPassword')) {
        errors.ConfirmPassword = 'Passwords do not match.';
      }
    }

    if (type === 'customer') {
      if (!get('CustomerName')) errors.CustomerName = 'Customer Name is required.';
      else if (get('CustomerName').length > 100) errors.CustomerName = 'Customer Name must be at most 100 characters.';
      if (!EMAIL_RE.test(get('Email'))) errors.Email = 'Enter a valid email address.';
      if (!PHONE_RE.test(get('Phone'))) errors.Phone = 'Phone must be a 10-digit numeric value.';
    }

    if (type === 'lead') {
      if (!get('LeadName')) errors.LeadName = 'Lead Name is required.';
      if (!EMAIL_RE.test(get('Email'))) errors.Email = 'Enter a valid email address.';
      if (!PHONE_RE.test(get('Phone'))) errors.Phone = 'Phone must be a 10-digit numeric value.';
      if (!LEAD_STATUSES.includes(get('Status'))) errors.Status = 'Invalid lead status.';
      const expected = Number(get('ExpectedValue'));
      if (Number.isNaN(expected) || expected < 0) errors.ExpectedValue = 'Expected value must be numeric and at least 0.';
    }

    if (type === 'opportunity') {
      if (!get('OpportunityName')) errors.OpportunityName = 'Opportunity name is required.';
      const amount = Number(get('Amount'));
      if (Number.isNaN(amount) || amount <= 0) errors.Amount = 'Opportunity Amount must be greater than 0.';
      const probability = Number(get('Probability'));
      if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
        errors.Probability = 'Probability must be between 0 and 100.';
      }
      const close = get('ExpectedCloseDate');
      const stage = get('Stage');
      if (!close) errors.ExpectedCloseDate = 'Expected Close Date is required.';
      else if (!['Won', 'Lost'].includes(stage) && close < todayIso()) {
        errors.ExpectedCloseDate = 'Expected Close Date cannot be in the past.';
      }
    }

    if (type === 'followup' || type === 'followup-reschedule') {
      const date = get('FollowUpDate');
      if (!date) errors.FollowUpDate = 'Follow-up date is required.';
      else if (date < todayIso()) errors.FollowUpDate = 'Follow-up date cannot be earlier than today.';
      if (type === 'followup' && !get('CustomerId') && !get('LeadId')) {
        errors.CustomerId = 'Select a customer or a lead.';
      }
    }

    if (type === 'activity') {
      if (!get('Subject')) errors.Subject = 'Subject is required.';
      if (!get('ActivityDate')) errors.ActivityDate = 'Activity date is required.';
    }

    return errors;
  }

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.hasAttribute('data-validate')) return;
    clearErrors(form);
    const errors = validate(form);
    const keys = Object.keys(errors);
    if (keys.length) {
      event.preventDefault();
      keys.forEach((key) => setError(form, key, errors[key]));
    }
  });

  document.addEventListener('click', (event) => {
    const openBtn = event.target.closest('[data-open-modal]');
    if (openBtn) {
      const modal = document.getElementById(openBtn.getAttribute('data-open-modal'));
      if (modal) modal.hidden = false;
    }
    if (event.target.matches('[data-close-modal]') || event.target.classList.contains('modal')) {
      const modal = event.target.closest('.modal') || event.target;
      if (modal && modal.classList.contains('modal')) modal.hidden = true;
    }
  });

  function updateWeighted() {
    const amount = Number(document.querySelector('[name="Amount"]')?.value || 0);
    const probability = Number(document.querySelector('[name="Probability"]')?.value || 0);
    const preview = document.getElementById('weighted-preview');
    if (!preview) return;
    const weighted = (amount * probability) / 100;
    preview.textContent = Number.isFinite(weighted) ? weighted.toLocaleString('en-IN') : '—';
  }
  document.addEventListener('input', (event) => {
    if (event.target.matches('[name="Amount"], [name="Probability"]')) updateWeighted();
  });
  updateWeighted();
})();
