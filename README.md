# RFID Jukebox — custom integration

## Installazione via HACS (consigliata)
1. Metti questa cartella (`rfid_jukebox/`, quella che contiene `hacs.json`, `README.md` e `custom_components/`) come **root di un repository git** — pubblico su GitHub, o privato se in HACS hai configurato un token con accesso.
2. In HA: **HACS → menu (⋮) in alto a destra → Repository personalizzati**.
3. Incolla l'URL del repo, categoria **Integrazione**, Aggiungi.
4. Cerca "RFID Jukebox" nell'elenco HACS → Scarica.
5. Riavvia Home Assistant Core.
6. Prosegui da "Configurazione" qui sotto.

Con HACS gli aggiornamenti futuri (nuovi commit/release sul repo) ti compaiono come notifica normale, invece di dover ricopiare i file a mano.

Nota: HACS predilige repository con **release/tag** per il flusso di aggiornamento (usa il numero di `version` nel `manifest.json` come riferimento) — se non crei una release, installa comunque dal branch di default, ma senza changelog puntuali.

## Installazione manuale (alternativa)
1. Copia la cartella `custom_components/rfid_jukebox` dentro `/config/custom_components/` sul tuo Raspberry Pi.
2. Riavvia Home Assistant Core.
3. Prosegui da "Configurazione" qui sotto.

## Configurazione
Vai su **Impostazioni → Dispositivi e servizi → Aggiungi integrazione**, cerca "RFID Jukebox", seleziona (opzionale) il player Music Assistant da usare come default. In sidebar comparirà "Jukebox RFID" (visibile solo agli utenti admin).

Il player predefinito si può cambiare in qualsiasi momento da **Impostazioni → Dispositivi e servizi → RFID Jukebox → Configura**, senza riavviare: il servizio legge il valore aggiornato ad ogni chiamata.

## Dati
Salvati in `.storage/rfid_jukebox.tags` (gestito da `Store`, versionato, incluso nei backup HA automatici — coerente con `sensor.backup_last_successful_automatic_backup`).

## Riproduzione via MQTT
Non serve creare un'automazione in Home Assistant. Quando l'integrazione MQTT è configurata, pubblica l'UID del tag come testo semplice sul topic `jukebox/play` (ad esempio direttamente da ESPHome). Il componente cerca l'UID tra le associazioni salvate e riproduce il brano sul player predefinito configurato. Se il tag non è ancora conosciuto, il suo UID viene conservato separatamente dalle associazioni e inserito automaticamente nel campo della nuova associazione, anche se il pannello viene aperto dopo la scansione. Il valore temporaneo viene cancellato quando l'associazione viene salvata.

Pubblica il messaggio senza retain, così un tag letto in precedenza non viene riprodotto di nuovo quando Home Assistant si riconnette al broker.

Il servizio `rfid_jukebox.play` resta disponibile per chiamate manuali o automazioni esistenti. `tag_id` è obbligatorio; `media_player` è opzionale e, se omesso, viene usato il player predefinito. Puoi specificarlo per sovrascrivere il player per una singola chiamata.

## Note
- Il pannello include una barra "Cerca brano (Music Assistant)": interroga `music_assistant.search`, che cerca su tutti i provider collegati al server MA — quindi anche Apple Music, se lo hai aggiunto lì. Clicca un risultato per compilare automaticamente titolo e `media_content_id` nel form "Nuova associazione".
- La ricerca usa la prima istanza Music Assistant configurata in HA; se ne hai più di una, andrebbe esteso `ws_search_media` per farla scegliere.
- Il campo `media_content_id` nel pannello va compilato con l'URI che Music Assistant si aspetta (es. `spotify://track/...`, `library://track/123`, o l'equivalente per il provider Apple Music). Con la ricerca sopra di norma non serve più copiarlo a mano.
- `tag_id` deve combaciare esattamente con il payload testuale pubblicato su `jukebox/play` (di solito l'UID esadecimale del tag NFC/RFID).
- Il servizio logga un warning (non un errore bloccante) se il tag non è mappato, così uno scan accidentale o tag non ancora registrato non rompe nulla.
