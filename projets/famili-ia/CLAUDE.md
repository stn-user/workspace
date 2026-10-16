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
To maintain visual consistency, follow these rules:

### Colors & Theming
- **Primary Palette:** Use the defined semantic classes in `styles.css`:
    - `.blue`: General docs/info.
    - `.green`: Home/Equipment/Success.
    - `.violet`: Vehicles/Special.
    - `.amber`: Alerts/Warnings.
    - `.red`: Critical Alerts.
    - `.cyan`: Printers/Technical.
- **Consistency:** Maintain the "card" aesthetic with subtle shadows and rounded corners.

### Icons & Visuals
- **Standard Icons:** Use specific Unicode symbols for consistency:
    - Document: `▤`
    - Equipment/Settings: `⚙`
    - Pool/Water: `≋`
    - Printer: `🖨️`
    - Document/Contract: `📄`
    - Home: `⌂`
    - Photo: `🖼️`
- **Avatars:** Simple letter-based circles for family members.

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
