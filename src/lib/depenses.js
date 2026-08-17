// Catégories de dépenses générales (loyer, comptabilité, assurance...),
// partagées entre Depenses.jsx (formulaire/filtre) et Rapprochement.jsx
// (création rapide d'une dépense depuis une transaction Qonto non
// rapprochée) — extrait dans son propre fichier pour que Depenses.jsx
// puisse rester un composant "pur" (react-refresh/only-export-components).
export const CATEGORIES = ['Loyer & charges', 'Comptabilité & juridique', 'Assurance', 'Abonnements & logiciels', 'Banque & frais financiers', 'Marketing & communication', 'Fournitures & matériel', 'Déplacements', 'Impôts & taxes', 'Autre']
