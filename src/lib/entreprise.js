// Informations légales de Partenaires Particuliers, centralisées ici pour
// être utilisées par tous les documents PDF (devis, factures, bons de
// commande, CGV) sans jamais les dupliquer ou les laisser diverger.
// Source : https://www.pappers.fr/entreprise/partenaires-particuliers-107426520
// et les coordonnées bancaires Qonto fournies par l'utilisateur (10/08/2026).
export const ENTREPRISE = {
  nom: 'Partenaires Particuliers',
  formeJuridique: 'SASU',
  formeJuridiqueLongue: 'société par actions simplifiée unipersonnelle',
  capitalSocial: 30000,
  adresse: '9 passage Cottin',
  codePostal: '75018',
  ville: 'Paris',
  siret: '107 426 520 00014',
  siren: '107 426 520',
  rcsVille: 'Paris',
  tvaIntracom: 'FR79107426520',
  contact: {
    nom: 'Louis Serayet',
    role: 'Président',
    tel: '06 11 24 50 39',
    email: 'lserayet@partenaires-particuliers.com',
  },
  assurance: {
    compagnie: 'AXA',
  },
  banque: {
    nom: 'Qonto',
    iban: 'FR76 1695 8000 0195 3064 6752 547',
    bic: 'QNTOFRP1XXX',
  },
  tvaTauxDefaut: 20, // %
}
