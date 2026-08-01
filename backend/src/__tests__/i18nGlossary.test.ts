import { getT } from "../../../uEvents/lib/i18n";
import { postTypeLabel, postTypeBadge } from "../../../uEvents/lib/postType";
import { translateCategory, translateCategoryList } from "../../../uEvents/lib/categories";

// Guards the three ways localized copy kept drifting:
//   1. a key added to one language and forgotten in the other,
//   2. a post type rendered from the raw API string instead of the glossary,
//   3. a club's comma-separated category list missing the translation table.
// Pure string work — no database, so this runs even when Postgres is down.

describe("en/fr translation tables agree", () => {
    const en = getT("en") as Record<string, unknown>;
    const fr = getT("fr") as Record<string, unknown>;

    it("define exactly the same keys", () => {
        expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
    });

    it("keep the same shape per key (plain string vs. formatter)", () => {
        for (const key of Object.keys(en)) {
            expect(`${key}:${typeof fr[key]}`).toBe(`${key}:${typeof en[key]}`);
        }
    });

    // Identical in both tables on purpose: two brand names, and one placeholder
    // that is already French because it labels the French-description field.
    const SAME_IN_BOTH = new Set(["twitterLabel", "obTwitter", "phDescriptionFr"]);

    it("leave no French value identical to a multi-word English one", () => {
        // Single words that are the same in both languages (SPORTS, SOCIAL…) are
        // fine; a whole English sentence sitting in the French table is not.
        const untranslated = Object.keys(en).filter((key) => {
            const e = en[key], f = fr[key];
            return !SAME_IN_BOTH.has(key)
                && typeof e === "string" && typeof f === "string"
                && e === f && e.trim().split(/\s+/).length > 2;
        });
        expect(untranslated).toEqual([]);
    });
});

describe("post types use one name per type per language", () => {
    const cases = [
        ["EVENT",        "Event",        "Événement"],
        ["ANNOUNCEMENT", "Announcement", "Annonce"],
        ["UPDATE",       "Update",       "Mise à jour"],
        ["POLL",         "Poll",         "Sondage"],
    ] as const;

    it.each(cases)("%s", (type, expectEn, expectFr) => {
        expect(postTypeLabel(type, getT("en"))).toBe(expectEn);
        expect(postTypeLabel(type, getT("fr"))).toBe(expectFr);
    });

    // The API hands these back as "ANNOUNCEMENT" (Prisma enum) in some responses
    // and "announcement" (feed mapper) in others.
    it("accepts either casing the API sends", () => {
        expect(postTypeLabel("announcement", getT("fr"))).toBe("Annonce");
        expect(postTypeBadge("announcement", getT("fr"))).toBe("ANNONCE");
    });

    it("falls back to the raw string for unknown types", () => {
        expect(postTypeLabel("WEBINAR", getT("fr"))).toBe("WEBINAR");
        expect(postTypeLabel("", getT("fr"))).toBe("");
    });
});

describe("category translation", () => {
    it("translates a single category", () => {
        expect(translateCategory("Academic", "fr")).toBe("Académique");
    });

    it("translates each tag in a comma-separated list", () => {
        // The club profile and search cards store this as one free-text field.
        expect(translateCategoryList("Academic, Social, Tech", "fr"))
            .toBe("Académique, Social, Techno");
    });

    it("keeps unknown tags verbatim rather than blanking them", () => {
        expect(translateCategoryList("Academic, Quidditch", "fr"))
            .toBe("Académique, Quidditch");
    });

    it("leaves English untouched", () => {
        expect(translateCategoryList("Academic, Social", "en")).toBe("Academic, Social");
    });
});
