const root = document.documentElement;
root.classList.replace('no-js', 'js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const header = document.getElementById('header');
const language = () => root.lang === 'en' ? 'en' : 'uk';
const text = (uk, en) => language() === 'en' ? en : uk;

// The same measured offset is used by native clicks, hash navigation and history.
function measureHeader() {
  root.style.setProperty('--anchor-offset', `${Math.ceil(header.getBoundingClientRect().bottom + 16)}px`);
}
measureHeader();
new ResizeObserver(measureHeader).observe(header);
addEventListener('resize', measureHeader, { passive: true });
function headerState() { header.classList.toggle('scrolled', scrollY > 40); }
addEventListener('scroll', headerState, { passive: true });
headerState();

const ua = new Map();
document.querySelectorAll('[data-en]').forEach(node => ua.set(node, node.innerHTML));
const translatedAttributes = new Map();
document.querySelectorAll('[data-en-placeholder],[data-en-label],[data-en-title],[data-en-alt]').forEach(node => {
  translatedAttributes.set(node, Object.fromEntries(['placeholder','aria-label','title','alt'].filter(key => node.hasAttribute(key)).map(key => [key,node.getAttribute(key)])));
});
function setLanguage(lang) {
  for (const [node, original] of ua) node.innerHTML = lang === 'en' ? node.dataset.en : original;
  for (const [node, attrs] of translatedAttributes) {
    for (const [key, original] of Object.entries(attrs)) {
      const value = node.getAttribute(key === 'aria-label' ? 'data-en-label' : `data-en-${key}`);
      node.setAttribute(key, lang === 'en' && value ? value : original);
    }
  }
  root.lang = lang;
  document.querySelectorAll('[data-lang]').forEach(button => {
    const active = button.dataset.lang === lang;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  refreshImageErrors();
  if (lightbox.open) updateGalleryText();
  document.dispatchEvent(new Event('site:languagechange'));
}
document.querySelectorAll('[data-lang]').forEach(button => button.addEventListener('click', () => setLanguage(button.dataset.lang)));

function refreshImageErrors() {
  document.querySelectorAll('.ph.is-error').forEach(node => {
    node.dataset.imageError = text('Фото тимчасово недоступне', 'Photo temporarily unavailable');
    node.setAttribute('role','img');
    node.setAttribute('aria-label', `${node.querySelector('img')?.alt || ''}. ${node.dataset.imageError}`);
  });
}
document.querySelectorAll('.ph__img').forEach(img => {
  function failed() { img.closest('.ph')?.classList.add('is-error'); refreshImageErrors(); }
  img.addEventListener('error', failed);
  img.addEventListener('load', () => {
    const frame=img.closest('.ph');
    frame?.classList.remove('is-error');
    frame?.removeAttribute('role');
    frame?.removeAttribute('aria-label');
  });
  if (img.complete && !img.naturalWidth) failed();
});

// Content is visible by default. Only animate loaded content currently entering view.
if ('IntersectionObserver' in window && !reduced.matches) {
  const observer = new IntersectionObserver(entries => {
    for (const { target, isIntersecting } of entries) {
      if (!isIntersecting) continue;
      observer.unobserve(target);
      const images = [...target.querySelectorAll('img')];
      if (images.every(img => img.complete && img.naturalWidth) && !location.hash) {
        target.classList.add('is-entering');
        target.addEventListener('animationend', () => target.classList.remove('is-entering'), { once: true });
      }
    }
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(node => {
    if (!node.closest('.hero,.pf,.photo-pair') && !node.matches('#form')) observer.observe(node);
  });
}
function visibility() { root.classList.toggle('is-hidden-tab', document.hidden); }
document.addEventListener('visibilitychange', visibility);
visibility();

const menu = document.getElementById('mobileMenu');
const burger = document.getElementById('burger');
const dialogs = document.querySelectorAll('dialog');
const dialogInvokers = new WeakMap();
function showDialog(dialog, invoker = document.activeElement) {
  dialogInvokers.set(dialog, invoker);
  dialog.showModal();
  document.body.classList.add('has-dialog');
}
dialogs.forEach(dialog => {
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...dialog.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('has-dialog');
    if (dialog === menu) burger.setAttribute('aria-expanded', 'false');
    dialogInvokers.get(dialog)?.focus({ preventScroll: true });
  });
});
burger.addEventListener('click', () => { showDialog(menu, burger); burger.setAttribute('aria-expanded', 'true'); });
menu.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', () => {
  const target = document.getElementById(link.hash.slice(1));
  if (target) { target.setAttribute('tabindex','-1'); dialogInvokers.set(menu, target); }
  menu.close();
}));
document.querySelectorAll('[data-privacy]').forEach(button => button.addEventListener('click', () => showDialog(document.getElementById('privacy'), button)));

const gallery = [...document.querySelectorAll('[data-gallery]')];
const lightbox = document.getElementById('lightbox');
const image = document.getElementById('lightboxImage');
const media = document.getElementById('lightboxMedia');
const caption = document.getElementById('lightboxTitle');
const galleryStatus = document.getElementById('lightboxStatus');
const zoom = document.getElementById('galleryZoom');
let index = 0;
function updateGalleryText() {
  caption.textContent = gallery[index].querySelector('img').alt;
  image.alt = caption.textContent;
  galleryStatus.textContent = image.dataset.failed === 'true'
    ? text('Не вдалося завантажити фото. Спробуйте інше.', 'Could not load this photo. Try another image.')
    : media.getAttribute('aria-busy') === 'true' ? text('Завантажуємо фото…', 'Loading photo…')
    : text(`Фото ${index + 1} із ${gallery.length}`, `Photo ${index + 1} of ${gallery.length}`);
}
function setZoom(active) {
  lightbox.classList.toggle('is-zoomed', active);
  zoom.setAttribute('aria-pressed', String(active));
  const label=active ? text('Зменшити фото','Zoom out') : text('Збільшити фото','Zoom photo');
  zoom.setAttribute('aria-label',label);zoom.title=label;
}
function renderPhoto(next) {
  index = (next + gallery.length) % gallery.length;
  const source = gallery[index].querySelector('img');
  setZoom(false);
  media.setAttribute('aria-busy','true');
  image.dataset.failed = 'false';
  image.alt = source.alt;
  image.width = Number(source.getAttribute('width'));
  image.height = Number(source.getAttribute('height'));
  document.getElementById('lightboxAvif').srcset = source.dataset.fullAvif || '';
  document.getElementById('lightboxWebp').srcset = source.dataset.fullWebp || '';
  image.src = gallery[index].href;
  media.scrollTo(0,0);
  updateGalleryText();
}
gallery.forEach((link, n) => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  renderPhoto(n);
  showDialog(lightbox, link);
}));
document.getElementById('galleryPrevious').addEventListener('click', () => renderPhoto(index - 1));
document.getElementById('galleryNext').addEventListener('click', () => renderPhoto(index + 1));
lightbox.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    renderPhoto(index + (event.key === 'ArrowRight' ? 1 : -1));
  }
});
function toggleZoom() { setZoom(!lightbox.classList.contains('is-zoomed')); }
zoom.addEventListener('click', toggleZoom);
image.addEventListener('click', toggleZoom);
image.addEventListener('load', () => { media.setAttribute('aria-busy','false'); updateGalleryText(); });
image.addEventListener('error', () => { media.setAttribute('aria-busy','false'); image.dataset.failed = 'true'; updateGalleryText(); });
lightbox.addEventListener('close', () => { image.removeAttribute('src'); document.getElementById('lightboxAvif').removeAttribute('srcset'); document.getElementById('lightboxWebp').removeAttribute('srcset'); });
