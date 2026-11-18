# Famtree · Archivio di famiglia

Albero genealogico interattivo (React + Firebase), pubblicato su GitHub Pages:
**https://bottaridennis.github.io/famtree/**

## Funzionalità

- **Albero a generazioni** con layout automatico: coppie affiancate, figli centrati sotto i genitori,
  ordinamento che riduce gli incroci; ogni famiglia ha la sua corsia di collegamento, così le linee
  di famiglie diverse non si sovrappongono.
- Zoom/pan con mouse, trackpad e touch; pulsanti *ingrandisci / riduci / adatta*.
- **Scheda persona**: date e luoghi di nascita e morte, età, professione, soprannome, biografia,
  genitori, coniugi, figli, fratelli (cliccabili per navigare).
- **Evidenzia linea di sangue**: antenati e discendenti della persona selezionata.
- **Elenco e ricerca** per nome, luogo o anno, filtri viventi/defunti, statistiche.
- Date flessibili: solo anno, mese/anno o data completa; “defunto” anche senza data nota.
- **Amministrazione** (solo account admin verificato): aggiunta rapida di figli, coniugi e genitori,
  legami di coppia sempre sincronizzati su entrambe le persone, eliminazione che ripulisce i riferimenti,
  prevenzione dei cicli (nessuno può essere antenato di se stesso).
- **Backup**: esporta/importa JSON, esporta **GEDCOM** (compatibile con MyHeritage, Ancestry, Gramps…).
- Tema chiaro/scuro, layout responsive (pannello a scomparsa su mobile), scorciatoie da tastiera
  (`/` cerca, `+`/`-` zoom, `0` adatta, `n` nuova persona, `Esc` chiudi), cache offline di Firestore.

## Dati d’esempio

- Da amministratore: menu **⋯ → Carica famiglia d’esempio** (circa 170 persone su 12 generazioni,
  dal 1690 a oggi, con mestieri d’epoca, vedovanze, emigrazione e storie di famiglia).
- Oppure **⋯ → Importa backup…** con il file [`demo/famiglia-rossi-12-generazioni.json`](demo/famiglia-rossi-12-generazioni.json).

## Sviluppo

```bash
npm install
npm run dev
```

Apri `http://localhost:3000/`. In sviluppo puoi provare l’interfaccia con dati finti, senza toccare
Firestore: `http://localhost:3000/?mock` (aggiungi `&admin` per simulare l’amministratore).

## Pubblicazione su GitHub Pages

Il workflow `.github/workflows/deploy.yml` compila e pubblica ad ogni push su `main`.

Configurazione una tantum:

1. GitHub → *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
2. Firebase Console → *Authentication → Settings → Authorized domains*: aggiungi
   **`bottaridennis.github.io`** (altrimenti l’accesso con Google fallisce con `auth/unauthorized-domain`).
3. Crea il secret `FIREBASE_CONFIG` (vedi sotto).

## Configurazione Firebase (secret)

La configurazione Firebase **non è nel repository**.

- **GitHub Pages:** in *Settings → Secrets and variables → Actions → New repository secret* crea
  **`FIREBASE_CONFIG`** e incolla l’intero contenuto JSON di `firebase-applet-config.json`
  (`projectId`, `appId`, `apiKey`, `authDomain`, `firestoreDatabaseId`, …). Il workflow lo usa durante il build.
- **In locale:** copia il file `firebase-applet-config.json` nella root del progetto (è in `.gitignore`)
  oppure imposta `FIREBASE_CONFIG` in un file `.env.local`.
- **Regole Firestore:** `firebase deploy --only firestore:rules --project <id-progetto>`.

Nota: i valori finiscono comunque nel JavaScript pubblicato (è normale per le app web Firebase);
la sicurezza dei dati è garantita da `firestore.rules`: lettura pubblica, scrittura solo per l’email
amministratore verificata. Per cambiare amministratore aggiorna sia `src/config.ts` sia `firestore.rules`.
Consigliato: in Google Cloud Console limita la API key ai referrer `bottaridennis.github.io/*` e `localhost:*`.
