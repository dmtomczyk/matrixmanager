document.addEventListener('click', (event) => {
  const openMenus = document.querySelectorAll('details.account-menu[open], details.hamburger-menu[open]');
  openMenus.forEach((menu) => {
    if (menu.contains(event.target)) return;
    menu.removeAttribute('open');
  });
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  document.querySelectorAll('details.account-menu[open], details.hamburger-menu[open]').forEach((menu) => {
    menu.removeAttribute('open');
  });
});
