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
