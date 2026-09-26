const indianLanguages = [
    ["as", "Assamese"], ["bn", "Bengali"], ["brx", "Bodo"], ["doi", "Dogri"],
    ["gu", "Gujarati"], ["hi", "Hindi"], ["kn", "Kannada"], ["ks", "Kashmiri"],
    ["kok", "Konkani"], ["mai", "Maithili"], ["ml", "Malayalam"], ["mni", "Manipuri"],
    ["mr", "Marathi"], ["ne", "Nepali"], ["or", "Odia"], ["pa", "Punjabi"],
    ["sa", "Sanskrit"], ["sat", "Santali"], ["sd", "Sindhi"], ["ta", "Tamil"],
    ["te", "Telugu"], ["ur", "Urdu"]
].map(([code, name]) => ({ code, name }));

const fallbackInternational = [
    ["ar", "Arabic"], ["zh", "Chinese"], ["nl", "Dutch"], ["en", "English"],
    ["fr", "French"], ["de", "German"], ["el", "Greek"], ["he", "Hebrew"],
    ["id", "Indonesian"], ["it", "Italian"], ["ja", "Japanese"], ["ko", "Korean"],
    ["ms", "Malay"], ["fa", "Persian"], ["pl", "Polish"], ["pt", "Portuguese"],
    ["ro", "Romanian"], ["ru", "Russian"], ["es", "Spanish"], ["sw", "Swahili"],
    ["sv", "Swedish"], ["th", "Thai"], ["tr", "Turkish"], ["uk", "Ukrainian"],
    ["vi", "Vietnamese"]
].map(([code, name]) => ({ code, name }));

let cachedCatalog;
let cacheExpiresAt = 0;

export async function languageCatalog() {
    if (cachedCatalog && cacheExpiresAt > Date.now()) return cachedCatalog;
    let international = fallbackInternational;
    try {
        const response = await fetch("https://restcountries.com/v3.1/all?fields=languages", { signal: AbortSignal.timeout(5_000) });
        if (!response.ok) throw new Error(`Language source returned ${response.status}`);
        const countries = await response.json();
        const byName = new Map();
        for (const country of countries) {
            for (const [code, name] of Object.entries(country.languages ?? {})) {
                if (typeof name === "string") byName.set(name, { code, name });
            }
        }
        const indianNames = new Set(indianLanguages.map((language) => language.name));
        international = [...byName.values()].filter((language) => !indianNames.has(language.name)).sort((a, b) => a.name.localeCompare(b.name));
    }
    catch {
        international = fallbackInternational;
    }
    cachedCatalog = { indian: indianLanguages, international };
    cacheExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
    return cachedCatalog;
}
