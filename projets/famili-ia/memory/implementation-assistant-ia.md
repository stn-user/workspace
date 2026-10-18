---
name: implementation-assistant-ia
description: Implementation de la fonctionnalité 5.23 (Assistant IA : bulles chat, avatar, suggestions, scroll auto)
metadata:
  type: project
---

[[5.23]] : Assistant – Bulles chat différenciées, avatar, suggestions rapides, scroll auto

**Why:** Améliorer l'expérience utilisateur et l'interactivité de l'assistant IA, le rendre plus conforme à la charte graphique et aux attentes d'une interface de chat moderne.

**How to apply:**
1.  **Style CSS**:
    -   Définir les styles pour `.chat-container`, `.chat-message`, `.chat-message.ai`, `.chat-message.user` en suivant `CLAUDE.md` (couleurs, rayons de bordure, espacements).
    -   Utiliser des avatars pour les messages IA.
2.  **JS `app.js`**:
    -   Mettre à jour `initAssistantView` pour gérer le scroll automatique.
    -   Implémenter un mécanisme de suggestions rapides.
    -   Différencier les styles des bulles entre utilisateur et IA.
3.  **HTML `index.html`**:
    -   Ajouter un conteneur pour les suggestions rapides.
4.  **Tests**:
    -   Vérifier le scroll automatique lors de l'ajout de messages longs.
    -   Vérifier le responsive des bulles de chat sur mobile.
