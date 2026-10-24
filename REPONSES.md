# REPONSES.md — TP2 Docker Compose

> Réponses aux questions Q1 à Q14 de l'énoncé (`README.md`).

## Partie 1 — Découvrir les deux applications

### Q1

`backend/config/database.js` lit les variables suivantes pour PostgreSQL :

- `DATABASE_CLIENT` (doit valoir `postgres` ; `sqlite` par défaut) ;
- `DATABASE_HOST` (`localhost` par défaut) ;
- `DATABASE_PORT` (5432 par défaut) ;
- `DATABASE_NAME` (`strapi` par défaut) ;
- `DATABASE_USERNAME` (`strapi` par défaut) ;
- `DATABASE_PASSWORD` (`strapi` par défaut) ;
- et, de façon optionnelle : `DATABASE_URL`, `DATABASE_SCHEMA`, `DATABASE_SSL`,
  `DATABASE_SSL_*`, `DATABASE_POOL_MIN` / `DATABASE_POOL_MAX`,
  `DATABASE_CONNECTION_TIMEOUT`.

Il faut donner à `DATABASE_HOST` la valeur **`postgres`** (le nom du service Docker) et non
`localhost` : dans un conteneur, `localhost`/`127.0.0.1` désigne **le conteneur lui-même**, pas
la machine hôte ni les autres conteneurs. Docker Compose fournit un DNS interne qui résout le
nom de service `postgres` vers l'adresse IP du conteneur PostgreSQL sur le réseau `backend`.

### Q2

`backend/.env.example` est un **modèle** : il liste les variables d'environnement attendues avec
des valeurs d'exemple, sert de documentation et évite d'oublier une variable. On le copie en
`.env` (`cp .env.example .env`) pour obtenir une configuration fonctionnelle sans rien inventer.

Le vrai `.env` ne doit jamais être commité car il contient les **secrets** (mots de passe,
`APP_KEYS`, `JWT_SECRET`…). Une fois poussé sur Git, un secret reste dans l'historique même si on
le supprime ensuite ; il serait de plus lisible par toute personne ayant accès au dépôt. C'est
pourquoi `.gitignore` contient `.env` et que seul `.env.example` est versionné.

## Partie 2 — PostgreSQL

### Q3

- `docker compose down` arrête et **supprime les conteneurs et les réseaux**, mais **conserve les
  volumes nommés** : les données de PostgreSQL restent dans `tp2_pgdata` et sont retrouvées au
  `up` suivant.
- `docker compose down -v` fait la même chose **et supprime les volumes nommés** : la base, les
  données pgAdmin et les uploads Strapi sont **définitivement perdus**. Le prochain démarrage
  recrée une base vide.

Test effectué : après un `down` puis `up -d`, les 3 articles publiés étaient toujours présents
(`/api/articles` renvoie `total: 3`). Un `down -v` les effacerait.

### Q4

Dans un `healthcheck`, `$${POSTGRES_USER}` avec deux `$` sert à **échapper l'interpolation de
Compose**. Avec un seul `$`, Compose remplacerait la variable **au moment où il lit le fichier
compose** (sur la machine hôte). Avec `$$`, Compose écrit un seul `$` dans la commande du
conteneur ; c'est ensuite le **shell du conteneur** (`CMD-SHELL`) qui développe
`${POSTGRES_USER}` à l'exécution, avec la valeur réellement présente dans l'environnement du
conteneur PostgreSQL.

## Partie 3 — pgAdmin

### Q5

- `"Host": "postgres"` : pgAdmin tourne dans son propre conteneur. Il doit joindre PostgreSQL via
  le **nom du service** sur le réseau Docker `backend`, nom que le DNS interne de Compose résout.
  `localhost` désignerait le conteneur pgAdmin lui-même.
- `:ro` signifie **read-only** : le fichier `./pgadmin/servers.json` est monté en lecture seule
  dans le conteneur. pgAdmin peut le lire au démarrage mais ne peut pas le modifier, ce qui
  protège le fichier de l'hôte.
- `${PGADMIN_PORT:-5050}` : substitution avec **valeur par défaut**. Compose utilise la variable
  `PGADMIN_PORT` du `.env` si elle existe et n'est pas vide, sinon il prend `5050`. Le port hôte
  reste donc configurable sans modifier le `docker-compose.yml`.

## Partie 4 — Strapi

### Q6

On copie d'abord `package.json` et `package-lock.json` puis on lance `npm ci` **avant** de copier
le reste du code pour profiter du **cache de couches Docker**. Tant que les fichiers de
dépendances ne changent pas, la couche `npm ci` (longue) est réutilisée telle quelle. Seules les
couches suivantes sont rejouées quand le code change.

