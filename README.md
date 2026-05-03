# Lisia Górka — strona internetowa

Statyczna strona domków letniskowych **Lisia Górka** (Dębina, woj. pomorskie).

- HTML / CSS / vanilla JS — bez żadnego frameworka, bez build-stepu
- Treść w `content/site.json` — całość strony zarządzana z poziomu panelu admina
- Hosting: **Cloudflare Pages** (auto-deploy z GitHuba, ok. 30 s na deploy)
- Domena: **lisiagorka.pl**

---

## Struktura projektu

```
.
├── index.html              # Oferta (strona główna) — hero + sekcje
├── kontakt.html            # Strona kontaktowa
├── 404.html                # Strona błędu
├── admin/                  # Panel admina (login + edytor)
│   ├── index.html
│   ├── admin.css
│   └── admin.js
├── assets/
│   ├── css/style.css       # Style strony publicznej
│   ├── js/main.js          # Renderowanie treści z site.json
│   └── images/             # Logo, hero, zdjęcia sekcji (uploady z admina trafiają tutaj)
├── content/
│   └── site.json           # ŹRÓDŁO PRAWDY — wszystkie treści strony
├── _redirects              # Przekierowania Cloudflare Pages
├── robots.txt              # /admin zablokowany dla wyszukiwarek
└── README.md
```

---

## Pierwsze uruchomienie

### 1. Wrzucenie projektu na GitHuba

```bash
cd lisia-gorka
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:TWOJ-USER/lisiagorka.git
git push -u origin main
```

> Repo może być prywatne — Cloudflare Pages łączy się przez OAuth i ma do niego dostęp.

### 2. Cloudflare Pages

1. Cloudflare → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. Autoryzuj GitHuba, wybierz repo `lisiagorka`
3. Konfiguracja buildu:
   - **Framework preset:** None
   - **Build command:** _(zostaw puste)_
   - **Build output directory:** `/`
   - **Root directory:** `/`
4. **Save and Deploy** — pierwszy deploy zajmie ok. minuty.

### 3. Domena lisiagorka.pl

1. W Cloudflare Pages → projekt → **Custom domains** → **Set up a custom domain**
2. Wpisz `lisiagorka.pl` i `www.lisiagorka.pl` (osobno).
3. Cloudflare pokaże instrukcje DNS:
   - **Wariant A** (zalecany) — przenieś domenę do Cloudflare jako registrar lub przepnij nameservery do Cloudflare. Wtedy DNS i SSL ustawiają się automatycznie.
   - **Wariant B** — zostaw DNS u obecnego rejestratora i dodaj rekord `CNAME` wskazujący na adres `<projekt>.pages.dev` podany przez Cloudflare. Dla domeny apex (bez `www`) wymagany będzie `ALIAS`/`ANAME` lub flattening (zależnie od rejestratora).

Po propagacji DNS (do kilkunastu minut) strona dostępna jest na https://lisiagorka.pl, certyfikat SSL Cloudflare ogarnia automatycznie.

---

## Panel admina

Dostępny pod adresem **/admin/** (np. https://lisiagorka.pl/admin/).

Panel **nie ma własnego serwera** — wszystkie zmiany są commitowane bezpośrednio do GitHuba przy użyciu **Personal Access Tokena (PAT)**, który podajesz przy logowaniu.

Po commicie Cloudflare wykrywa zmianę w repo i automatycznie buduje i deployuje stronę (~30 s).

### Tworzenie tokena GitHub

1. https://github.com/settings/personal-access-tokens/new — **Fine-grained token**
2. **Resource owner:** twój użytkownik (lub organizacja, jeśli repo jest pod organizacją)
3. **Repository access:** Only select repositories → wybierz `lisiagorka`
4. **Permissions** → **Repository permissions**:
   - **Contents:** **Read and write**
   - reszta domyślnie (Read tylko Metadata, ale to pojawia się automatycznie)
5. **Expiration:** wybierz odpowiedni okres (np. rok). Po wygaśnięciu wystarczy wygenerować nowy.
6. **Generate token** → **skopiuj** (zaczyna się od `github_pat_…`).

> Alternatywnie token klasyczny ze scope `repo` też zadziała, ale fine-grained jest bezpieczniejszy.

### Logowanie

W panelu podaj:
- **GitHub — właściciel** — `TWOJ-USER` (user lub org, do której należy repo)
- **Nazwa repo** — `lisiagorka`
- **Gałąź** — `main` (chyba że zmieniłeś)
- **Personal Access Token** — wklejony token

Token przechowywany jest **tylko w `sessionStorage`** — znika po zamknięciu karty. Nazwa właściciela / repo / gałąź zostają w `localStorage`, żeby nie wpisywać ich za każdym razem.

### Co można zmieniać

- **Hero** — zdjęcie tła, alt, eyebrow, hasło, podtytuł, dwa przyciski CTA (etykieta + link)
- **Sekcje** — dowolna liczba sekcji w czterech układach:
  - tekst + zdjęcie po prawej / lewej
  - tekst + mapa Google na pełną szerokość
  - tekst-tylko (siatka udogodnień, np. „Wyposażenie")
- Każdą sekcję można rozwijać, przesuwać w górę/dół, usuwać
- **Kontakt** — adres, telefon, email, embed mapy, wskazówki dojazdu (HTML)
- **JSON** — surowy podgląd tego, co zostanie zapisane

### Wgrywanie zdjęć

Każde pole obrazka ma przycisk **„Wgraj plik"**. Plik trafia do `assets/images/` z prefixem timestamp (żeby się nie nadpisywały) i automatycznie wpisuje się ścieżka.

### Skróty klawiszowe

- **Cmd/Ctrl + S** — zapis

---

## Dlaczego mapa Google nie działa po wpisaniu URL?

W Google Maps trzeba kliknąć **Udostępnij → Osadź mapę → skopiuj kod HTML** i z całego `<iframe>` wyłuskać sam atrybut `src` (zaczyna się od `https://www.google.com/maps/embed?pb=…`). Tylko tę wartość wkleja się w pole „Google Maps — embed URL".

---

## Lokalna podgląd (opcjonalnie)

Najprościej — dowolny statyczny serwer:

```bash
# Python 3
python3 -m http.server 8000

# albo Node
npx serve .
```

Otwórz http://localhost:8000.

> Panel admina lokalnie też działa — łączy się z prawdziwym GitHubem. Każdy save = realny commit.

---

## FAQ

**Q: Co jeśli token wycieknie?**
W ustawieniach GitHuba → Personal access tokens → kliknij **Revoke**. Wygeneruj nowy.

**Q: Strona ładuje starą treść po edycji.**
`main.js` pobiera `site.json` z `cache: 'no-store'` i parametrem `?t=…`. Jeżeli widzisz starą treść — Cloudflare jeszcze buduje (sprawdź zakładkę Deployments w Pages).

**Q: Jak edytować z telefonu?**
Tak samo — panel jest responsywny. Token najlepiej trzymaj w menedżerze haseł.

**Q: Jak dodać kolejną podstronę (np. Cennik)?**
Trzeba ręcznie utworzyć nowy plik HTML w repo (skopiuj `kontakt.html` jako szablon). Panel admina nie obsługuje dowolnych podstron — tylko treść w obrębie istniejących.
