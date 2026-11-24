-- Projets "favoris" (demandé par Louis, nov. 2026) : une étoile cliquable
-- dans la liste des projets (voir Projets.jsx) pour épingler les projets à
-- suivre de près, affichés ensuite tout en bas du Dashboard — évite d'avoir
-- à chercher le projet à chaque fois. Simple drapeau, sans logique propre,
-- indépendant du statut du projet.
alter table projets add column if not exists favori boolean not null default false;
