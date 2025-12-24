
# Instruktioner för AI-utveckling (Drive2FS)

SKRIV INTE ÖVER netlify.toml eller public/_redirects EFTERSOM DIN SANDLÅDA STOPPAR DIG OCH JAG HAR REDAN SKRIVIT DEM MANUELLT

## Viktiga filer som INTE kan skrivas via XML:
Dessa filer måste hanteras manuellt av användaren i filsystemet eftersom AI-sandboxen begränsar dem:

1.  **`netlify.toml`** (i roten):
    - Hanterar byggsteg för Netlify.
    - Innehåller SPA-redirects.
2.  **`public/_redirects`**:
    - Kopieras av Vite till dist-mappen.
    - Säkerställer att PDF-generering och routing fungerar på Netlify.

## Byggmiljö:
- Projektet använder **Vite**.
- API-nycklar läses via `process.env.API_KEY` (mappat i `vite.config.ts` från `VITE_API_KEY`).
- Använd ALDRIG `importmap` i `index.html`, det sköts av byggverktyget.

## Kom ihåg:
Vid varje ny session, läs dessa regler för att inte föreslå ändringar som tar bort dessa filer eller lägger tillbaka gamla import-metoder.
