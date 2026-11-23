/* EmojiSpot combinations page: local search and category filters only. */
(() => {
  'use strict';

  const start = () => {
    const root = document.querySelector('[data-combo-app]');
    if (!root) return;

    const controls = root.querySelector('[data-combo-controls]');
    const input = root.querySelector('#combo-search');
    const clear = root.querySelector('#combo-clear');
    const result = root.querySelector('#combo-result-count');
    const empty = root.querySelector('#combo-no-results');
    const filters = Array.from(root.querySelectorAll('[data-combo-filter]'));
    const jumpLinks = Array.from(root.querySelectorAll('[data-combo-jump]'));
    const sections = Array.from(root.querySelectorAll('[data-combo-section]'));
    const cards = Array.from(root.querySelectorAll('[data-combo-item]'));
    const total = cards.length;

    if (!controls || !input || !result || !empty || !filters.length || !sections.length) return;

    const normalize = value => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u200d\ufe0e\ufe0f]/g, '')
      .toLocaleLowerCase('en');

    let activeCategory = 'all';

    const render = () => {
      const query = normalize(input.value.trim());
      let visible = 0;

      for (const section of sections) {
        let sectionVisible = 0;
        const inCategory = activeCategory === 'all' || section.dataset.comboSection === activeCategory;

        for (const card of section.querySelectorAll('[data-combo-item]')) {
          const matches = inCategory && (!query || normalize(card.dataset.search).includes(query));
          card.hidden = !matches;
          if (matches) {
            visible += 1;
            sectionVisible += 1;
          }
        }
        section.hidden = sectionVisible === 0;
      }

      result.textContent = `Showing ${visible} of ${total} combinations.`;
      empty.hidden = visible !== 0;
    };

    for (const button of filters) {
      button.addEventListener('click', () => {
        activeCategory = button.dataset.comboFilter || 'all';
        for (const filter of filters) {
          filter.setAttribute('aria-pressed', String(filter === button));
        }
        render();
      });
    }

    for (const link of jumpLinks) {
      link.addEventListener('click', () => {
        const button = filters.find(filter => filter.dataset.comboFilter === link.dataset.comboJump);
        if (!button) return;
        input.value = '';
        activeCategory = button.dataset.comboFilter;
        for (const filter of filters) {
          filter.setAttribute('aria-pressed', String(filter === button));
        }
        render();
      });
    }

    input.addEventListener('input', render);
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && input.value) {
        input.value = '';
        render();
      }
    });
    clear?.addEventListener('click', () => {
      input.value = '';
      activeCategory = 'all';
      for (const filter of filters) {
        filter.setAttribute('aria-pressed', String(filter.dataset.comboFilter === 'all'));
      }
      render();
      input.focus();
    });

    // The site's existing copy handler owns clipboard access and its fallback UI.
    // Enable Copy only once this page's filter enhancement has initialized.
    for (const button of root.querySelectorAll('[data-copy-text]')) button.disabled = false;
    controls.hidden = false;
    render();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
