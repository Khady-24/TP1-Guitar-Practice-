# Rapport d'usage de l'IA 

Pour chaque mission, détailler et fournir des explications concernant : objectif; prompt principal; plan proposé par l'agent; vérifications réalisées par le binôme; erreurs ou propositions rejetées; fichiers effectivement modifiés; preuve de fonctionnement; ce que chaque membre sait maintenant expliquer sans l'agent.

**Assistant utilisé :** Claude Sonnet 5, via Claude Code (extension intégrée à l'éditeur).
**Travail réalisé en solo** (changement en cours de séance, initialement prévu en binôme).

## Explication : Signal vs `localStorage`

Un **Signal** Angular (`signal<T>()`) est une valeur réactive en mémoire : quand on appelle `.set()` ou `.update()`, tous les templates et calculs qui lisent ce signal (via `signal()`) se remettent à jour automatiquement, sans rechargement de page. Dans `AuthService`, `currentUser` et `token` sont des signaux : c'est grâce à eux que la navigation (`app.html`) change instantanément entre "Connexion" et "Déconnexion" dès qu'on se connecte, sans code supplémentaire pour rafraîchir la vue.

**`localStorage`** est un stockage clé-valeur per sistant fourni par le navigateur : il survit à un rechargement de page ou à la fermeture de l'onglet, mais il n'est **pas réactif** — lire `localStorage.getItem('gpc_token')` ne déclenche aucune mise à jour de l'interface si la valeur change ailleurs.

**Pourquoi les deux sont nécessaires** : le signal `token` pilote l'UI en temps réel pendant que l'app tourne, mais il est réinitialisé à chaque rechargement de page (perdu en mémoire). `localStorage` sert donc à *retrouver* le token après un rechargement : au démarrage du service (`readonly token = signal<string | null>(localStorage.getItem('gpc_token'))`), on lit `localStorage` une seule fois pour initialiser le signal, puis c'est le signal qui pilote tout le reste pendant la session.

## Mission 0 — Cartographier l'application

- **Objectif :** identifier le composant racine, la configuration des routes, l'enregistrement de `HttpClient`, les modèles/services/pages, et le mécanisme d'ajout du JWT ; produire un schéma annoté du flux de connexion ; distinguer les routes publiques/protégées dans `API_CONTRACT.md`.
- **Prompt principal :** demande de localiser dans le code chacun de ces éléments et de produire un schéma annoté du clic sur « Se connecter ».
- **Plan proposé par l'agent :** lecture directe des fichiers clés (`main.ts`, `routes.ts`, `app.ts`/`app.html`, `auth.interceptor.ts`, `auth.guard.ts`, `auth.service.ts`, `API_CONTRACT.md`) puis synthèse sous forme de réponses ciblées + schéma texte étape par étape du flux HTTP.
- **Vérifications réalisées :** relecture des réponses, comparaison avec les fichiers réels du projet (chemins et numéros de ligne cités vérifiables directement dans l'éditeur).
- **Erreurs ou propositions rejetées :** aucune — mission de lecture seule, pas de code produit.
- **Fichiers effectivement modifiés :** aucun.
- **Preuve de fonctionnement :** non applicable (pas de code) ; schéma annoté reproduit ci-dessous.
- **Ce que je sais maintenant expliquer sans l'agent :**
  - pourquoi `AppComponent` ne contient que le `<router-outlet />` et comment `provideRouter`/`provideHttpClient` sont déclarés dans `main.ts` (approche standalone, sans `NgModule`) ;
  - comment `authGuard` bloque la navigation côté client, indépendamment de ce que fait le backend ;
  - comment `authInterceptor` ajoute `Authorization: Bearer <token>` uniquement quand un token existe, et pourquoi `/auth/login` n'a jamais cet en-tête.

### Schéma annoté — flux du clic sur « Se connecter »

```text
[login-page.html]  (ngSubmit)="submit()"
        │  l'utilisateur clique, le formulaire contient {email, password}
        ▼
[login-page.ts] submit()
        │  1. form.getRawValue() → {email, password}
        │  2. appelle auth.login(email, password)   ← le composant n'appelle jamais HttpClient directement
        ▼
[auth.service.ts] login()
        │  this.http.post<AuthResponse>('/api/auth/login', {email, password})
        ▼
[auth.interceptor.ts] authInterceptor
        │  lit AuthService.token() → null (pas encore connecté)
        │  → requête transmise SANS modification (pas d'en-tête Authorization,
        │    cohérent avec /auth/login qui est une route PUBLIQUE)
        ▼
   HttpClient → proxy (proxy.conf.json) → API Express
        │  POST http://localhost:3000/api/auth/login
        ▼
[Backend Express] valide les identifiants, interroge MongoDB via Mongoose,
        │  signe un JWT
        ▼
   200 { token, user }  ──────────────► retour vers Angular
        ▼
[auth.service.ts] .pipe(tap(storeAuthentication))
        │  - localStorage.setItem('gpc_token', token)
        │  - token.set(token)          → signal mis à jour
        │  - currentUser.set(user)     → signal mis à jour
        ▼
[login-page.ts] subscribe.next()
        │  router.navigateByUrl('/tracks')
        ▼
[routes.ts] la route 'tracks' a canActivate: [authGuard]
        │  authGuard lit token() → maintenant défini → navigation autorisée
        ▼
[tracks-page] s'affiche ; tout appel HttpClient suivant (ex. GET /api/tracks)
        repasse par authInterceptor, qui CETTE FOIS attache
        Authorization: Bearer <token>, satisfaisant la route protégée.
```

**Routes publiques (`API_CONTRACT.md`)** : `GET /health`, `POST /auth/register`, `POST /auth/login`.
**Routes protégées** (nécessitent `Authorization: Bearer <token>`) : `GET/PUT /users/me`, `GET/POST /tracks`, `GET /tracks/:id/audio`, `DELETE /tracks/:id` (bonus).

## Mission 1 — Inscription, Connexion et Profil

- **Objectif :** compléter la partie utilisateur du frontend : formulaires réactifs, validations, appels `/api/auth/*` et `/api/users/me`, gestion du signal `currentUser`, déconnexion, gestion du `401`.
- **Prompt principal :** demande d'implémentation guidée, étape par étape, avec commit après chaque étape validée par moi-même.
- **Plan proposé par l'agent (9 étapes, réalisées dans cet ordre) :**
  1. Chargement automatique du profil à l'arrivée sur la page + retour visuel sur l'enregistrement du nom.
  2. Validation du champ nom (page profil) avec message d'erreur et bouton désactivé si invalide.
  3. Validation par champ des formulaires login/register (email, mot de passe, nom).
  4. Bouton de déconnexion + navigation réactive à l'état d'authentification (signal `token`).
  5. Gestion du `401` dans `auth.interceptor.ts` : déconnexion automatique et redirection `/login`, uniquement quand un token avait été envoyé (pour ne pas interférer avec un simple échec de connexion sur `/auth/login`).
  6. Tests manuels du guard : accès direct à une route protégée sans être connectée, et avec un token trafiqué dans `localStorage`.
  7. Vérification Network (captures DevTools) : connexion réussie, connexion refusée, GET/PUT `/api/users/me`.
  8. Rédaction des livrables (ce document).
  9. Parcours d'intégration final de bout en bout.
- **Vérifications réalisées :**
  - Étape 6 testée manuellement par moi : accès direct à `/profile` déconnectée → redirection `/login` ✅ ; token invalide dans `localStorage` → déconnexion automatique et redirection `/login` ✅.
  - Étape 7 :
    - Connexion réussie (`POST /api/auth/login`, `200 OK`, aucun en-tête `Authorization` dans la requête — cohérent avec une route publique) : ![Connexion réussie](docs/screenshots/login-200-succes.png)
    - Connexion refusée (mauvais mot de passe, `401 {"message":"Identifiants incorrects"}`) : ![Connexion refusée](docs/screenshots/login-401-refuse.png)
    - `GET /api/users/me` (`200`, authentifié via l'en-tête `Authorization: Bearer ...` confirmé visuellement dans l'onglet Headers) : ![Réponse /users/me](docs/screenshots/users-me-200.png)
  - Chaque étape de code a été vérifiée par compilation (`tsc --noEmit`, `ng build`) avant d'être committée.
- **Erreurs ou propositions rejetées :**
  - En voulant vérifier la compilation (étape 3), une installation `node_modules` corrompue a été découverte (`lib.dom.d.ts` manquant). La première correction (réinstallation partielle de `typescript` seul) a elle-même cassé des dépendances natives de `vite`/`rolldown`, provoquant une erreur `ERR_CONNECTION_REFUSED` au démarrage de `ng serve`. Correction finale : suppression complète de `node_modules`/`package-lock.json`, réinstallation propre, puis autorisation explicite des scripts d'installation natifs nécessaires (`esbuild`, `lmdb`, `@parcel/watcher`, `msgpackr-extract`, `fsevents`) via `npm install-scripts approve`.
  - Une suppression accidentelle (par iCloud, pas par l'agent) des fichiers `song1.mp3`/`song2.mp3` a été repérée dans `git status` et volontairement **non committée**.
- **Fichiers effectivement modifiés :**
  - `frontend-starter/src/app/components/profile-page/profile-page.ts` et `.html`
  - `frontend-starter/src/app/components/login-page/login-page.html`
  - `frontend-starter/src/app/components/register-page/register-page.html`
  - `frontend-starter/src/app/components/app/app.ts` et `.html`
  - `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts`
  - `frontend-starter/src/styles.css`
  - `frontend-starter/package.json`, `frontend-starter/package-lock.json` (réparation de l'environnement)
- **Preuve de fonctionnement :**
  - `npx tsc -p tsconfig.app.json --noEmit` : aucune erreur après chaque étape.
  - `npx ng build` : build de production réussi.
  - Tests manuels du guard (étape 6) : voir ci-dessus.
  - Captures Network de l'étape 7 : voir ci-dessus (`docs/screenshots/`).
- **Ce que je sais maintenant expliquer sans l'agent :**
  - pourquoi le profil se charge dans le `constructor()` du composant (le même pattern que `TracksPageComponent`), et pourquoi ça fonctionne avec `inject()` ;
  - comment afficher une erreur de validation par champ (`control.invalid && control.touched`) sans toucher aux validateurs existants ;
  - pourquoi l'intercepteur ne redirige vers `/login` sur un `401` que si un token avait été envoyé, pour ne pas perturber l'écran de connexion lui-même ;
  - comment diagnostiquer un problème d'environnement npm (ports, `node_modules` corrompu, scripts d'installation bloqués) plutôt que de l'attribuer au code applicatif.

## Mission 2 — Bibliothèque paginée

- **Objectif :** vérifier/compléter `TrackService.list(page, limit)`, représenter `tracks`/`page`/`pages`/`loading`/erreur avec des Signals, afficher avec `@for`/`@empty`/`@if`, pagination serveur (pas de découpage local).
- **Prompt principal :** demande de réaliser TP2 « de A à Z », en repartant de l'état du starter.
- **Plan proposé par l'agent :** analyse du starter existant (`TrackService.list` envoyait déjà `page`/`limit`, signals `tracks`/`page`/`pages`/`loading` déjà présents) ; seul manquait un signal d'erreur visible pour l'utilisateur. Ajout de `listError` dans `TracksPageComponent`, affiché dans le template.
- **Vérifications réalisées :** compilation (`tsc --noEmit`, `ng build`) ; testé manuellement par moi dans DevTools → Network : chaque clic sur "Préc."/"Suiv." déclenche bien un nouveau `GET /api/tracks?page=X&limit=5` avec `page` qui change (`tracks?page=1&limit=5` puis `tracks?page=2&limit=5` observés).
- **Erreurs ou propositions rejetées :** aucune — le mécanisme de pagination serveur du starter était déjà conforme au contrat, pas besoin de le réécrire.
- **Fichiers effectivement modifiés :** `frontend-starter/src/app/components/tracks-page/tracks-page.ts`.
- **Preuve de fonctionnement :** build + type-check propres ; pagination confirmée dans Network (voir ci-dessus).
- **Ce que je sais maintenant expliquer sans l'agent :**
  - pourquoi on ne doit jamais charger toutes les pistes puis découper côté client (ça casserait la pagination serveur et chargerait inutilement des données) ;
  - comment un signal d'erreur distinct du signal de chargement permet d'afficher les deux états indépendamment.

## Mission 3 — Upload et lecture audio

- **Objectif :** analyser puis compléter le mécanisme d'upload/lecture déjà fourni (validation frontend, états UI, cards présentables, gestion fine de la lecture).
- **Prompt principal :** idem, réalisation de TP2 de bout en bout.
- **Plan proposé par l'agent :**
  1. Validation frontend du fichier (extension parmi `mp3/wav/ogg/m4a` + taille ≤ 25 Mo) avant tout appel HTTP, avec message d'erreur clair (`fileError`).
  2. États `uploading`/`uploadSuccess`/`uploadError` : bouton désactivé et texte "Envoi…" pendant la requête (empêche la double soumission), message de succès ou d'erreur serveur affiché après.
  3. Transformation de la liste en cards (`track-card`) affichant titre, nom original, format (déduit du `mimeType`), taille lisible (Ko/Mo) et date (`DatePipe`).
  4. Lecture : `playingTrackId` indique visuellement la piste en cours (icône + bordure), `audioError` affiche un message si la lecture échoue, `ngOnDestroy` révoque l'`ObjectURL` final à la destruction du composant (en plus de la révocation de l'URL précédente à chaque nouvelle lecture, déjà présente).
- **Vérifications réalisées (manuelles, DevTools Network) :**
  - Upload : `POST /api/tracks`, `201 Created`, en-tête `Authorization: Bearer ...` présent dans la requête.
  - Lecture authentifiée : `GET /api/tracks/:id/audio`, `304`/`200`, en-tête `Authorization: Bearer ...` confirmé dans les Request Headers : ![Lecture authentifiée](docs/screenshots/audio-authorization.png)
  - Rejet d'un format non accepté (`.flac`, reconnu "audio/*" par le sélecteur mais hors de notre liste `mp3/wav/ogg/m4a`) : message affiché **avant** tout appel réseau, aucune requête `POST /api/tracks` déclenchée : ![Format refusé](docs/screenshots/upload-format-refuse.png)
  - Rejet d'un fichier trop volumineux (29,9 Mo, limite 25 Mo) : même comportement, message "Fichier trop volumineux" affiché, bouton désactivé, aucun appel réseau.
  - Nuance par rapport au Checkpoint du sujet (qui évoque un rejet "400 affiché pour un fichier invalide") : ici la validation frontend empêche l'envoi de la requête, donc aucun `400` n'apparaît dans Network pour ces deux cas précis — c'est un comportement plus strict que demandé (on économise l'aller-retour réseau), mais la validation backend (déjà en place, non modifiée) resterait le filet de sécurité si la validation frontend était contournée.
- **Erreurs ou propositions rejetées :** aucune proposition rejetée sur cette mission.
- **Fichiers effectivement modifiés :**
  - `frontend-starter/src/app/components/tracks-page/tracks-page.ts`
  - `frontend-starter/src/app/components/tracks-page/tracks-page.html`
  - `frontend-starter/src/app/components/tracks-page/tracks-page.css`
- **Preuve de fonctionnement :** build + type-check propres ; captures Network ci-dessus (upload `201`, lecture authentifiée, rejets format/taille).

### Flux analysé : upload → stockage → lecture

```text
UPLOAD
[tracks-page.html] (change)="choose($event)"  → fichier choisi, validé côté front (extension + taille)
        ▼
[tracks-page.ts] upload()
        │ construit via TrackService.upload(file, title)
        ▼
[track.service.ts] upload()
        │ new FormData() ; append('audio', file) ; append('title', title)
        │ this.http.post<Track>('/api/tracks', formData)
        ▼
[auth.interceptor.ts] attache Authorization: Bearer <token> (route protégée)
        ▼
POST /api/tracks (multipart/form-data) → backend Express/Multer
        │ valide champ 'audio', format, taille (25 Mo max), stocke le fichier sur disque,
        │ enregistre les métadonnées dans MongoDB
        ▼
201 Track { id, title, originalName, mimeType, size, createdAt }

LECTURE
[tracks-page.html] (click)="play(track)"
        ▼
[tracks-page.ts] play() → TrackService.audio(track.id)
        ▼
[track.service.ts] audio() → this.http.get(`/api/tracks/${id}/audio`, { responseType: 'blob' })
        ▼
[auth.interceptor.ts] attache Authorization: Bearer <token>
        ▼
GET /api/tracks/:id/audio → backend vérifie le JWT ET que la piste appartient à l'utilisateur,
        │ renvoie le flux audio
        ▼
[tracks-page.ts] reçoit un Blob → URL.createObjectURL(blob) → affecté à <audio [src]>
        │ l'URL précédente est révoquée (URL.revokeObjectURL) avant d'en créer une nouvelle,
        │ et l'URL finale est révoquée dans ngOnDestroy()
```

**Pourquoi une URL mise directement dans `src` ne reçoit pas le JWT :** l'attribut `src` d'une balise `<audio>`/`<img>` déclenche une requête HTTP native du navigateur, qui ne passe jamais par le pipeline `HttpClient` d'Angular — donc jamais par `authInterceptor`. C'est pour ça que la lecture passe par `TrackService.audio()` (un vrai appel `HttpClient` avec `responseType: 'blob'`, qui reçoit bien l'en-tête), puis le `Blob` reçu est transformé en `ObjectURL` locale (`blob:http://localhost:4200/...`) qui, elle, peut être mise dans `src` sans requête réseau supplémentaire.

**Pourquoi la validation frontend ne remplace jamais la validation backend :** la validation frontend n'est qu'un confort UX (retour immédiat, pas d'attente réseau pour un fichier évidemment invalide) ; elle est entièrement contournable par un utilisateur malveillant (appel direct à l'API avec `curl`/Postman, extension de fichier trompeuse). Seule la validation côté backend, qui s'exécute dans un environnement non contrôlé par le client, constitue une garantie de sécurité réelle.

### Réponses aux questions buffering/streaming

- **Le backend envoie-t-il le fichier entier en mémoire, ou progressivement depuis le disque ?** Avec Express, un flux de fichier est normalement lu et envoyé en streaming depuis le disque (ex. `fs.createReadStream` piped vers la réponse HTTP), sans charger tout le fichier en mémoire d'un coup — à vérifier dans le handler backend de `/tracks/:id/audio`.
- **À quel moment le composant reçoit-il le fichier avec `responseType: 'blob'` ?** `HttpClient` attend que **toute** la réponse soit reçue côté navigateur avant de résoudre l'observable avec le `Blob` complet — contrairement au streaming progressif, ici le composant ne reçoit rien tant que le téléchargement entier n'est pas terminé.
- **Avec 100 morceaux dans la bibliothèque, sont-ils tous chargés en mémoire dès l'affichage de la liste ?** Non : le code actuel n'appelle `TrackService.audio()` que lors d'un clic sur "▶" (`play(track)`). Le `GET /api/tracks` qui alimente la liste ne renvoie que des métadonnées (titre, taille, date...), jamais les octets audio. Donc seule la piste activement choisie est téléchargée.
- **Différence avec 100 éléments `<audio>` utilisant directement une URL HTTP ?** Si chaque `<audio>` avait un `src` HTTP direct, le navigateur pourrait précharger les métadonnées (voire le contenu, selon l'attribut `preload`) de chacun dès le rendu de la page, multipliant les requêtes et la consommation mémoire/réseau — sans compter qu'aucune ne recevrait le JWT (cf. ci-dessus), donc aucune ne fonctionnerait avec ce backend protégé.
- **Pourquoi faut-il révoquer l'URL créée par `URL.createObjectURL` ?** Cette URL retient en mémoire une référence au `Blob` tant qu'elle n'est pas explicitement libérée avec `URL.revokeObjectURL()` — sans ça, chaque nouvelle lecture accumulerait un `Blob` orphelin en mémoire (fuite mémoire), d'où la révocation de l'ancienne URL à chaque nouvelle lecture et de la dernière URL dans `ngOnDestroy()`.
