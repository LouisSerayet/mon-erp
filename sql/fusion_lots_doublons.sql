-- Fusionne les lots en double qui partagent le même numéro au sein d'un
-- même projet (demandé par Louis, nov. 2026, après un bug sur "Transformer
-- en lot" : le nouveau lot calculait son N° à partir du NOMBRE de lots
-- existants plutôt que du plus grand numéro déjà utilisé, ce qui entre en
-- collision dès qu'un projet a un "trou" dans sa numérotation — par ex. un
-- projet avec les lots 2, 3, 4, 5 mais pas de lot 1, laissé par une
-- ancienne suppression. Résultat concret chez Louis : deux lignes "LOT 5"
-- distinctes, chacune affichant le mélange des lignes des deux lots. Le
-- bug de numérotation est corrigé côté code (voir prochainNumeroLot dans
-- ProjetDetail.jsx) — ce script ne fait que nettoyer les doublons déjà
-- créés avant le correctif.
--
-- Ne touche à AUCUNE ligne "enfant" (projet_lignes.lot) : elles portent
-- déjà le bon numéro (partagé par construction avec les deux lots en
-- double) et resteront visibles normalement sous le lot conservé une fois
-- le doublon supprimé.
--
-- Garde, pour chaque (projet, numéro) en double, la ligne de type 'lot' la
-- plus ANCIENNE (triée par `ordre`) et passe les autres en soft-delete
-- (deleted_at), exactement comme une suppression de lot normale depuis
-- l'appli — récupérable 30 jours depuis la Corbeille si besoin.
with doublons as (
  select id,
         row_number() over (partition by projet_id, numero order by ordre asc) as rang
  from projet_lignes
  where type = 'lot' and deleted_at is null
)
update projet_lignes
set deleted_at = now()
where id in (select id from doublons where rang > 1);

-- Vérification avant/après : repère les projets qui ont encore des lots en
-- double après l'exécution de l'UPDATE ci-dessus (ne devrait plus rien
-- renvoyer).
select projet_id, numero, count(*) as nb
from projet_lignes
where type = 'lot' and deleted_at is null
group by projet_id, numero
having count(*) > 1;
