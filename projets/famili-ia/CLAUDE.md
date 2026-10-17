# CLAUDE.md - Famili-IA Project Guide

## 🚀 Project Overview
Famili-IA is a family document and home equipment management application. It focuses on privacy-first local search across multiple sources (Local Files, Google Drive, and Demo data).

**Tech Stack:**
- **Frontend:** Vanilla JavaScript, CSS3, HTML5.
- **Mobile Wrapper:** Capacitor (Android/iOS).
- **State Management:** Centralized in `state.js`.
- **Navigation:** Hash-based routing (`#/view?params`).

## 🛠 Development Workflow
- **Run App:** Open `index.html` in a browser or use the Capacitor dev flow.
- **Navigation:** Always use `showView(name, options)` for view transitions to ensure history and params are handled correctly.
- **State:** Read/Write family data via functions in `state.js`.

## 🎨 UI/UX Guidelines (Anti-Regression)
To maintain visual consistency, follow these rules based on the official design mockups:

### Colors & Theming
**Primary Brand Colors:**
- **Primary (Teal):** `#0f7173` - Logo, liens, éléments interactifs
- **Primary Dark:** `#0c5e5f` - Hover states
- **Primary Light:** `#e6f4f4` - Backgrounds légers

**Semantic Color Palette (Stat Cards & Icons):**
- **Blue:** `#2563eb` - Documents, information générale
- **Green:** `#059669` - Maison, équipements, succès, garanties
- **Violet:** `#7c3aed` - Véhicules, catégories spéciales
- **Purple:** `#9333ea` - Photos, médias
- **Amber:** `#d97706` - Alertes, avertissements
- **Red:** `#dc2626` - Alertes critiques, urgences
- **Cyan:** `#0891b2` - Technique, imprimantes

**Neutral Colors:**
- **Background:** `#f8fafc` - Fond principal de l'app
- **Surface:** `#ffffff` - Cartes, panneaux
- **Text:** `#0f172a` - Texte principal
- **Text Secondary:** `#475569` - Texte secondaire
- **Text Muted:** `#94a3b8` - Texte désactivé/hints
- **Border:** `#e2e8f0` - Bordures principales
- **Border Hover:** `#cbd5e1` - Bordures au hover

### Typography
- **Font Family:** System fonts (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`)
- **Sizes:**
  - Page Title (H1): `2.25rem` (36px)
  - Section Title (H2): `1.5rem` (24px)
  - Card Label: `0.875rem` (14px)
  - Stats Number: `1.5rem` (24px) bold
  - Eyebrow: `0.75rem` (12px) uppercase, `letter-spacing: 0.05em`
- **Weights:**
  - Regular: 400
  - Medium: 500
  - Semibold: 600
  - Bold: 700

### Spacing & Layout
- **Base Unit:** `1rem` = 16px
- **Spacing Scale:**
  - `--space-xs`: `0.25rem` (4px)
  - `--space-sm`: `0.5rem` (8px)
  - `--space-md`: `1rem` (16px)
  - `--space-lg`: `1.5rem` (24px)
  - `--space-xl`: `2rem` (32px)
  - `--space-2xl`: `3rem` (48px)
- **Container Padding:** `2rem` (desktop), `1rem` (mobile)
- **Card Spacing:** `1rem` gap entre les cartes

### Border Radius
- **Small:** `8px` - Boutons, petits éléments
- **Medium:** `12px` - Cartes standard
- **Large:** `16px` - Panneaux importants
- **XLarge:** `24px` - Modales, grandes sections
- **Full:** `9999px` - Badges, avatars circulaires

### Shadows
- **XS:** `0 1px 2px rgba(15, 23, 42, 0.05)` - Légère élévation
- **SM:** `0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.06)` - Cartes par défaut
- **MD:** `0 4px 6px -1px rgba(15, 23, 42, 0.1), 0 2px 4px -2px rgba(15, 23, 42, 0.1)` - Cartes au hover
- **LG:** `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.1)` - Modales

### Icons & Visuals
**Icon Style:**
- **Format:** SVG inline (stroke-based, not filled)
- **Stat Cards:** 
  - Size: `24px` icon in `48px` circular container
  - Style: Transparent colored background (`rgba(color, 0.1)`) with colored icon
  - Colors: Use semantic colors (blue, green, violet, purple, amber, red, cyan)
  - SVG uses `fill="none"` and `stroke="currentColor"`
- **Navigation (bottom bar):**
  - Size: `20px` 
  - Style: Outline/stroke icons (Feather/Lucide style)
  - Colors: Muted by default, primary when active

**Standard SVG Icons (Stat Cards - filled style):**
- **Documents:** `<rect>` with horizontal lines inside
- **Garantie/Protection:** `<path>` (shield shape)
- **Véhicule:** `<rect><circle>` (car with wheel)
- **Maison:** `<path>` with `<polyline>` (house with roof and door)
- **Photos:** `<rect>` with `<circle>` and `<path>` (image frame with mountain)
- **Contrat:** `<path>` with `<polyline>` (document with fold and lines)

**Standard SVG Icons (Navigation - outline style):**
- **Accueil:** House outline
- **Recherche:** Magnifying glass (circle + line)
- **Maison:** Grid/building outline
- **Famille:** Multiple user silhouettes
- **Alertes:** Triangle with exclamation
- **Assistant:** Microphone
- **Importer:** Upload arrow
- **Profil:** User circle
- **Données:** Document/file

**Avatars:**
- Cercles avec initiale centrée
- Taille: `32px` (petit), `48px` (moyen), `64px` (grand)
- Background: `var(--color-primary)`
- Text: blanc, bold

### UI Components
- **Modals:** Use HTML `<dialog>` elements for source viewing and choices.
- **Feedback:** Use the `showDemoNotice()` function for temporary toast messages.

## 🏗 Architectural Patterns
- **Search Logic:** 
    - Use `search-utils.js` for text normalization and matching.
    - Search is "No-AI" (keyword/fact extraction) to ensure privacy.
- **View Initialization:** Each view should have an `init[ViewName]View()` function called during `showView` or page load.
- **Data Flow:** `state.js` $\rightarrow$ `app.js` $\rightarrow$ DOM.

## ⚠️ Critical Constraints & Pitfalls
- **Capacitor Native:** Always check `Capacitor.isNativePlatform()` before calling `@capacitor/filesystem` or native permissions.
- **Google Drive:** OAuth/Picker logic is restricted to the web browser version (not intended for the mobile WebView in current prototype).
- **No-Server:** The current prototype is purely client-side; do not introduce server-side dependencies unless explicitly requested.
- **Legacy Hash:** Support both `#/view` and `#view` for backward compatibility in `parseHash()`.
