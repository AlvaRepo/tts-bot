// Config module - handles configuration save/load with debounce
export const Config = {
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

  // Audio profile
  async refreshAudioProfile() {
    const data = await this.fetchJSON('/api/audio-profile');
    const audioProfile = document.getElementById('audioProfile');
    const audioProfileStatus = document.getElementById('audioProfileStatus');
    if (audioProfile) audioProfile.value = data.preference || 'auto';
    if (audioProfileStatus) audioProfileStatus.textContent = `Activo: ${data.effective || 'auto'} · aplica tras reiniciar`;
  },

  async saveAudioProfile() {
    const audioProfile = document.getElementById('audioProfile');
    const audioProfileStatus = document.getElementById('audioProfileStatus');
    if (!audioProfile || !audioProfileStatus) return;
    
    const data = await this.postJSON('/api/audio-profile', { preference: audioProfile.value });
    audioProfileStatus.textContent = `Guardado: ${data.preference} · activo tras reiniciar`;
  },

  // Filters
  async refreshFilters() {
    const data = await this.fetchJSON('/api/filters');
    const filterEnabled = document.getElementById('filterEnabled');
    const filterBlacklist = document.getElementById('filterBlacklist');
    const filterStatus = document.getElementById('filterStatus');
    if (filterEnabled) filterEnabled.checked = Boolean(data.enabled);
    if (filterBlacklist) filterBlacklist.value = Array.isArray(data.blacklist) ? data.blacklist.join(', ') : '';
    if (filterStatus) filterStatus.textContent = `Filtro ${data.enabled ? 'activo' : 'inactivo'} · ${Array.isArray(data.blacklist) ? data.blacklist.length : 0} palabras`;
  },

  async saveFilters() {
    const filterEnabled = document.getElementById('filterEnabled');
    const filterBlacklist = document.getElementById('filterBlacklist');
    const filterStatus = document.getElementById('filterStatus');
    if (!filterEnabled || !filterBlacklist || !filterStatus) return;

    const blacklist = filterBlacklist.value.split(',').map(item => item.trim()).filter(Boolean);
    const data = await this.postJSON('/api/filters', { enabled: filterEnabled.checked, blacklist });
    filterStatus.textContent = `Filtro ${data.enabled ? 'activo' : 'inactivo'} · ${data.blacklist.length} palabras`;
  },

  // Voice
  async refreshVoice() {
    const data = await this.fetchJSON('/api/tts-voice');
    const ttsVoice = document.getElementById('ttsVoice');
    const customVoice = document.getElementById('customVoice');
    const voiceStatus = document.getElementById('voiceStatus');
    
    const voices = Array.isArray(data.available) ? data.available : [];
    if (ttsVoice) {
      ttsVoice.innerHTML = voices.map(v => `<option value="${v}">${v}</option>`).join('') + '<option value="__custom__">Custom</option>';
    }
    if (voices.includes(data.voice)) {
      if (ttsVoice) ttsVoice.value = data.voice;
      if (customVoice) customVoice.value = data.voice;
    } else {
      if (ttsVoice) ttsVoice.value = '__custom__';
      if (customVoice) customVoice.value = data.voice || '';
    }
    if (voiceStatus) voiceStatus.textContent = `Voz activa: ${data.voice || 'default'}`;
  },

  async saveVoice() {
    const ttsVoice = document.getElementById('ttsVoice');
    const customVoice = document.getElementById('customVoice');
    const voiceStatus = document.getElementById('voiceStatus');
    if (!ttsVoice || !customVoice || !voiceStatus) return;

    const voice = ttsVoice.value === '__custom__' ? customVoice.value.trim() : ttsVoice.value;
    const data = await this.postJSON('/api/tts-voice', { voice });
    voiceStatus.textContent = `Voz guardada: ${data.voice}`;
  },

  // Preset
  async refreshPreset() {
    const data = await this.fetchJSON('/api/tts-preset');
    const ttsPreset = document.getElementById('ttsPreset');
    const presetStatus = document.getElementById('presetStatus');
    
    const presets = data.available || {};
    if (ttsPreset) {
      ttsPreset.innerHTML = Object.entries(presets).map(([key, meta]) => `<option value="${key}">${meta.label || key}</option>`).join('');
      ttsPreset.value = data.preset || 'neutral';
    }
    const meta = presets[data.preset] || presets.neutral || {};
    if (presetStatus) presetStatus.textContent = `${meta.label || data.preset || 'neutral'} · ${meta.description || ''}`;
  },

  async savePreset() {
    const ttsPreset = document.getElementById('ttsPreset');
    const presetStatus = document.getElementById('presetStatus');
    if (!ttsPreset || !presetStatus) return;

    const data = await this.postJSON('/api/tts-preset', { preset: ttsPreset.value });
    const meta = data.available?.[data.preset] || {};
    presetStatus.textContent = `${meta.label || data.preset} · ${meta.description || ''}`;
  },

  // Bot config
  async refreshBot() {
    const data = await this.fetchJSON('/api/bot/config');
    const botEnabled = document.getElementById('botEnabled');
    const botChannel = document.getElementById('botChannel');
    const botPrefix = document.getElementById('botPrefix');
    const botSessionToken = document.getElementById('botSessionToken');
    const botAllowTtsFromChat = document.getElementById('botAllowTtsFromChat');
    const botAllowCommandsFromMods = document.getElementById('botAllowCommandsFromMods');
    const botAllowCommandsFromVip = document.getElementById('botAllowCommandsFromVip');
    const botViewerCommands = document.getElementById('botViewerCommands');
    const botModeratorCommands = document.getElementById('botModeratorCommands');
    const botStreamerCommands = document.getElementById('botStreamerCommands');
    const botStatus = document.getElementById('botStatus');

    if (botEnabled) botEnabled.checked = Boolean(data.enabled);
    if (botChannel) botChannel.value = data.channel || '';
    if (botPrefix) botPrefix.value = data.prefix || '!';
    if (botSessionToken) botSessionToken.value = data.sessionToken || '';
    if (botAllowTtsFromChat) botAllowTtsFromChat.checked = data.allowTtsFromChat !== false;
    if (botAllowCommandsFromMods) botAllowCommandsFromMods.checked = data.allowCommandsFromMods !== false;
    if (botAllowCommandsFromVip) botAllowCommandsFromVip.checked = data.allowCommandsFromVip === true;
    if (botViewerCommands) botViewerCommands.value = Array.isArray(data.viewerCommands) ? data.viewerCommands.join(',') : '';
    if (botModeratorCommands) botModeratorCommands.value = Array.isArray(data.moderatorCommands) ? data.moderatorCommands.join(',') : '';
    if (botStreamerCommands) botStreamerCommands.value = Array.isArray(data.streamerCommands) ? data.streamerCommands.join(',') : '';

    if (botStatus) {
      const status = await this.fetchJSON('/api/bot/status');
      const lastSeen = status.lastSeenAt ? new Date(status.lastSeenAt).toLocaleTimeString() : 'nunca';
      botStatus.textContent = `${status.connected ? 'online' : 'offline'} · canal: ${status.lastChannel || data.channel || '-'} · última señal: ${lastSeen}`;
    }
  },

  async saveBotConfig() {
    const botEnabled = document.getElementById('botEnabled');
    const botChannel = document.getElementById('botChannel');
    const botPrefix = document.getElementById('botPrefix');
    const botSessionToken = document.getElementById('botSessionToken');
    const botAllowTtsFromChat = document.getElementById('botAllowTtsFromChat');
    const botAllowCommandsFromMods = document.getElementById('botAllowCommandsFromMods');
    const botAllowCommandsFromVip = document.getElementById('botAllowCommandsFromVip');
    const botViewerCommands = document.getElementById('botViewerCommands');
    const botModeratorCommands = document.getElementById('botModeratorCommands');
    const botStreamerCommands = document.getElementById('botStreamerCommands');
    const botStatus = document.getElementById('botStatus');

    if (!botEnabled || !botChannel || !botPrefix) return;

    const data = await this.postJSON('/api/bot/config', {
      enabled: botEnabled.checked,
      channel: botChannel.value.trim(),
      prefix: botPrefix.value.trim() || '!',
      sessionToken: botSessionToken ? botSessionToken.value.trim() : '',
      allowTtsFromChat: botAllowTtsFromChat ? botAllowTtsFromChat.checked : false,
      allowCommandsFromMods: botAllowCommandsFromMods ? botAllowCommandsFromMods.checked : false,
      allowCommandsFromVip: botAllowCommandsFromVip ? botAllowCommandsFromVip.checked : false,
      viewerCommands: botViewerCommands ? botViewerCommands.value.split(',').map(v => v.trim()).filter(Boolean) : [],
      moderatorCommands: botModeratorCommands ? botModeratorCommands.value.split(',').map(v => v.trim()).filter(Boolean) : [],
      streamerCommands: botStreamerCommands ? botStreamerCommands.value.split(',').map(v => v.trim()).filter(Boolean) : []
    });
    if (botStatus) botStatus.textContent = `${data.enabled ? 'online ready' : 'disabled'} · canal: ${data.channel || '-'} · prefijo: ${data.prefix}`;
  },

  // Initialize config module
  init() {
    const saveAudioProfileBtn = document.getElementById('saveAudioProfile');
    const filterEnabled = document.getElementById('filterEnabled');
    const filterBlacklist = document.getElementById('filterBlacklist');
    const ttsVoice = document.getElementById('ttsVoice');
    const customVoice = document.getElementById('customVoice');
    const ttsPreset = document.getElementById('ttsPreset');
    const botElements = [document.getElementById('botEnabled'), document.getElementById('botChannel'), document.getElementById('botPrefix'), document.getElementById('botSessionToken'), document.getElementById('botAllowTtsFromChat'), document.getElementById('botAllowCommandsFromMods'), document.getElementById('botAllowCommandsFromVip'), document.getElementById('botViewerCommands'), document.getElementById('botModeratorCommands'), document.getElementById('botStreamerCommands')];

    let filtersTimer = null;
    let voiceTimer = null;
    let presetTimer = null;
    let botTimer = null;

    if (saveAudioProfileBtn) saveAudioProfileBtn.addEventListener('click', () => this.saveAudioProfile());
    
    if (filterEnabled) {
      filterEnabled.addEventListener('change', () => {
        clearTimeout(filtersTimer);
        filtersTimer = setTimeout(() => this.saveFilters(), 150);
      });
    }
    if (filterBlacklist) {
      filterBlacklist.addEventListener('input', () => {
        clearTimeout(filtersTimer);
        filtersTimer = setTimeout(() => this.saveFilters(), 350);
      });
    }

    if (ttsVoice) {
      ttsVoice.addEventListener('change', () => {
        if (ttsVoice.value === '__custom__') {
          if (customVoice) customVoice.focus();
          return;
        }
        clearTimeout(voiceTimer);
        voiceTimer = setTimeout(() => this.saveVoice(), 100);
      });
    }
    if (customVoice) {
      customVoice.addEventListener('input', () => {
        clearTimeout(voiceTimer);
        if (ttsVoice && ttsVoice.value !== '__custom__') ttsVoice.value = '__custom__';
        voiceTimer = setTimeout(() => this.saveVoice(), 350);
      });
    }

    if (ttsPreset) {
      ttsPreset.addEventListener('change', () => {
        clearTimeout(presetTimer);
        presetTimer = setTimeout(() => this.savePreset(), 120);
      });
    }

    botElements.forEach(el => {
      if (!el) return;
      el.addEventListener('change', () => {
        clearTimeout(botTimer);
        botTimer = setTimeout(() => this.saveBotConfig(), 150);
      });
      if ((el.tagName === 'INPUT' && el.type === 'text') || el.tagName === 'TEXTAREA') {
        el.addEventListener('input', () => {
          clearTimeout(botTimer);
          botTimer = setTimeout(() => this.saveBotConfig(), 300);
        });
      }
    });

    // Initial load
    this.refreshAudioProfile();
    this.refreshFilters();
    this.refreshVoice();
    this.refreshPreset();
    this.refreshBot();
  }
};
