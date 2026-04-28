// State module - handles live state management, WebSocket, and UI updates
export const Estado = {
  // Utilities
  async postJSON(url, payload) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.json();
  },

  async fetchJSON(url) {
    return fetch(url).then(r => r.json());
  },

  escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  fmtTime(ts) {
    const d = new Date(ts);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map(v => String(v).padStart(2, '0')).join(':');
  },

  // Queue state management
  async refreshQueue() {
    const data = await this.fetchJSON('/api/queue');
    const pending = document.getElementById('pending');
    const queueState = document.getElementById('queueState');
    const currentMessage = document.getElementById('currentMessage');
    if (pending) pending.textContent = String(data.pendingCount ?? 0);
    if (queueState) queueState.textContent = `Estado: ${data.state || 'unknown'}`;
    if (currentMessage) {
      currentMessage.textContent = data.current 
        ? `Actual: ${data.current.id.slice(0, 8)} · ${data.current.text}` 
        : 'Actual: ninguno';
    }
  },

  // History rendering with search/filter
  async refreshHistory() {
    const search = document.getElementById('search');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const history = document.getElementById('history');

    const params = new URLSearchParams();
    if (search && search.value.trim()) params.set('q', search.value.trim());
    if (statusFilter && statusFilter.value !== 'all') params.set('status', statusFilter.value);
    if (sourceFilter && sourceFilter.value !== 'all') params.set('source', sourceFilter.value);

    const items = await this.fetchJSON(`/api/history?${params.toString()}`);
    if (history) {
      history.innerHTML = items.map(item => {
        const shortText = (item.text || '').slice(0, 40);
        const reason = item.error_msg || '';
        return `<tr>
          <td>${item.id.slice(0, 8)}</td>
          <td title="${this.escapeHtml(item.text || '')}">${this.escapeHtml(shortText)}${(item.text || '').length > 40 ? '…' : ''}</td>
          <td>${this.escapeHtml(item.source || '')}</td>
          <td class="${item.status || ''}">${this.escapeHtml(item.status || '')}</td>
          <td title="${this.escapeHtml(reason)}">${this.escapeHtml(reason ? reason.slice(0, 28) : '')}</td>
          <td>${item.retries ?? 0}</td>
          <td>${this.fmtTime(item.created_at)}</td>
          <td>
            <div class="actions">
              <button data-action="replay" data-id="${item.id}">Replay</button>
              ${item.status === 'SKIPPED' ? `<button data-action="restore" data-id="${item.id}">Restore</button>` : ''}
              ${['PENDING','QUEUED','SYNTHESIZING','READY','PLAYING','PAUSED'].includes(item.status) ? `<button data-action="cancel" data-id="${item.id}">Cancel</button>` : ''}
              <button data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>`;
      }).join('');
    }
  },

  // Volume control
  async refreshVolume() {
    const data = await this.fetchJSON('/api/audio-volume');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeValue = document.getElementById('volumeValue');
    const volumeStatus = document.getElementById('volumeStatus');
    const vol = data.volume ?? 1.0;
    if (volumeSlider) volumeSlider.value = vol;
    if (volumeValue) volumeValue.textContent = `${Math.round(vol * 100)}%`;
    if (volumeStatus) volumeStatus.textContent = `Volumen: ${Math.round(vol * 100)}%`;
  },

  async saveVolume(vol) {
    const data = await this.postJSON('/api/audio-volume', { volume: vol });
    const volumeValue = document.getElementById('volumeValue');
    const volumeStatus = document.getElementById('volumeStatus');
    if (volumeValue) volumeValue.textContent = `${Math.round(data.volume * 100)}%`;
    if (volumeStatus) volumeStatus.textContent = `Guardado: ${Math.round(data.volume * 100)}%`;
  },

  // Playback controls
  async runAction(action, id) {
    if (action === 'delete' && !confirm('¿Borrar este mensaje?')) return;
    if (action === 'cancel') {
      const reason = prompt('Motivo del cancelado', 'CANCELLED BY STREAMER') || 'CANCELLED BY STREAMER';
      await this.postJSON(`/api/message/${id}/cancel`, { reason });
      return;
    }
    if (action === 'delete') {
      await fetch(`/api/message/${id}`, { method: 'DELETE' });
      return;
    }
    await fetch(`/api/message/${id}/${action}`, { method: 'POST' });
  },

  // Send message
  async sendMessage() {
    const text = document.getElementById('text');
    const donor = document.getElementById('donor');
    const amount = document.getElementById('amount');
    if (!text) return;

    const body = {
      text: text.value,
      source: 'manual',
      donor_name: donor && donor.value.trim() ? donor.value.trim() : null,
      amount: amount && amount.value.trim() ? Number(amount.value) : null
    };
    await this.postJSON('/api/message', body);
    if (text) text.value = '';
    if (donor) donor.value = '';
    if (amount) amount.value = '';
    await this.refreshQueue();
    await this.refreshHistory();
  },

  // Initialize state module
  init() {
    const text = document.getElementById('text');
    const donor = document.getElementById('donor');
    const amount = document.getElementById('amount');
    const sendBtn = document.getElementById('send');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeReset = document.getElementById('volumeReset');
    const volumeUp = document.getElementById('volumeUp');
    const volumeDown = document.getElementById('volumeDown');
    const search = document.getElementById('search');
    const statusFilter = document.getElementById('statusFilter');
    const sourceFilter = document.getElementById('sourceFilter');
    const applyFilters = document.getElementById('applyFilters');
    const refreshNow = document.getElementById('refreshNow');
    const historyEl = document.getElementById('history');

    let autoRefreshTimer = null;
    let volumeTimer = null;

    // Send button
    if (sendBtn) {
      sendBtn.addEventListener('click', async () => {
        await this.sendMessage();
      });
    }

    // Playback control buttons
    document.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const action = button.dataset.action;
        if (action === 'replay' || action === 'restore' || action === 'cancel' || action === 'delete') return;
        await this.postJSON(`/api/control/${action}`, {});
        await this.refreshQueue();
      });
    });

    // History actions
    if (historyEl) {
      historyEl.addEventListener('click', async event => {
        const button = event.target.closest('button[data-action][data-id]');
        if (!button) return;
        await this.runAction(button.dataset.action, button.dataset.id);
        await this.refreshQueue();
        await this.refreshHistory();
      });
    }

    // Filters
    if (applyFilters) {
      applyFilters.addEventListener('click', async () => {
        await this.refreshHistory();
      });
    }
    if (refreshNow) {
      refreshNow.addEventListener('click', async () => {
        await this.refreshQueue();
        await this.refreshHistory();
        await this.refreshVolume();
      });
    }

    // Volume controls
    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        clearTimeout(volumeTimer);
        volumeTimer = setTimeout(() => {
          this.saveVolume(parseFloat(volumeSlider.value));
        }, 150);
      });
    }
    if (volumeReset) {
      volumeReset.addEventListener('click', () => {
        if (volumeSlider) volumeSlider.value = 1.0;
        this.saveVolume(1.0);
      });
    }
    if (volumeUp) {
      volumeUp.addEventListener('click', () => {
        const newVol = Math.min(2.0, parseFloat(volumeSlider.value) + 0.1);
        if (volumeSlider) volumeSlider.value = newVol;
        this.saveVolume(newVol);
      });
    }
    if (volumeDown) {
      volumeDown.addEventListener('click', () => {
        const newVol = Math.max(0.0, parseFloat(volumeSlider.value) - 0.1);
        if (volumeSlider) volumeSlider.value = newVol;
        this.saveVolume(newVol);
      });
    }

    // WebSocket for live updates
    const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = location.port ? `:${location.port}` : '';
    const ws = new WebSocket(`${wsProtocol}//${location.hostname}${wsPort}/ws?client=panel`);
    ws.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.type === 'queue:updated') this.refreshQueue();
      if (data.type === 'message:done' || data.type === 'message:failed' || data.type === 'queue:stopped') {
        this.refreshHistory();
        this.refreshQueue();
      }
    });

    // Auto-refresh
    autoRefreshTimer = setInterval(async () => {
      await this.refreshHistory();
      await this.refreshQueue();
    }, 2000);

    // Initial load
    this.refreshHistory();
    this.refreshQueue();
    this.refreshVolume();
  }
};
