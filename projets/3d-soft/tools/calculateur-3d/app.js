const $ = id => document.getElementById(id);
const val = id => parseFloat($(id).value) || 0;
const euro = n => n.toFixed(2) + " €";

const SAVE = ["puissance","prixMachine","vieMachine","maintenance","demarrage","echec",
              "prixPLA","prixPETG","prixTPU","prixABS","prixKwh","tauxHoraire",
              "marge","vendeur","tva","preset"];
const CHAMPS_IMP = ["puissance","prixMachine","vieMachine","maintenance","demarrage","echec"];

// Valeurs indicatives par imprimante (à ajuster selon ton usage réel)
const PRESETS = {
  a1:     {puissance:95,  prixMachine:449,  vieMachine:3000, maintenance:0.04, demarrage:30, echec:5},
  a1mini: {puissance:80,  prixMachine:219,  vieMachine:3000, maintenance:0.03, demarrage:25, echec:6},
  p1s:    {puissance:105, prixMachine:599,  vieMachine:4000, maintenance:0.05, demarrage:40, echec:4},
  x1c:    {puissance:120, prixMachine:1199, vieMachine:5000, maintenance:0.06, demarrage:45, echec:3}
};
const NOMS = {a1:"Bambu Lab A1", a1mini:"Bambu Lab A1 mini", p1s:"Bambu Lab P1S", x1c:"Bambu Lab X1C"};
// Codes internes Bambu -> imprimante (à vérifier avec ton fichier)
const CODES = {"N1":"a1mini","N2S":"a1","C12":"p1s","BL-P001":"x1c"};

// Le plateau chauffe plus selon la matière : coefficient sur la puissance moyenne
const FACTEURS = [["PETG",1.15],["ABS",1.3],["ASA",1.3],["PA",1.3],["PC",1.3],["TPU",1.0],["PLA",1.0]];

let filaments = [];   // [{type, g, prix}] rempli par l'import
let projets = [], dernierPrix = 0;

function lire(k, d){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; }catch(e){ return d; } }
function ecrire(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }

function sauverParams(){ const o = {}; SAVE.forEach(id => o[id] = $(id).value); ecrire("calc3d_params5", o); }
function chargerParams(){
  const o = lire("calc3d_params5", null); if(!o) return;
  SAVE.forEach(id => { if(o[id] !== undefined) $(id).value = o[id]; });
}

// Affiche la zone Résultat / Mes projets (cachée tant qu'aucun fichier n'est analysé)
function montrerResultats(defiler){
  $("resultats").classList.remove("hidden");
  if(defiler) $("resultats").scrollIntoView({behavior:"smooth", block:"start"});
}

function majResume(){
  const cle = $("preset").value;
  $("resumeImp").textContent = cle
    ? (NOMS[cle] || "Personnalisé") + " : " + val("puissance") + " W · " + val("prixMachine") + " € · " +
      val("vieMachine") + " h de vie · maintenance " + val("maintenance") + " €/h · échecs " + val("echec") + " %"
    : "Choisis ton imprimante pour préremplir les réglages techniques.";
}
function appliquerPreset(cle){
  $("preset").value = cle;
  const p = PRESETS[cle];
  if(p) Object.keys(p).forEach(id => $(id).value = p[id]);
  majResume();
}

function prixType(type){
  const t = (type || "").toUpperCase();
  if(t.includes("PETG")) return val("prixPETG");
  if(t.includes("TPU")) return val("prixTPU");
  if(t.includes("ABS") || t.includes("ASA")) return val("prixABS");
  return val("prixPLA");
}
// Matière dominante (en poids) -> coefficient électrique
function facteurMatiere(){
  if(!filaments.length) return {f:1, nom:"PLA"};
  const dom = filaments.reduce((a, b) => b.g > a.g ? b : a);
  const t = (dom.type || "").toUpperCase();
  for(const [nom, f] of FACTEURS){ if(t.includes(nom)) return {f, nom}; }
  return {f:1, nom:t || "PLA"};
}

