/**
 * Category / tag localization.
 *
 * Event categories are stored in the database as English strings (e.g. "Academic",
 * "Free Food", "Workshop"). This maps the known ones to French for display. Unknown
 * or custom categories fall back to the original string so nothing ever renders blank.
 */
type Lang = "en" | "fr";

// key = lowercased English category, value = French label
const FR: Record<string, string> = {
    "academic": "Académique",
    "social": "Social",
    "sports": "Sports",
    "sport": "Sport",
    "arts & culture": "Arts et culture",
    "arts": "Arts",
    "technology": "Technologie",
    "tech": "Techno",
    "business": "Affaires",
    "community": "Communauté",
    "health & wellness": "Santé et bien-être",
    "wellness": "Bien-être",
    "fitness": "Mise en forme",
    "food & drink": "Alimentation",
    "career": "Carrière",
    "networking": "Réseautage",
    "workshop": "Atelier",
    "competition": "Compétition",
    "study": "Étude",
    "music": "Musique",
    "film": "Cinéma",
    "photography": "Photographie",
    "environment": "Environnement",
    "cultural": "Culturel",
    "engineering": "Génie",
    "tournament": "Tournoi",
    "free food": "Nourriture gratuite",
};

/** Translate a single category/tag for the given language. Falls back to the input. */
export function translateCategory(name: string, lang: Lang): string {
    if (lang !== "fr" || !name) return name;
    return FR[name.trim().toLowerCase()] ?? name;
}
