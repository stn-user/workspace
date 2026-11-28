const key = 'famili-ia.appearance';
const control = document.getElementById('aurore-theme');
const system = window.matchMedia('(prefers-color-scheme: dark)');

function apply() {
  const dark = control.value === 'dark' || (control.value === 'system' && system.matches);
  document.documentElement.dataset.aurore = dark ? 'dark' : 'light';
}

function restore(value) {
  if (value !== null && !['light', 'dark', 'system'].includes(value)) {
    console.warn('Préférence d’apparence inconnue. Utilisation du mode clair.');
    value = null;
  }
  control.value = value || 'light';
  apply();
}

try {
  restore(localStorage.getItem(key));
} catch (error) {
  if (error.name !== 'SecurityError') throw error;
  console.warn('Lecture de la préférence d’apparence bloquée.', error);
  restore(null);
}
control.addEventListener('change', () => {
  apply();
  try {
    localStorage.setItem(key, control.value);
  } catch (error) {
    if (!['SecurityError', 'QuotaExceededError'].includes(error.name)) throw error;
    console.warn('Apparence appliquée uniquement pour cette session.', error);
  }
});
system.addEventListener('change', apply);
window.addEventListener('storage', event => {
  if (event.key === key || event.key === null) restore(event.newValue);
});
