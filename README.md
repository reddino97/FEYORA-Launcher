# 🎮 FEYORA PC Launcher (Native Console Edition)

Un launcher per giochi PC progettato per funzionare **esattamente come Steam Big Picture e la Dashboard Xbox**:
- **Applicazione Desktop Nativa Autonoma**: integrata tramite `pywebview` e il motore isolato Windows WebView2. Nessun browser esterno Edge, nessuna estensione, nessuna barra degli indirizzi o scheda indesiderata.
- **Interfaccia "Obsidian Kinetic"** (design Google Stitch): hero cinematografico, carosello giochi a squircle, widget Spotify / tasto Discord / telemetria PC, alone neon sul focus del controller. Funziona **offline**: Tailwind, font e icone sono inclusi in `static/`.
- **Personalizzazione Copertine**: possibilità di cambiare la copertina di qualsiasi gioco (tramite file dal PC, suggerimenti online o URL web).
- **100% Navigabile Esclusivamente da Gamepad** (o tastiera).

---

## 🕹️ Mappa dei Comandi Gamepad

| Tasto Gamepad | Schermata Principale (Home / Carosello) | Finestra "Cambia Copertina" [X] | Finestra Dettagli / Impostazioni |
|---|---|---|---|
| **D-Pad ◀ / ▶** (o Stick SX) | Scorre le copertine dei giochi | Seleziona tra i suggerimenti grafici | Modifica valori / Cambia scheda |
| **D-Pad ▲ / ▼** (o Stick SX) | Passa tra Categorie (in alto) e Azioni (in basso) | Naviga tra sezioni (File, Griglia, URL, Chiudi) | Scorre verticalmente le opzioni |
| **Pulsante A** *(Croce PS)* | **AVVIA IL GIOCO** | **Applica copertina** / Sfoglia file | Conferma / Seleziona |
| **Pulsante B** *(Cerchio PS)* | Chiudi pannelli / Torna alla lista | **Chiudi finestra** | **Torna alla Home** |
| **Pulsante X** *(Quadrato PS)* | **CAMBIA COPERTINA** | - | Apri cambio copertina |
| **Pulsante Y** *(Triangolo PS)* | **Aggiungi/Rimuovi Preferiti** | **Ripristina copertina originale** | Preferito |
| **Start / Menu** | Apri / Chiudi **Impostazioni** | - | Chiudi / Torna |
| **Back / View** | Apri / Chiudi **Profilo** | - | Chiudi / Torna |
| **LB / RB** *(L1 / R1)* | **Cambia Categoria** (*TUTTI, PREFERITI, STEAM, EPIC, RECENTI*) | - | - |
| **LT / RT** *(L2 / R2)* | **Salto rapido** (5 giochi) | - | - |
| **L3 (Click Levetta SX)** | **Ricarica Librerie** Steam ed Epic | - | - |

> *Nota Tastiera: Frecce per muoversi, Invio = A, Esc = B, X = Cambia Copertina, F o Y = Preferito, Q/E = LB/RB, S o M = Start/Menu, P o V = Profilo, F11 = Schermo Intero.*

---

## 🖼️ Come Cambiare l'Immagine di un Gioco

1. Posizionati sul gioco desiderato e premi il tasto **X** del gamepad (oppure clicca su **Copertina**).
2. Si aprirà la finestra di personalizzazione dove puoi:
   - Premere **Sfoglia File dal PC [A]**: apre la finestra di dialogo di Windows per selezionare qualsiasi immagine (`.jpg`, `.png`, `.webp`) sul tuo computer.
   - Scegliere tra le **Copertine Suggerite & Ufficiali**: copertine verticali ad alta risoluzione 600x900 scaricate automaticamente da Steam o store ufficiali.
   - **Incollare un URL**: inserire il link di un'immagine trovata sul web.
   - Premere **Ripristina Predefinita [Y]**: per ripristinare in qualsiasi momento la copertina originale.

---

## 🚀 Come Avviare il Launcher

