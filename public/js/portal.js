    const queryParams = new URLSearchParams(window.location.search);
    const TOKEN = queryParams.get('token') || '';
    const rawLang = queryParams.get('lang') || 'en';
    const LANG = rawLang === 'de' ? 'de' : 'en';
    const I18N = {
      en: {
        title: 'OpenApprove Portal',
        subtitle: 'Token-based portal views for customer and uploader.',
        customer: 'Customer Processes',
        my: 'My Uploads',
        company: 'Company Uploads',
        loading: 'Loading...',
        missingToken: 'Missing token in URL.'
      },
      de: {
        title: 'OpenApprove Portal',
        subtitle: 'Token-basierte Portalsichten für Kunde und Uploader.',
        customer: 'Kundenprozesse',
        my: 'Meine Uploads',
        company: 'Firmen-Uploads',
        loading: 'Lade...',
        missingToken: 'Token in URL fehlt.'
      }
    };
    const L = I18N[LANG] || I18N.en;
    document.getElementById('title').innerText = L.title;
    document.getElementById('subtitle').innerText = L.subtitle;
    document.getElementById('listCustomer').innerText = L.customer;
    document.getElementById('listMyUploads').innerText = L.my;
    document.getElementById('listCompanyUploads').innerText = L.company;
    function showError(message) {
      const el = document.getElementById('error');
      el.style.display = 'block';
      el.textContent = message;
    }
    function setStatus(message) {
      const el = document.getElementById('status');
      if (!message) {
        el.style.display = 'none';
        el.textContent = '';
        return;
      }
      el.style.display = 'block';
      el.textContent = message;
    }
    async function load(path) {
      if (!TOKEN) {
        setStatus('');
        return showError(L.missingToken);
      }
      setStatus(L.loading);
      const res = await fetch(path + '?token=' + TOKEN);
      const data = await res.json().catch(() => ({}));
      const err = document.getElementById('error');
      err.style.display = 'none';
      const el = document.getElementById('results');
      el.innerHTML = '';
      if (!res.ok) {
        setStatus('');
        if (res.status === 401) return showError('Invalid or expired token.');
        if (res.status === 403) return showError('Permission denied for this portal view.');
        if (res.status === 404) return showError('Requested resource no longer exists.');
        return showError(data.error || 'Request failed.');
      }
      const rows = data.data || [];
      if (rows.length === 0) {
        setStatus('No entries found.');
        return;
      }
      setStatus('');
      const card = document.createElement('div');
      card.className = 'card';
      rows.forEach(item => {
        const row = document.createElement('div');
        row.className = 'row';
        row.innerHTML =
          '<div><strong>Project ' + (item.projectNumber || '-') + '</strong><div>Customer: ' + (item.customerNumber || '-') + '</div></div>' +
          '<div><div class="pill">' + (item.status || '-') + '</div><div>' + new Date(item.createdAt).toLocaleString() + '</div></div>';
        card.appendChild(row);
      });
      el.appendChild(card);
    }
    document.getElementById('listCustomer').addEventListener('click', () => load('/api/portal/processes'));
    document.getElementById('listMyUploads').addEventListener('click', () => load('/api/portal/my-uploads'));
    document.getElementById('listCompanyUploads').addEventListener('click', () => load('/api/portal/company-uploads'));
    if (!TOKEN) {
      showError(L.missingToken);
    }
