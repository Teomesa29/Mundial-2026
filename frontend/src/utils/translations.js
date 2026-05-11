export const COUNTRY_TRANSLATIONS = {
  "Argentina": "Argentina", "Brazil": "Brasil", "France": "Francia", "England": "Inglaterra",
  "Spain": "España", "Germany": "Alemania", "Portugal": "Portugal", "Netherlands": "Países Bajos",
  "Italy": "Italia", "Belgium": "Bélgica", "Croatia": "Croacia", "Uruguay": "Uruguay",
  "Colombia": "Colombia", "Morocco": "Marruecos", "USA": "Estados Unidos", "United States": "Estados Unidos",
  "Mexico": "México", "Switzerland": "Suiza", "Senegal": "Senegal", "Japan": "Japón",
  "South Korea": "Corea del Sur", "Australia": "Australia", "Ecuador": "Ecuador", "Peru": "Perú",
  "Chile": "Chile", "Venezuela": "Venezuela", "Paraguay": "Paraguay", "Bolivia": "Bolivia",
  "Canada": "Canadá", "Costa Rica": "Costa Rica", "Panama": "Panamá", "Jamaica": "Jamaica",
  "Egypt": "Egipto", "Cameroon": "Camerún", "Ghana": "Ghana", "Nigeria": "Nigeria",
  "Iran": "Irán", "Saudi Arabia": "Arabia Saudita", "Qatar": "Qatar", "Serbia": "Serbia",
  "Poland": "Polonia", "Denmark": "Dinamarca", "Sweden": "Suecia", "Norway": "Noruega",
  "Wales": "Gales", "Scotland": "Escocia", "Turkey": "Turquía", "Ukraine": "Ucrania",
  "Austria": "Austria", "Hungary": "Hungría", "Czech Republic": "República Checa", "Romania": "Rumania",
  "Algeria": "Argelia", "Tunisia": "Túnez", "Mali": "Malí", "Ivory Coast": "Costa de Marfil",
  "Cote d'Ivoire": "Costa de Marfil", "South Africa": "Sudáfrica"
};

export const getTranslatedName = (name) => {
  if (!name) return "";
  return COUNTRY_TRANSLATIONS[name] || name;
};

export const getTranslatedStage = (stage, groupName) => {
  if (groupName) {
    if (groupName.toLowerCase().startsWith('group')) {
      return groupName.replace(/group/i, 'Grupo');
    }
    return groupName;
  }
  
  const map = {
    'group': 'Fase de Grupos',
    'group_stage': 'Fase de Grupos',
    'round_of_32': 'Dieciseisavos',
    'round_of_16': 'Octavos de Final',
    'quarterfinal': 'Cuartos de Final',
    'semifinal': 'Semifinal',
    'third_place': 'Tercer Puesto',
    'final': 'Final'
  };
  return map[stage?.toLowerCase()] || stage || 'Fase de Grupos';
};