Fai doppio clic sull'icona **FEYORA Launcher** sul tuo Desktop (oppure avvia `run.bat`).
L'applicazione si aprirà a schermo intero nativo come console autonoma.


---

## 🎵 Widget Spotify

Mostra brano, copertina e progresso e controlla play/pausa/avanti/indietro tramite i controlli multimediali di Windows (funziona con Spotify desktop, e con qualsiasi player che li esponga).
Servono questi pacchetti (una volta sola):

```
pip install -r requirements.txt
```

Senza i pacchetti `winrt-*` il resto del launcher funziona normalmente e il widget mostra "Non disponibile".

## 💬 Tasto Discord

Un semplice tasto «Apri Discord» che avvia l'app Discord installata sul PC.

## 🛠️ Modificare lo stile

Il CSS è precompilato in `static/app.css`. Se cambi le classi Tailwind in `index.html` / `app.js` devi ricompilarlo:

```
npm i tailwindcss@3.4.17
npx tailwindcss -c tailwind.config.js -i input.css -o static/app.css --minify
```

---

## 📦 Creare l'exe e l'installer (Windows)

1. Fai doppio clic su **`build.bat`** (installa le dipendenze, crea `dist\FEYORA\FEYORA.exe` e, se trova **Inno Setup 6**, anche `installer_output\FEYORA-Setup-<versione>.exe`).
2. *(Facoltativo)* Scarica il "WebView2 Runtime Evergreen Bootstrapper" da Microsoft e mettilo in `redist\MicrosoftEdgeWebview2Setup.exe`: l'installer lo lancia solo se WebView2 manca.

**Dove finiscono i dati**
- Da sorgente (`run.bat` / `python main.py`): in `data\` accanto al progetto, come prima.
- Dall'exe installato: in `%APPDATA%\FEYORA\data` (preferiti, impostazioni, copertine). Il log degli errori è in `%APPDATA%\FEYORA\feyora.log`.
- Per portare i dati dalla versione da sorgente a quella installata, copia `data\launcher_data.json` e `data\covers\` in `%APPDATA%\FEYORA\data`.
- Per usare un'altra cartella: variabile d'ambiente `FEYORA_DATA_DIR`.

**Note**
- La porta del server interno è scelta automaticamente a ogni avvio; la UI accetta solo richieste dalla finestra dell'app (token di sessione) e una seconda istanza porta in primo piano la prima.
- Il file dialog per le copertine ora è quello nativo di pywebview (tkinter non è più incluso nell'exe).

---

## 🆕 Novità

- **Temi** (solo colori e atmosfera): Obsidian, Xbox Mode, PS5, Bianco totale. Impostazioni → *Aspetto* (sinistra/destra per cambiare).
- **Sfondo del gioco**: lo sfondo a tutto schermo cambia con il gioco selezionato (hero orizzontale; se manca usa il poster sfocato). Corretto anche un bug per cui il `<body>` lo copriva.
- **SteamGridDB**: Impostazioni → *Immagini dei giochi*, incolla la tua chiave API gratuita (steamgriddb.com → Preferenze → API). Poster e sfondi vengono scaricati in automatico e salvati in cache; nel selettore copertine (X) le immagini SteamGridDB compaiono per prime. La chiave resta sul PC e non viene mai mandata alla UI.
- **Store**: scheda STORE con le ultime uscite e il confronto prezzi Steam / Epic Games / Xbox (Microsoft Store), più la barra di ricerca. A apre la pagina dello store con il prezzo più basso (nel browser), X aggiorna. Usa endpoint pubblici **non ufficiali**: se uno store cambia o non risponde, gli altri vengono mostrati lo stesso e in alto compare "Non raggiungibile: ...".
- **App e giochi personalizzati**: riquadro **+** a fine coda (schede TUTTI e APP). Scegli un `.exe`/`.lnk`/`.bat`/`.url`, il nome viene ricavato dal file; dai Dettagli si può rimuovere.
- **Tasti**: Discord e Browser sono ora due pulsanti piccoli accanto a Spotify/Telemetria.

Se modifichi `index.html`, `app.js` o `input.css`, ricompila il CSS: `npx tailwindcss@3.4.17 -c tailwind.config.js -i input.css -o static/app.css --minify`.


---

## 🎨 Nuova UI (design Stitch "Nexus")

- **Tema Nexus** (predefinito): nero puro, pannelli `#16181b`, accento azzurro ghiaccio, anello mint sul riquadro selezionato. Gli altri temi (Obsidian, Xbox Mode, PS5, Bianco totale) restano disponibili da Impostazioni → Aspetto.
- **Header**: unico per tutta l'app (home e store): pill profilo + conteggio giochi, L1 / schede / R1, stato rete e controller, schermo intero, impostazioni, orologio con data.
- **Carte della libreria**: immagine 16:10 + titolo centrato; i dettagli (ore, ultimo avvio, piattaforma) sono nell'hero in alto.
- **Pagina Store** (scheda STORE): barra di ricerca, riquadro "In evidenza" con il **Confronto store** (prezzi Steam / Epic / Xbox ordinati dal più basso, con sconto) e griglia delle ultime uscite. "In evidenza" segue il riquadro selezionato col controller (o il mouse); A apre l'offerta migliore nel browser, X aggiorna.
- Le parti del mockup che nel launcher non hanno dati reali (livello, trofei, FPS/DLSS, obiettivi, volume/batteria, Discord vocale) non sono state riprodotte: al loro posto ci sono i dati veri (ore di gioco, numero giochi, stato rete/controller) e il pulsante Discord.

