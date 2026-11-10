'use strict';

const config = window.SITE_CONFIG || {};
const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#navigation');

function closeMenu(returnFocus = false) {
  navigation.hidden = true;
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
  if (returnFocus) menuButton.focus();
}

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  navigation.hidden = !open;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
navigation.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.header-inner')) closeMenu();
});
window.matchMedia('(min-width: 960px)').addEventListener('change', () => closeMenu());

document.querySelectorAll('.service').forEach((service) => {
  service.addEventListener('toggle', () => {
    if (!service.open) return;
    document.querySelectorAll('.service[open]').forEach((other) => {
      if (other !== service) other.open = false;
    });
  });
});

document.querySelectorAll('[data-service]').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelector('#client-service').value = link.dataset.service;
  });
});

const emailLink = document.querySelector('[data-email]');
if (config.email) {
  emailLink.href = `mailto:${config.email}`;
  emailLink.replaceChildren(document.createTextNode(config.email + ' '));
  const arrow = document.createElement('span');
  arrow.textContent = '↗';
  arrow.setAttribute('aria-hidden', 'true');
  emailLink.append(arrow);
}

document.querySelector('#contact-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const clientName = String(data.get('name') || '').trim();
  const service = String(data.get('service') || '').trim();
  const message = String(data.get('message') || '').trim();
  const greeting = clientName ? `Olá, Théo! Meu nome é ${clientName}.` : 'Olá, Théo!';
  const parts = [greeting, `Tenho interesse em: ${service}.`];
  if (message) parts.push(message);
  const text = encodeURIComponent(parts.join('\n\n'));
  const phone = String(config.whatsapp || '').replace(/\D/g, '');
  if (phone) {
    window.location.assign(`https://wa.me/${phone}?text=${text}`);
  } else if (config.email) {
    window.location.assign(`mailto:${config.email}?subject=${encodeURIComponent('Assessoria em engenharia — ' + service)}&body=${text}`);
  }
});

// Native horizontal scrolling keeps the portfolio usable without JavaScript.
// The enhancement adds buttons, a position indicator and a full-size viewer.
const portfolioTrack = document.querySelector('#portfolio-track');
const portfolioSlides = Array.from(portfolioTrack.querySelectorAll('.portfolio-slide'));
const portfolioPhotos = Array.from(portfolioTrack.querySelectorAll('[data-portfolio-photo]'));
const galleryPrevious = document.querySelector('[data-gallery-prev]');
const galleryNext = document.querySelector('[data-gallery-next]');
const galleryPosition = document.querySelector('#portfolio-position');
const lightbox = document.querySelector('#portfolio-lightbox');
const lightboxImage = document.querySelector('#lightbox-image');
const lightboxCaption = document.querySelector('#lightbox-caption');
const lightboxPosition = document.querySelector('#lightbox-position');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let galleryIndex = 0;
let lightboxIndex = 0;
let scrollFrame = 0;

function positionText(index) {
  return `${String(index + 1).padStart(2, '0')} / ${String(portfolioSlides.length).padStart(2, '0')}`;
}

function updateGalleryPosition() {
  let nearest = 0;
  portfolioSlides.forEach((slide, index) => {
    if (Math.abs(slide.offsetLeft - portfolioTrack.scrollLeft) < Math.abs(portfolioSlides[nearest].offsetLeft - portfolioTrack.scrollLeft)) nearest = index;
  });
  galleryIndex = nearest;
  const label = `Imagem ${positionText(galleryIndex)}`;
  if (galleryPosition.textContent !== label) galleryPosition.textContent = label;
  galleryPrevious.disabled = galleryIndex === 0;
  galleryNext.disabled = galleryIndex === portfolioSlides.length - 1;
}

function goToPhoto(index, instant = false) {
  const boundedIndex = Math.max(0, Math.min(index, portfolioSlides.length - 1));
  portfolioTrack.scrollTo({
    left: portfolioSlides[boundedIndex].offsetLeft,
    behavior: instant || reducedMotion.matches ? 'auto' : 'smooth',
  });
}

document.querySelector('.portfolio-navigation').hidden = false;
galleryPrevious.addEventListener('click', () => goToPhoto(galleryIndex - 1));
galleryNext.addEventListener('click', () => goToPhoto(galleryIndex + 1));
portfolioTrack.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = window.requestAnimationFrame(() => {
    updateGalleryPosition();
    scrollFrame = 0;
  });
}, { passive: true });
portfolioTrack.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  goToPhoto(galleryIndex + (event.key === 'ArrowRight' ? 1 : -1));
});
window.addEventListener('resize', () => goToPhoto(galleryIndex, true));

function showLightboxPhoto(index) {
  lightboxIndex = (index + portfolioPhotos.length) % portfolioPhotos.length;
  const photo = portfolioPhotos[lightboxIndex];
  const description = portfolioSlides[lightboxIndex].querySelector('figcaption span').textContent;
  lightboxImage.src = photo.href;
  lightboxImage.alt = photo.querySelector('img').alt;
  lightboxCaption.textContent = description;
  lightboxPosition.textContent = positionText(lightboxIndex);
}

portfolioPhotos.forEach((photo, index) => {
  photo.addEventListener('click', (event) => {
    // Keep the original image link as the fallback in older browsers.
    if (typeof lightbox.showModal !== 'function' || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    showLightboxPhoto(index);
    lightbox.showModal();
    document.documentElement.classList.add('has-lightbox');
  });
});

document.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
document.querySelector('[data-lightbox-prev]').addEventListener('click', () => showLightboxPhoto(lightboxIndex - 1));
document.querySelector('[data-lightbox-next]').addEventListener('click', () => showLightboxPhoto(lightboxIndex + 1));
lightbox.addEventListener('click', (event) => {
  if (event.target === lightbox) lightbox.close();
});
lightbox.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  showLightboxPhoto(lightboxIndex + (event.key === 'ArrowRight' ? 1 : -1));
});
lightbox.addEventListener('close', () => {
  document.documentElement.classList.remove('has-lightbox');
  goToPhoto(lightboxIndex, true);
  portfolioPhotos[lightboxIndex].focus({ preventScroll: true });
});
updateGalleryPosition();
