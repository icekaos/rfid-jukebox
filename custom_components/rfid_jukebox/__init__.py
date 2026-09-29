"""RFID Jukebox: mappa tag RFID a brani riproducibili via Music Assistant."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import mqtt, websocket_api
from homeassistant.components.frontend import (
    async_register_built_in_panel,
    async_remove_panel,
)
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store

from .const import CONF_DEFAULT_MEDIA_PLAYER, DOMAIN

STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.tags"
LAST_SCAN_STORAGE_KEY = f"{DOMAIN}.last_scan"
PANEL_URL = "/api/rfid_jukebox/panel/rfid-jukebox-panel.js"
PANEL_MODULE_URL = f"{PANEL_URL}?v=4"
PANEL_PATH = Path(__file__).parent / "www" / "rfid-jukebox-panel.js"

_LOGGER = logging.getLogger(__name__)

SERVICE_PLAY = "play"
SERVICE_PLAY_SCHEMA = vol.Schema(
    {
        vol.Required("tag_id"): cv.string,
        vol.Optional("media_player"): cv.entity_id,
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_URL, str(PANEL_PATH), False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
    last_scan_store: Store = Store(hass, STORAGE_VERSION, LAST_SCAN_STORAGE_KEY)
    tags = await store.async_load() or {}
    last_scan = await last_scan_store.async_load() or {}
    unmapped_tags = [
        tag_id for tag_id, tag in tags.items() if not tag.get("media_content_id")
    ]
    for tag_id in unmapped_tags:
        tags.pop(tag_id)
    if unmapped_tags:
        await store.async_save(tags)
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN]["store"] = store
    hass.data[DOMAIN]["last_scan_store"] = last_scan_store
    hass.data[DOMAIN]["last_scanned_tag_id"] = last_scan.get("tag_id")
    hass.data[DOMAIN]["tags"] = tags
    hass.data[DOMAIN]["entry"] = entry

    async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="Jukebox RFID",
        sidebar_icon="mdi:radio-tower",
        frontend_url_path="rfid-jukebox",
        config={
            "_panel_custom": {
                "name": "rfid-jukebox-panel",
                "embed_iframe": False,
                "trust_external": False,
                "module_url": PANEL_MODULE_URL,
            }
        },
        require_admin=True,
    )

    websocket_api.async_register_command(hass, ws_list_tags)
    websocket_api.async_register_command(hass, ws_save_tag)
    websocket_api.async_register_command(hass, ws_delete_tag)
    websocket_api.async_register_command(hass, ws_get_config)
    websocket_api.async_register_command(hass, ws_search_media)
    websocket_api.async_register_command(hass, ws_get_last_scan)

    async def async_play_tag(tag_id: str, media_player: str | None = None) -> None:
        if not tag_id.strip():
            return
        tags = hass.data[DOMAIN]["tags"]
        tag = tags.get(tag_id)
        if tag is None:
            _LOGGER.warning("Tag RFID sconosciuto: %s", tag_id)
            return
        if not tag.get("media_content_id"):
            _LOGGER.warning("Tag RFID senza brano associato: %s", tag_id)
            return

        # entry.options viene aggiornato in-place quando si salva l'options flow,
        # quindi leggerlo qui riflette sempre l'ultimo valore senza bisogno di reload.
        media_player = media_player or entry.options.get(
            CONF_DEFAULT_MEDIA_PLAYER
        )
        if not media_player:
            _LOGGER.warning(
                "rfid_jukebox.play: nessun media_player passato e nessun player "
                "predefinito configurato (Impostazioni > Dispositivi e servizi > "
                "RFID Jukebox > Configura)"
            )
            return

        try:
            await hass.services.async_call(
                "music_assistant",
                "play_media",
                {
                    "entity_id": media_player,
                    "media_id": tag["media_content_id"],
                },
                blocking=True,
            )
        except HomeAssistantError as err:
            _LOGGER.warning(
                "Riproduzione del tag %s fallita: %s. Verifica il media_content_id "
                "nell'associazione Music Assistant.",
                tag_id,
                err,
            )

    async def handle_play(call: ServiceCall) -> None:
        await async_play_tag(
            call.data["tag_id"], call.data.get("media_player")
        )

    hass.services.async_register(
        DOMAIN, SERVICE_PLAY, handle_play, schema=SERVICE_PLAY_SCHEMA
    )

    async def handle_mqtt_message(message) -> None:
        tag_id = message.payload.strip()
        if not tag_id:
            return
        tag = hass.data[DOMAIN]["tags"].get(tag_id)
        if tag is None or not tag.get("media_content_id"):
            if tag is not None:
                hass.data[DOMAIN]["tags"].pop(tag_id, None)
                await _save(hass)
            hass.data[DOMAIN]["last_scanned_tag_id"] = tag_id
            await hass.data[DOMAIN]["last_scan_store"].async_save(
                {"tag_id": tag_id}
            )
            hass.bus.async_fire(
                f"{DOMAIN}_tag_scanned", {"tag_id": tag_id}
            )
            return
        await async_play_tag(tag_id)

    hass.data[DOMAIN]["mqtt_unsubscribe"] = await mqtt.async_subscribe(
        hass, "jukebox/play", handle_mqtt_message
    )

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    async_remove_panel(hass, "rfid-jukebox")
    hass.services.async_remove(DOMAIN, SERVICE_PLAY)
    hass.data[DOMAIN]["mqtt_unsubscribe"]()
    hass.data.pop(DOMAIN, None)
    return True


async def _save(hass: HomeAssistant) -> None:
    await hass.data[DOMAIN]["store"].async_save(hass.data[DOMAIN]["tags"])


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list"})
@websocket_api.async_response
async def ws_list_tags(hass, connection, msg):
    connection.send_result(msg["id"], hass.data[DOMAIN]["tags"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save",
        vol.Required("tag_id"): cv.string,
        vol.Required("title"): cv.string,
        vol.Required("media_content_id"): cv.string,
    }
)
@websocket_api.async_response
async def ws_save_tag(hass, connection, msg):
    hass.data[DOMAIN]["tags"][msg["tag_id"]] = {
        "title": msg["title"],
        "media_content_id": msg["media_content_id"],
    }
    await _save(hass)
    if hass.data[DOMAIN].get("last_scanned_tag_id") == msg["tag_id"]:
        hass.data[DOMAIN]["last_scanned_tag_id"] = None
        await hass.data[DOMAIN]["last_scan_store"].async_remove()
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete", vol.Required("tag_id"): cv.string}
)
@websocket_api.async_response
async def ws_delete_tag(hass, connection, msg):
    hass.data[DOMAIN]["tags"].pop(msg["tag_id"], None)
    await _save(hass)
    connection.send_result(msg["id"], {})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_config"})
@websocket_api.async_response
async def ws_get_config(hass, connection, msg):
    entry: ConfigEntry = hass.data[DOMAIN]["entry"]
    connection.send_result(
        msg["id"],
        {"default_media_player": entry.options.get(CONF_DEFAULT_MEDIA_PLAYER)},
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get_last_scan"})
@websocket_api.async_response
async def ws_get_last_scan(hass, connection, msg):
    connection.send_result(
        msg["id"], {"tag_id": hass.data[DOMAIN].get("last_scanned_tag_id")}
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/search_media",
        vol.Required("query"): cv.string,
    }
)
@websocket_api.async_response
async def ws_search_media(hass, connection, msg):
    ma_entries = [
        e
        for e in hass.config_entries.async_entries("music_assistant")
        if e.state == ConfigEntryState.LOADED
    ]
    if not ma_entries:
        connection.send_error(
            msg["id"],
            "no_music_assistant",
            "Nessuna istanza Music Assistant caricata (controlla che l'integrazione "
            "sia configurata e attiva in Impostazioni > Dispositivi e servizi)",
        )
        return

    try:
        response = await hass.services.async_call(
            "music_assistant",
            "search",
            {
                "config_entry_id": ma_entries[0].entry_id,
                "name": msg["query"],
                "media_type": ["track"],
                "limit": 10,
            },
            blocking=True,
            return_response=True,
        )
    except Exception as err:  # noqa: BLE001
        _LOGGER.warning("Ricerca Music Assistant fallita: %s", err)
        connection.send_error(msg["id"], "search_failed", str(err))
        return

    # La struttura esatta della risposta (chiavi "tracks"/"items"/ecc.) può
    # variare tra versioni dell'integrazione MA: scansiono tutte le liste nel
    # payload e prendo gli elementi con uri, invece di fissarmi su una chiave.
    items = []
    for value in (response or {}).values():
        if isinstance(value, list):
            items.extend(value)

    results = [
        {
            "uri": item.get("uri"),
            "name": item.get("name"),
            "image": item.get("image"),
            "artist": ", ".join(
                a.get("name", "") for a in (item.get("artists") or [])
            ),
        }
        for item in items
        if isinstance(item, dict) and item.get("uri")
    ]
    connection.send_result(msg["id"], {"results": results})