---

## 🆕 Versione 3

**Layout fedele al design Stitch**: stessi margini, altezze e spaziature del mockup (contenitore 1720 px con margini 56, header da 80 px, hero, libreria con 6 carte per riga, 3 widget 4/3/5 colonne). La barra con i tasti guida in basso è stata rimossa. Lo store usa lo stesso header della home. Le sezioni Steam ed Epic sono state tolte dalle schede (restano i filtri nelle Impostazioni → Libreria).

**Ordine dei giochi**: per ultimo aperto (mai alfabetico). Vale il più recente tra gli avvii da FEYORA e la data di Steam; a parità, i più recenti da installare/aggiungere. Altri ordinamenti (più giocati, aggiunti) sono nelle Impostazioni.

**12 lingue** (Impostazioni → Generale → Lingua): italiano, English, español, français, Deutsch, português (Brasil), русский, 中文（简体）, 日本語, 한국어, Türkçe, polski. Alla prima apertura si usa la lingua di Windows se è tra queste. Per correggere o aggiungere traduzioni: modifica `tools/i18n_part*.py` (una riga per voce, 12 lingue in ordine) ed esegui `python tools/gen_i18n.py` (controlla che ogni voce abbia tutte le lingue e gli stessi segnaposto) che rigenera `static/i18n.js`.

**Impostazioni** (6 categorie, L1/R1 per cambiare): Generale (lingua, nome profilo, avvio con Windows, avvio a schermo intero), Aspetto (tema, dimensione interfaccia, sfondo del gioco e intensità, riduci animazioni, widget), Libreria (Steam/Epic, ordinamento, SteamGridDB, ricarica, svuota cache), Controller e audio (stile pulsanti Xbox/PlayStation, vibrazione e intensità, effetti e volume), Negozio (paese dei prezzi, store attivi, chiave IsThereAnyDeal, **test connessione**), Sistema (versione, cartella dati, ripristino, chiudi).

**Negozio (motore prezzi)**: ogni store ha più strade di ripiego e gli errori sono leggibili. *Impostazioni → Negozio → Test connessione* mostra cosa risponde e con quale errore. Epic protegge il catalogo con un anti-bot: se blocca, inserisci la chiave gratuita di **IsThereAnyDeal** (isthereanydeal.com/apps) e i prezzi di Steam, Epic e Microsoft arrivano da lì in modo stabile. Gli endpoint diretti di Epic e Microsoft non sono ufficiali e possono cambiare.