Si on modifie un fichier de `backend/config/` et qu'on relance le build : `npm ci` est **caché**
(non rejoué), puis `COPY . .`, `RUN npm run build` et les étapes de l'image finale sont rejouées
(copie finale et export de l'image). Sans cette séparation, chaque modification de code
réinstallerait toutes les dépendances.

### Q7

- `USER node` fait tourner le processus Strapi avec l'utilisateur non privilégié `node` fourni par
  l'image Node. Si l'application est compromise, l'attaquant n'a pas les droits `root` dans le
  conteneur (principe du moindre privilège).
- `--chown=node:node` attribue les fichiers copiés à l'utilisateur/groupe `node` : sans cela, ils
  appartiendraient à `root` et l'utilisateur `node` ne pourrait pas les lire ou écrire (uploads,
  fichiers temporaires).

### Q8

`depends_on: condition: service_healthy` ordonne le démarrage : Compose ne démarre `strapi`
qu'une fois que le healthcheck de `postgres` (`pg_isready`) est passé, c'est-à-dire que la base
accepte réellement les connexions.

Sans cette condition, Strapi démarrerait en même temps que PostgreSQL et pourrait échouer à se
connecter (« connection refused ») pendant l'initialisation de la base, provoquant des erreurs
ou des redémarrages en boucle.

### Q9

La table s'appelle **`articles`** dans le schéma `public` de la base `strapi`. Strapi 5 stocke
**deux lignes par article publié** : une ligne correspondant à la version brouillon
(`published_at` NULL) et une ligne pour la version publiée (`published_at` renseigné). Avec 3
articles publiés, la table contient donc 6 lignes.

## Partie 5 — Next.js

### Q10

`STRAPI_URL=http://localhost:1337` ne fonctionnerait pas dans le conteneur `frontend` car
`localhost` y désigne **le conteneur frontend lui-même** : rien n'écoute sur le port 1337 dans ce
conteneur. Strapi est un autre conteneur. Il faut utiliser le nom de service
`http://strapi:1337`, résolu par le DNS interne du réseau `frontend` (les deux services y sont
rattachés).

### Q11

Le Dockerfile comporte **3 étapes `FROM`** : `deps` (installation des dépendances), `builder`
(compilation Next.js) et `runner` (image finale).

L'image finale ne contient que le nécessaire à l'exécution : le serveur Node minimal produit par
`output: "standalone"` (`server.js` et les dépendances utiles), le dossier `.next/static` et le
dossier `public`. Elle **ne contient pas** le code source complet, les outils de build ni tout
`node_modules`.

Sans `output: "standalone"`, Next.js ne génère pas `.next/standalone` : la ligne
`COPY --from=builder /app/.next/standalone ./` échoue et **le build Docker échoue**. Taille
mesurée de l'image finale avec `standalone` : **334 MB** (`docker images tp2/frontend`).

## Partie 6 — Réseaux et sécurité

### Q12

`strapi` est dans les **deux réseaux** parce qu'il est le **seul service à devoir parler aux deux
zones** : il joint PostgreSQL sur le réseau `backend` et il est joint par le frontend sur le
réseau `frontend`. Il joue le rôle de pont contrôlé entre les deux réseaux.

Ne publier aucun port pour `postgres` est intéressant car la base n'est alors **joignable ni
depuis la machine hôte ni depuis l'extérieur** : seuls les conteneurs du réseau `backend`
peuvent l'atteindre. Cela réduit fortement la surface d'attaque (pas d'exposition réseau
inutile).

### Q13

Deux autres mesures pour durcir la stack en production :

1. **Ne pas stocker les secrets en clair dans `.env`/`environment`** : utiliser Docker secrets
   (ou un coffre-fort type Vault) et des fichiers montés, avec des secrets régénérés.
2. **Faire tourner les conteneurs en non-root et en système de fichiers read-only**, avec des
   limites de ressources (`deploy.resources.limits`) et des images épinglées par digest : cela
   limite l'impact d'une compromission et les attaques par déni de service.

(Autres pistes valables : TLS/reverse proxy, mise à jour régulière des images, `cap_drop: ALL`,
scan de vulnérabilités des images.)

## Partie 7 — Cycle de vie

### Q14

`restart: unless-stopped` demande à Docker de redémarrer automatiquement le conteneur **sauf s'il
a été arrêté volontairement** (état « stopped » mémorisé). Il couvre les crashes du processus
applicatif et le redémarrage du démon Docker.

Après `docker compose stop strapi` (ou `docker compose kill strapi`), l'arrêt est **volontaire** :
Docker considère que l'administrateur a décidé de l'arrêter et ne le relance pas. Docker ne le
redémarre automatiquement qu'en cas de **crash** du processus principal, d'`OOM kill`, ou après
un redémarrage du démon Docker (si le conteneur n'avait pas été stoppé explicitement).

## Notes d'exécution

- Compte administrateur Strapi créé : `admin@example.com` / `Admin-tp2-2026!`.
- Rôle *Public* : `find` et `findOne` activés sur `Article` (vérifié via
  `curl http://localhost:1337/api/articles`).
- 3 articles publiés ; le front `http://localhost:3000` les affiche.
- Isolation vérifiée depuis le conteneur `frontend` : `nc -zv postgres 5432` échoue
  (`bad address`) et `wget http://strapi:1337/_health` répond `OK`.
