class RfidJukeboxPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadTags();
      this._loadConfig();
    }
  }

  async _searchMedia() {
    const query = this.querySelector("#search-query").value.trim();
    if (!query) return;
    const list = this.querySelector("#search-results");
    const showMessage = (message) => {
      const item = document.createElement("li");
      item.className = "search-message";
      item.textContent = message;
      list.replaceChildren(item);
    };
    showMessage("Ricerca in corso...");
    try {
      const { results } = await this._hass.callWS({
        type: "rfid_jukebox/search_media",
        query,
      });
      if (!results.length) {
        showMessage("Nessun risultato.");
        return;
      }
      list.replaceChildren();
      for (const r of results) {
        const li = document.createElement("li");
        li.className = "search-result";
        const button = document.createElement("button");
        button.className = "result-button";
        button.type = "button";
        const title = document.createElement("span");
        title.className = "result-title";
        title.textContent = r.name;
        button.appendChild(title);
        if (r.artist) {
          const artist = document.createElement("span");
          artist.className = "result-artist";
          artist.textContent = r.artist;
          button.appendChild(artist);
        }
        button.addEventListener("click", () => {
          this.querySelector("#new-title").value = r.artist
            ? `${r.name} — ${r.artist}`
            : r.name;
          this.querySelector("#new-media").value = r.uri;
        });
        li.appendChild(button);
        list.appendChild(li);
      }
    } catch (err) {
      showMessage(`Errore: ${err.message || err}`);
    }
  }

  async _loadTags() {
    this._tags = await this._hass.callWS({ type: "rfid_jukebox/list" });
    this._renderTable();
  }

  async _loadConfig() {
    const config = await this._hass.callWS({ type: "rfid_jukebox/get_config" });
    const el = this.querySelector("#default-player");
    el.textContent = config.default_media_player
      ? config.default_media_player
      : "non impostato";
  }

  async _saveTag(tagId, title, mediaContentId) {
    await this._hass.callWS({
      type: "rfid_jukebox/save",
      tag_id: tagId,
      title,
      media_content_id: mediaContentId,
    });
    await this._loadTags();
  }

  async _deleteTag(tagId) {
    await this._hass.callWS({ type: "rfid_jukebox/delete", tag_id: tagId });
    await this._loadTags();
  }

  _render() {
    this.innerHTML = `
      <style>
        rfid-jukebox-panel {
          display: block;
          padding: 28px clamp(16px, 4vw, 48px) 48px;
          color: var(--primary-text-color);
          font-family: var(--paper-font-body1_-_font-family, sans-serif);
        }
        * { box-sizing: border-box; }
        .jukebox { max-width: 1160px; margin: 0 auto; }
        .page-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 4px 0 26px;
        }
        .heading { display: flex; align-items: center; gap: 14px; }
        .heading-icon {
          display: grid;
          place-items: center;
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          color: var(--primary-color);
          background: color-mix(in srgb, var(--primary-color) 12%, var(--card-background-color));
          border-radius: 14px;
        }
        .heading-icon ha-icon { --mdc-icon-size: 25px; }
        h1, h2, p { margin: 0; }
        h1 { font-size: 26px; line-height: 1.2; font-weight: 600; }
        h2 { font-size: 18px; line-height: 1.35; font-weight: 600; }
        .player-status {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 190px;
          max-width: 40%;
          padding: 10px 14px;
          background: var(--secondary-background-color);
          border-left: 3px solid var(--primary-color);
          border-radius: 3px;
        }
        .player-label { color: var(--secondary-text-color); font-size: 12px; }
        #default-player { overflow-wrap: anywhere; font-size: 14px; font-weight: 600; }
        .section { padding: 24px 0; border-top: 1px solid var(--divider-color); }
        .section-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .section-meta { display: flex; align-items: center; gap: 10px; }
        .count { color: var(--secondary-text-color); font-size: 13px; }
        .icon-button { width: 40px; min-width: 40px; padding: 8px; }
        .table-wrap { overflow-x: auto; border: 1px solid var(--divider-color); border-radius: 6px; }
        table { width: 100%; min-width: 760px; border-collapse: collapse; }
        th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid var(--divider-color); }
        th { color: var(--secondary-text-color); background: var(--secondary-background-color); font-size: 12px; font-weight: 600; }
        tbody tr:last-child td { border-bottom: 0; }
        tbody tr:hover { background: color-mix(in srgb, var(--primary-color) 4%, var(--card-background-color)); }
        .tag-id { min-width: 150px; font-family: var(--paper-font-code1_-_font-family, monospace); font-size: 13px; overflow-wrap: anywhere; }
        .table-input, input {
          width: 100%;
          min-width: 0;
          min-height: 40px;
          padding: 9px 11px;
          color: var(--primary-text-color);
          background: var(--card-background-color);
          border: 1px solid var(--divider-color);
            tbody tr.pending-row { background: color-mix(in srgb, var(--warning-color, #e6a23c) 8%, var(--card-background-color)); }
            .pending-label { display: block; margin-top: 5px; color: var(--warning-color, #a56600); font-family: var(--paper-font-body1_-_font-family, sans-serif); font-size: 12px; }
          font: inherit;
        }
        input:focus { outline: 2px solid var(--primary-color); outline-offset: 1px; }
        .actions { display: flex; align-items: center; gap: 8px; white-space: nowrap; }
        button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 40px;
          padding: 8px 13px;
          color: var(--primary-text-color);
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          font: inherit;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 120ms ease, transform 120ms ease;
        }
        button:hover { background: color-mix(in srgb, var(--primary-color) 10%, var(--card-background-color)); }
        button:active { transform: translateY(1px); }
        button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        button ha-icon { --mdc-icon-size: 18px; }
        .primary-button { color: var(--text-primary-color, #fff); background: var(--primary-color); border-color: var(--primary-color); }
        .primary-button:hover { background: var(--dark-primary-color, var(--primary-color)); }
        .delete { color: var(--error-color); }
        .search-controls { display: grid; grid-template-columns: minmax(220px, 1fr) auto; gap: 10px; max-width: 720px; }
        .search-results { display: grid; gap: 6px; max-width: 720px; margin: 12px 0 0; padding: 0; list-style: none; }
        .result-button { width: 100%; justify-content: flex-start; min-height: 48px; text-align: left; }
        .result-title { font-weight: 500; }
        .result-artist { color: var(--secondary-text-color); }
        .search-message { padding: 12px 2px; color: var(--secondary-text-color); font-size: 14px; }
        .mapping-form { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(160px, 1fr) minmax(220px, 1.5fr) auto; gap: 10px; }
        .empty-state { padding: 24px; color: var(--secondary-text-color); text-align: center; }
        @media (max-width: 700px) {
          rfid-jukebox-panel { padding: 18px 14px 32px; }
          .page-header { align-items: flex-start; flex-direction: column; gap: 16px; }
          .player-status { width: 100%; max-width: none; }
          .mapping-form { grid-template-columns: 1fr; }
          .search-controls { grid-template-columns: minmax(0, 1fr) auto; }
          .section { padding: 20px 0; }
        }
      </style>
      <main class="jukebox">
        <header class="page-header">
          <div class="heading">
            <span class="heading-icon"><ha-icon icon="mdi:radio-tower"></ha-icon></span>
            <h1>Jukebox RFID</h1>
          </div>
          <div class="player-status">
            <span class="player-label">Player predefinito</span>
            <strong id="default-player">—</strong>
          </div>
        </header>

        <section class="section">
          <div class="section-heading">
            <h2>Associazioni</h2>
            <div class="section-meta">
              <span class="count" id="mapping-count">0 tag</span>
              <button class="icon-button" id="refresh-btn" type="button" title="Aggiorna tag" aria-label="Aggiorna tag"><ha-icon icon="mdi:refresh"></ha-icon></button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Tag ID</th><th>Titolo</th><th>Media content ID</th><th>Azioni</th></tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </section>

        <section class="section">
          <div class="section-heading"><h2>Cerca brano</h2></div>
          <div class="search-controls">
            <input id="search-query" placeholder="Titolo o artista..." aria-label="Titolo o artista" />
            <button class="primary-button" id="search-btn" type="button"><ha-icon icon="mdi:magnify"></ha-icon><span>Cerca</span></button>
          </div>
          <ul id="search-results" class="search-results"></ul>
        </section>

        <section class="section">
          <div class="section-heading"><h2>Nuova associazione</h2></div>
          <div class="mapping-form">
            <input id="new-tag" placeholder="Tag ID (UID)" aria-label="Tag ID (UID)" />
            <input id="new-title" placeholder="Titolo" aria-label="Titolo" />
            <input id="new-media" placeholder="media_content_id (es. spotify://...)" aria-label="Media content ID" />
            <button class="primary-button" id="add-btn" type="button"><ha-icon icon="mdi:plus"></ha-icon><span>Aggiungi</span></button>
          </div>
        </section>
      </main>
    `;
    this.querySelector("#search-btn").addEventListener("click", () =>
      this._searchMedia()
    );
    this.querySelector("#refresh-btn").addEventListener("click", () =>
      this._loadTags()
    );
    this.querySelector("#search-query").addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._searchMedia();
    });
    this.querySelector("#add-btn").addEventListener("click", () => {
      const tagId = this.querySelector("#new-tag").value.trim();
      const title = this.querySelector("#new-title").value.trim();
      const media = this.querySelector("#new-media").value.trim();
      if (tagId && title && media) {
        this._saveTag(tagId, title, media);
        this.querySelector("#new-tag").value = "";
        this.querySelector("#new-title").value = "";
        this.querySelector("#new-media").value = "";
      }
    });
  }

  _renderTable() {
    const rows = this.querySelector("#rows");
    rows.replaceChildren();
    const tags = Object.entries(this._tags || {});
    this.querySelector("#mapping-count").textContent = `${tags.length} tag`;
    if (!tags.length) {
      const tr = document.createElement("tr");
      const cell = document.createElement("td");
      cell.className = "empty-state";
      cell.colSpan = 4;
      cell.textContent = "Nessuna associazione";
      tr.appendChild(cell);
      rows.appendChild(tr);
      return;
    }
    for (const [tagId, tag] of tags) {
      const tr = document.createElement("tr");
      const tagCell = document.createElement("td");
      tagCell.className = "tag-id";
      tagCell.textContent = tagId;
      const titleCell = document.createElement("td");
      const titleInput = document.createElement("input");
      titleInput.className = "table-input";
      titleInput.value = tag.title;
      titleInput.dataset.field = "title";
      titleInput.setAttribute("aria-label", `Titolo per ${tagId}`);
      titleCell.appendChild(titleInput);
      const mediaCell = document.createElement("td");
      const mediaInput = document.createElement("input");
      mediaInput.className = "table-input";
      mediaInput.value = tag.media_content_id;
      mediaInput.dataset.field = "media";
      mediaInput.setAttribute("aria-label", `Media content ID per ${tagId}`);
      mediaCell.appendChild(mediaInput);
      const actionsCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "actions";
      const saveButton = document.createElement("button");
      saveButton.className = "primary-button";
      saveButton.type = "button";
      saveButton.innerHTML = '<ha-icon icon="mdi:content-save-outline"></ha-icon><span>Salva</span>';
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete";
      deleteButton.type = "button";
      deleteButton.innerHTML = '<ha-icon icon="mdi:delete-outline"></ha-icon><span>Elimina</span>';
      actions.append(saveButton, deleteButton);
      actionsCell.appendChild(actions);
      tr.append(tagCell, titleCell, mediaCell, actionsCell);
      saveButton.addEventListener("click", () => {
        const title = tr.querySelector('[data-field="title"]').value;
        const media = tr.querySelector('[data-field="media"]').value;
        this._saveTag(tagId, title, media);
      });
      deleteButton.addEventListener("click", () => this._deleteTag(tagId));
      rows.appendChild(tr);
    }
  }
}

customElements.define("rfid-jukebox-panel", RfidJukeboxPanel);