function calculer(){
  let mat = 0;
  if(filaments.length) filaments.forEach(f => mat += f.g / 1000 * (f.prix > 0 ? f.prix : prixType(f.type)));
  else mat = val("poids") / 1000 * val("prixPLA");

  const fm = facteurMatiere();
  const kwh = val("puissance") / 1000 * val("duree") * fm.f + val("demarrage") / 1000;
  const elec = kwh * val("prixKwh");
  const amort = val("vieMachine") > 0 ? val("prixMachine") / val("vieMachine") : 0;
  const mach = (amort + val("maintenance")) * val("duree");
  const main = val("tempsManuel") / 60 * val("tauxHoraire");
  const ech = (mat + elec + mach + main) * val("echec") / 100;
  const cout = mat + elec + mach + main + ech;
  const ben = cout * val("marge") / 100;
  dernierPrix = cout + ben;

  $("rMat").textContent = euro(mat); $("rElec").textContent = euro(elec);
  $("rMach").textContent = euro(mach); $("rMain").textContent = euro(main);
  $("rEch").textContent = euro(ech); $("rCout").textContent = euro(cout);
  $("rBen").textContent = euro(ben); $("rPrix").textContent = euro(dernierPrix);

  // Quantité et frais d'envoi (comptés une fois par commande)
  const q = Math.max(1, Math.round(val("quantite")) || 1);
  const envoi = Math.max(0, val("envoi"));
  const totalPieces = dernierPrix * q;
  $("rTotal").textContent = q > 1 ? "Total pour " + q + " pièces : " + euro(totalPieces) : "";
  $("rClient").textContent = envoi > 0
    ? "+ envoi " + euro(envoi) + " → Total client : " + euro(totalPieces + envoi)
    : "";

  $("chips").innerHTML = "";
  filaments.forEach(f => {
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = (f.type || "?") + " · " + f.g.toFixed(1) + " g";
    $("chips").appendChild(c);
  });
  if(fm.f !== 1){
    const c = document.createElement("span");
    c.className = "chip";
    c.textContent = "⚡ Électricité ajustée ×" + fm.f + " (" + fm.nom + ")";
    $("chips").appendChild(c);
  }
}

// ---------- Import .3mf ----------
async function importer(fichier){
  const msg = $("msg");
  if(!fichier) return;
  if(typeof JSZip === "undefined"){ msg.textContent = "❌ Bibliothèque non chargée (connexion internet requise)."; return; }
  msg.textContent = "Lecture en cours…";
  try{
    const zip = await JSZip.loadAsync(fichier);
    const info = zip.file("Metadata/slice_info.config");
    if(!info){ msg.textContent = "❌ Fichier non découpé. Dans Bambu Studio : découpe la plaque, puis Fichier → Exporter → Exporter le fichier de la plaque découpée."; return; }

    const doc = new DOMParser().parseFromString(await info.async("string"), "application/xml");
    const plate = doc.querySelector("plate");
    if(!plate){
      const noms = Object.keys(zip.files).filter(n => !n.endsWith("/")).join(", ");
      msg.textContent = "❌ Ce fichier ne contient pas de découpe. Dans Bambu Studio, clique sur « Découper la plaque », puis Fichier → Exporter → Exporter le fichier de la plaque découpée. Fichiers trouvés : " + noms;
      return;
    }

    let poids = 0, sec = 0, code = "";
    plate.querySelectorAll("metadata").forEach(m => {
      const k = m.getAttribute("key"), v = m.getAttribute("value");
      if(k === "weight") poids = parseFloat(v) || 0;
      if(k === "prediction") sec = parseFloat(v) || 0;
      if(k === "printer_model_id") code = v;
    });

    let modele = "", couts = [];
    try{
      const ps = zip.file("Metadata/project_settings.config");
      if(ps){
        const j = JSON.parse(await ps.async("string"));
        modele = (j.printer_model || "").toLowerCase();
        couts = j.filament_cost || [];
      }
    }catch(e){}

    filaments = [];
    plate.querySelectorAll("filament").forEach(f => {
      const idx = (parseInt(f.getAttribute("id")) || 1) - 1;
      filaments.push({
        type: f.getAttribute("type") || "PLA",
        g: parseFloat(f.getAttribute("used_g")) || 0,
        prix: parseFloat(couts[idx]) || 0
      });
    });
    if(!poids) poids = filaments.reduce((s, f) => s + f.g, 0);
    if(!poids && !sec){ msg.textContent = "❌ Aucun poids ni durée exploitable dans ce fichier."; return; }

    // Imprimante détectée dans le fichier
    let detecte = CODES[code] || "";
    if(!detecte){
      if(modele.includes("a1") && modele.includes("mini")) detecte = "a1mini";
      else if(modele.includes("a1")) detecte = "a1";
      else if(modele.includes("p1s")) detecte = "p1s";
      else if(modele.includes("x1")) detecte = "x1c";
    }

    // Ton choix prime ; sans choix, on prend l'imprimante du fichier
    const choisi = $("preset").value;
    let note = "";
    if(!choisi && detecte){
      appliquerPreset(detecte);
      note = " · imprimante détectée : " + NOMS[detecte];
    }else if(!choisi){
      note = " · choisis ton imprimante pour affiner";
    }else if(detecte && choisi !== "perso" && choisi !== detecte){
      note = " ⚠️ Fichier découpé pour " + NOMS[detecte] + " : la durée peut différer sur " + NOMS[choisi] +
             ". Redécoupe pour ton imprimante pour un temps exact.";
    }

    $("poids").value = Math.round(poids * 10) / 10;
    $("duree").value = Math.round(sec / 36) / 100;
    $("tempsManuel").value = 5 + 3 * Math.max(0, filaments.length - 1);
    $("nomProjet").value = fichier.name.replace(/\.gcode\.3mf$/i, "").replace(/\.3mf$/i, "");

    const h = Math.floor(sec / 3600), mn = Math.round(sec % 3600 / 60);
    msg.textContent = "✅ " + (Math.round(poids * 10) / 10) + " g · " + h + " h " + mn + " min · " +
      filaments.length + " filament(s)" + note;
    calculer(); sauverParams();
    montrerResultats(true);
  }catch(e){
    msg.textContent = "❌ Impossible de lire ce fichier (est-ce un .3mf de Bambu Studio ?).";
  }
}

