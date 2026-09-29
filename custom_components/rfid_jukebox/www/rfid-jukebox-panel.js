class RfidJukeboxPanel extends HTMLElement {
  constructor() {
    super();
    this._root = this.attachShadow({ mode: "open" });
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._loadTags();
      this._loadConfig();
      this._subscribeScans();
    }
    this._updateNowPlaying();
  }

  async _subscribeScans() {
    try {
      this._unsubscribeScans = await this._hass.connection.subscribeEvents(
        (event) => this._handleTagScanned(event.data.tag_id),
        "rfid_jukebox_tag_scanned"
      );
      const { tag_id: latestTagId } = await this._hass.callWS({
        type: "rfid_jukebox/get_last_scan",
      });
      this._handleTagScanned(latestTagId);
    } catch (err) {
      console.error("Impossibile ascoltare le scansioni RFID:", err);
    }
  }

  _handleTagScanned(tagId) {
    if (typeof tagId !== "string" || !tagId.trim()) return;
    const normalizedTagId = tagId.trim();
    const tagInput = this._root.querySelector("#new-tag");
    tagInput.value = normalizedTagId;
    this._root.querySelector("#scan-status").textContent =
      `Tag acquisito: ${normalizedTagId}. Completa l'abbinamento del brano.`;
    tagInput.focus({ preventScroll: true });
    tagInput.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async _searchMedia() {
    const query = this._root.querySelector("#search-query").value.trim();
    if (!query) return;
    const list = this._root.querySelector("#search-results");
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
      for (const result of results) {
        const item = document.createElement("li");
        item.className = "search-result";
        const button = document.createElement("button");
        button.className = "result-button";
        button.type = "button";
        let cover;
        if (result.image) {
          const image = document.createElement("img");
          image.className = "cover-art";
          image.src = result.image;
          image.alt = "";
          image.loading = "lazy";
          image.addEventListener("error", () => {
            image.replaceWith(this._createCoverPlaceholder());
          });
          cover = image;
        } else {
          cover = this._createCoverPlaceholder();
        }
        button.appendChild(cover);
        const metadata = document.createElement("span");
        metadata.className = "result-metadata";
        const title = document.createElement("span");
        title.className = "result-title";
        title.textContent = result.name;
        metadata.appendChild(title);
        if (result.artist) {
          const artist = document.createElement("span");
          artist.className = "result-artist";
          artist.textContent = result.artist;
          metadata.appendChild(artist);
        }
        button.appendChild(metadata);
        button.addEventListener("click", () => {
          this._root.querySelector("#new-title").value = result.artist
            ? `${result.name} — ${result.artist}`
            : result.name;
          this._root.querySelector("#new-media").value = result.uri;
        });
        item.appendChild(button);
        list.appendChild(item);
      }
    } catch (err) {
      showMessage(`Errore: ${err.message || err}`);
    }
  }

  async _loadTags() {
    this._tags = await this._hass.callWS({ type: "rfid_jukebox/list" });
    this._renderTable();
  }

  _createCoverPlaceholder() {
    const placeholder = document.createElement("span");
    placeholder.className = "cover-placeholder";
    placeholder.innerHTML = '<ha-icon icon="mdi:music-note"></ha-icon>';
    return placeholder;
  }

  async _loadConfig() {
    const config = await this._hass.callWS({
      type: "rfid_jukebox/get_config",
    });
    const element = this._root.querySelector("#default-player");
    this._defaultMediaPlayer = config.default_media_player;
    element.textContent = config.default_media_player
      ? config.default_media_player
      : "non impostato";
    this._updateNowPlaying();
  }

  _updateNowPlaying() {
    if (!this._initialized) return;
    const titleElement = this._root.querySelector("#now-playing-title");
    const artistElement = this._root.querySelector("#now-playing-artist");
    const coverElement = this._root.querySelector("#now-playing-cover");
    const player = this._defaultMediaPlayer
      ? this._hass.states[this._defaultMediaPlayer]
      : null;

    if (!player || player.state !== "playing") {
      titleElement.textContent = "Nessun brano in riproduzione";
      artistElement.textContent = "";
      coverElement.hidden = true;
      coverElement.removeAttribute("src");
      return;
    }

    titleElement.textContent =
      player.attributes.media_title || "Riproduzione in corso";
    artistElement.textContent = player.attributes.media_artist || "";
    const imageUrl = player.attributes.entity_picture;
    coverElement.hidden = !imageUrl;
    if (imageUrl) {
      coverElement.onerror = () => {
        coverElement.hidden = true;
      };
      if (coverElement.getAttribute("src") !== imageUrl) {
        coverElement.src = imageUrl;
      }
    }
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
    this._root.innerHTML = `
      <style>
        :host {
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
        .now-playing {
          display: flex;
          flex: 1;
          min-width: 0;
          align-items: center;
          gap: 12px;
          padding: 0 24px;
        }
        .now-playing-info { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
        #now-playing-title { overflow-wrap: anywhere; font-size: 15px; font-weight: 600; }
        #now-playing-artist { color: var(--secondary-text-color); font-size: 13px; }
        .cover-art, .cover-placeholder {
          display: grid;
          place-items: center;
          width: 56px;
          height: 56px;
          flex: 0 0 56px;
          overflow: hidden;
          border-radius: 4px;
        }
        .cover-art { object-fit: cover; }
        .cover-placeholder { color: var(--secondary-text-color); background: var(--secondary-background-color); }
        .cover-placeholder ha-icon { --mdc-icon-size: 26px; }
        .section { padding: 24px 0; border-top: 1px solid var(--divider-color); }
        .section-heading {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 16px;
        }
        .count { color: var(--secondary-text-color); font-size: 13px; }
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
          border-radius: 4px;
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
        button[hidden] { display: none; }
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
        .result-metadata { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
        .result-title { overflow-wrap: anywhere; font-weight: 500; }
        .result-artist { color: var(--secondary-text-color); }
        .search-message { padding: 12px 2px; color: var(--secondary-text-color); font-size: 14px; }
        .mapping-form { display: grid; grid-template-columns: minmax(130px, .8fr) minmax(160px, 1fr) minmax(220px, 1.5fr) auto; gap: 10px; }
        .scan-status { min-height: 20px; margin: 0 0 12px; color: var(--success-color, var(--primary-color)); font-size: 13px; }
        .scan-status:empty { display: none; }
        .empty-state { padding: 24px; color: var(--secondary-text-color); text-align: center; }
        @media (max-width: 700px) {
          :host { padding: 18px 14px 32px; }
          .page-header { align-items: flex-start; flex-direction: column; gap: 16px; }
          .now-playing { width: 100%; padding: 0; }
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
          <div class="now-playing" aria-live="polite">
            <img id="now-playing-cover" class="cover-art" alt="" hidden />
            <div class="now-playing-info">
              <span class="player-label">In riproduzione</span>
              <strong id="now-playing-title">Nessun brano in riproduzione</strong>
              <span id="now-playing-artist"></span>
            </div>
          </div>
          <div class="player-status">
            <span class="player-label">Player predefinito</span>
            <strong id="default-player">—</strong>
          </div>
        </header>

        <section class="section">
          <div class="section-heading"><h2>Nuova associazione</h2></div>
          <p id="scan-status" class="scan-status" aria-live="polite"></p>
          <div class="mapping-form">
            <input id="new-tag" placeholder="Tag ID (UID)" aria-label="Tag ID (UID)" />
            <input id="new-title" placeholder="Titolo" aria-label="Titolo" />
            <input id="new-media" placeholder="media_content_id (es. spotify://...)" aria-label="Media content ID" />
            <button class="primary-button" id="add-btn" type="button"><ha-icon icon="mdi:plus"></ha-icon><span>Aggiungi</span></button>
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
          <div class="section-heading">
            <h2>Associazioni</h2>
            <span class="count" id="mapping-count">0 tag</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Tag ID</th><th>Titolo</th><th>Media content ID</th><th>Azioni</th></tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>
        </section>
      </main>
    `;
    this._root.querySelector("#search-btn").addEventListener("click", () =>
      this._searchMedia()
    );
    this._root.querySelector("#search-query").addEventListener("keydown", (event) => {
      if (event.key === "Enter") this._searchMedia();
    });
    this._root.querySelector("#add-btn").addEventListener("click", () => {
      const tagId = this._root.querySelector("#new-tag").value.trim();
      const title = this._root.querySelector("#new-title").value.trim();
      const media = this._root.querySelector("#new-media").value.trim();
      if (tagId && title && media) {
        this._saveTag(tagId, title, media);
        this._root.querySelector("#new-tag").value = "";
        this._root.querySelector("#new-title").value = "";
        this._root.querySelector("#new-media").value = "";
      }
    });
  }

  _renderTable() {
    const rows = this._root.querySelector("#rows");
    rows.replaceChildren();
    const tags = Object.entries(this._tags || {});
    this._root.querySelector("#mapping-count").textContent = `${tags.length} tag`;
    if (!tags.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.className = "empty-state";
      cell.colSpan = 4;
      cell.textContent = "Nessuna associazione";
      row.appendChild(cell);
      rows.appendChild(row);
      return;
    }
    for (const [tagId, tag] of tags) {
      const row = document.createElement("tr");
      const tagCell = document.createElement("td");
      tagCell.className = "tag-id";
      tagCell.textContent = tagId;
      const titleCell = document.createElement("td");
      const titleInput = document.createElement("input");
      titleInput.className = "table-input";
      titleInput.value = tag.title || "";
      titleInput.dataset.field = "title";
      titleInput.setAttribute("aria-label", `Titolo per ${tagId}`);
      titleCell.appendChild(titleInput);
      const mediaCell = document.createElement("td");
      const mediaInput = document.createElement("input");
      mediaInput.className = "table-input";
      mediaInput.value = tag.media_content_id || "";
      mediaInput.dataset.field = "media";
      mediaInput.setAttribute("aria-label", `Media content ID per ${tagId}`);
      mediaCell.appendChild(mediaInput);
      const actionsCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "actions";
      const saveButton = document.createElement("button");
      saveButton.className = "primary-button";
      saveButton.type = "button";
      saveButton.hidden = true;
      saveButton.innerHTML = '<ha-icon icon="mdi:content-save-outline"></ha-icon><span>Salva</span>';
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete";
      deleteButton.type = "button";
      deleteButton.innerHTML = '<ha-icon icon="mdi:delete-outline"></ha-icon><span>Elimina</span>';
      actions.append(saveButton, deleteButton);
      actionsCell.appendChild(actions);
      row.append(tagCell, titleCell, mediaCell, actionsCell);
      const originalTitle = titleInput.value;
      const originalMedia = mediaInput.value;
      const updateSaveVisibility = () => {
        saveButton.hidden =
          titleInput.value === originalTitle &&
          mediaInput.value === originalMedia;
      };
      titleInput.addEventListener("input", updateSaveVisibility);
      mediaInput.addEventListener("input", updateSaveVisibility);
      saveButton.addEventListener("click", () => {
        this._saveTag(tagId, titleInput.value, mediaInput.value);
      });
      deleteButton.addEventListener("click", () => this._deleteTag(tagId));
      rows.appendChild(row);
    }
  }
}

customElements.define("rfid-jukebox-panel", RfidJukeboxPanel);