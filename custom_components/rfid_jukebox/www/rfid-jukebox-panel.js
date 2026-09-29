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
    list.innerHTML = "<li>Ricerca in corso...</li>";
    try {
      const { results } = await this._hass.callWS({
        type: "rfid_jukebox/search_media",
        query,
      });
      list.innerHTML = "";
      if (!results.length) {
        list.innerHTML = "<li>Nessun risultato.</li>";
        return;
      }
      for (const r of results) {
        const li = document.createElement("li");
        li.textContent = r.artist ? `${r.name} — ${r.artist}` : r.name;
        li.style.cursor = "pointer";
        li.style.padding = "6px 4px";
        li.style.borderBottom = "1px solid var(--divider-color, #eee)";
        li.addEventListener("click", () => {
          this.querySelector("#new-title").value = r.artist
            ? `${r.name} — ${r.artist}`
            : r.name;
          this.querySelector("#new-media").value = r.uri;
        });
        list.appendChild(li);
      }
    } catch (err) {
      list.innerHTML = `<li>Errore: ${err.message || err}</li>`;
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
        :host { display: block; padding: 16px; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid var(--divider-color, #ccc); }
        input { padding: 6px; margin-right: 8px; border: 1px solid var(--divider-color, #ccc); border-radius: 4px; }
        button { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px; }
        .save { background: var(--primary-color, #03a9f4); color: white; }
        .delete { background: var(--error-color, #db4437); color: white; }
        h1 { font-size: 1.5em; }
      </style>
      <h1>Jukebox RFID</h1>
      <p style="color: var(--secondary-text-color);">
        Player predefinito: <strong id="default-player">—</strong>
        (si cambia da Impostazioni → Dispositivi e servizi → RFID Jukebox → Configura)
      </p>
      <table>
        <thead><tr><th>Tag ID</th><th>Titolo</th><th>Media content ID</th><th></th></tr></thead>
        <tbody id="rows"></tbody>
      </table>
      <h2>Cerca brano (Music Assistant)</h2>
      <div>
        <input id="search-query" placeholder="Titolo o artista..." style="width:280px" />
        <button class="save" id="search-btn">Cerca</button>
      </div>
      <ul id="search-results" style="list-style:none; padding:0; margin:8px 0 24px;"></ul>

      <h2>Nuova associazione</h2>
      <div>
        <input id="new-tag" placeholder="Tag ID (UID)" />
        <input id="new-title" placeholder="Titolo" />
        <input id="new-media" placeholder="media_content_id (es. spotify://...)" style="width:320px" />
        <button class="save" id="add-btn">Aggiungi</button>
      </div>
    `;
    this.querySelector("#search-btn").addEventListener("click", () =>
      this._searchMedia()
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
    rows.innerHTML = "";
    for (const [tagId, tag] of Object.entries(this._tags || {})) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${tagId}</td>
        <td><input value="${tag.title}" data-field="title" /></td>
        <td><input value="${tag.media_content_id}" data-field="media" style="width:280px" /></td>
        <td>
          <button class="save">Salva</button>
          <button class="delete">Elimina</button>
        </td>
      `;
      tr.querySelector(".save").addEventListener("click", () => {
        const title = tr.querySelector('[data-field="title"]').value;
        const media = tr.querySelector('[data-field="media"]').value;
        this._saveTag(tagId, title, media);
      });
      tr.querySelector(".delete").addEventListener("click", () =>
        this._deleteTag(tagId)
      );
      rows.appendChild(tr);
    }
  }
}

customElements.define("rfid-jukebox-panel", RfidJukeboxPanel);