// ---------- Projets ----------
function afficher(){
  const z = $("liste"); z.innerHTML = "";
  if(!projets.length){ z.innerHTML = '<p style="color:#888;font-size:14px">Aucun projet sauvegardé.</p>'; return; }
  projets.forEach(p => {
    const l = document.createElement("div"); l.className = "projet";
    const n = document.createElement("span"); n.textContent = p.nom;
    const pr = document.createElement("strong"); pr.textContent = euro(p.prix); pr.style.color = "#1a7f37";
    const b1 = document.createElement("button"); b1.className = "mini"; b1.textContent = "Charger";
    b1.onclick = () => charger(p.id);
    const b2 = document.createElement("button"); b2.className = "mini"; b2.textContent = "✕";
    b2.onclick = () => { if(confirm("Supprimer ce projet ?")){ projets = projets.filter(x => x.id !== p.id); ecrire("calc3d_projets", projets); afficher(); } };
    [n, pr, b1, b2].forEach(e => l.appendChild(e)); z.appendChild(l);
  });
}
function sauver(){
  const nom = $("nomProjet").value.trim();
  if(!nom){ alert("Donne un nom à ton projet."); return; }
  projets.push({id: Date.now(), nom, poids: val("poids"), duree: val("duree"),
                tempsManuel: val("tempsManuel"), filaments, prix: dernierPrix});
  ecrire("calc3d_projets", projets); afficher();
}
function charger(id){
  const p = projets.find(x => x.id === id); if(!p) return;
  filaments = p.filaments || [];
  $("poids").value = p.poids; $("duree").value = p.duree;
  $("tempsManuel").value = p.tempsManuel; $("nomProjet").value = p.nom;
  calculer();
}

// ---------- Devis ----------
function devis(){
  const q = Math.max(1, Math.round(val("quantite")) || 1), d = new Date();
  const envoi = Math.max(0, val("envoi"));
  const total = dernierPrix * q + envoi;
  const p = n => String(n).padStart(2, "0");
  $("dNum").textContent = "D-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  $("dDate").textContent = d.toLocaleDateString("fr-FR");
  $("dVendeur").textContent = $("vendeur").value.trim() || "—";
  $("dClient").textContent = $("client").value.trim() || "—";
  $("dDes").textContent = $("nomProjet").value.trim() || "Pièce imprimée en 3D";
  $("dQte").textContent = q; $("dUnit").textContent = euro(dernierPrix);
  $("dLig").textContent = euro(dernierPrix * q);
  $("dEnvRow").style.display = envoi > 0 ? "" : "none";
  $("dEnv").textContent = euro(envoi);
  $("dTot").textContent = euro(total);
  $("dTva").textContent = $("tva").value === "non" ? "TVA non applicable, art. 293 B du CGI." : "";
  window.print();
}

// ---------- Événements ----------
$("fichier").addEventListener("change", e => importer(e.target.files[0]));
const zone = $("drop");
zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("over"); });
zone.addEventListener("dragleave", () => zone.classList.remove("over"));
zone.addEventListener("drop", e => { e.preventDefault(); zone.classList.remove("over"); importer(e.dataTransfer.files[0]); });

// Choix de l'imprimante : préremplit les réglages techniques
$("preset").addEventListener("change", () => {
  appliquerPreset($("preset").value);
  calculer(); sauverParams();
});
// Modifier un réglage technique à la main passe en "personnalisé"
CHAMPS_IMP.forEach(id => $(id).addEventListener("input", () => {
  $("preset").value = "perso"; majResume();
}));
// Modifier le poids à la main abandonne le détail par filament
$("poids").addEventListener("input", () => { filaments = []; });

document.querySelectorAll("input,select").forEach(el => {
  if(el.id === "fichier") return;
  el.addEventListener("input", () => { calculer(); sauverParams(); });
});
$("btnSauver").addEventListener("click", sauver);
$("btnDevis").addEventListener("click", devis);

// Le bouton "Mes projets" affiche la zone cachée
$("lnkProjets").addEventListener("click", e => {
  e.preventDefault();
  montrerResultats(false);
  $("projets").scrollIntoView({behavior:"smooth", block:"start"});
});

// ---------- Démarrage ----------
projets = lire("calc3d_projets", []);
chargerParams(); majResume(); calculer(); afficher();