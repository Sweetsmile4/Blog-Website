/**
 * script.js — The Daily Blog
 *
 * Handles:
 *  1. Mobile navigation toggle
 *  2. Category filtering via navigation links
 *  3. Live search across post titles, content, and tags
 *  4. Comment form validation and submission (with localStorage persistence)
 *  5. Loading previously saved comments on page load
 */

'use strict';

/* ============================================================
   Constants & DOM references
   ============================================================ */

/** Maximum length allowed for a commenter's name. */
const MAX_NAME_LENGTH = 80;

/** Maximum length allowed for a comment message. */
const MAX_MSG_LENGTH = 1000;

/* ============================================================
   1. Mobile Navigation Toggle
   ============================================================ */

(function initMobileNav() {
  const toggle = document.getElementById('navToggle');
  const nav    = document.getElementById('primaryNav');

  if (!toggle || !nav) return;

  toggle.addEventListener('click', function () {
    const isOpen = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Close the menu when a nav link is clicked
  nav.querySelectorAll('.nav-link').forEach(function (link) {
    link.addEventListener('click', function () {
      nav.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
})();

/* ============================================================
   2. Category Filtering
   ============================================================ */

(function initCategoryFilter() {
  const navLinks  = document.querySelectorAll('.nav-link[data-filter]');
  const postCards = document.querySelectorAll('.post-card[data-category]');

  if (!navLinks.length || !postCards.length) return;

  /**
   * Shows posts matching the given category, hides the rest.
   * @param {string} filter - Category slug or 'all'.
   */
  function applyFilter(filter) {
    postCards.forEach(function (card) {
      const category = card.dataset.category;
      const visible  = filter === 'all' || category === filter;
      // Use the HTML hidden attribute so screen readers also skip hidden posts
      card.hidden = !visible;
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();

      // Update active state
      navLinks.forEach(function (l) { l.classList.remove('active'); });
      link.classList.add('active');

      // Apply the selected filter
      applyFilter(link.dataset.filter);

      // Clear the search field and hide the no-results message when
      // switching categories so the two features don't conflict.
      const searchInput = document.getElementById('searchInput');
      const noResults   = document.getElementById('noResults');
      if (searchInput) searchInput.value = '';
      if (noResults)   noResults.hidden = true;
    });
  });
})();

/* ============================================================
   3. Search Functionality
   ============================================================ */

(function initSearch() {
  const searchInput = document.getElementById('searchInput');
  const searchBtn   = document.getElementById('searchBtn');
  const noResults   = document.getElementById('noResults');
  const postCards   = document.querySelectorAll('.post-card');

  if (!searchInput || !postCards.length) return;

  /**
   * Filters posts based on the current search query.
   * Searches within post title, content paragraphs, and tag text.
   */
  function runSearch() {
    const query = searchInput.value.trim().toLowerCase();

    // Reset category filter active state to 'All Posts' so it stays in sync
    const navLinks = document.querySelectorAll('.nav-link[data-filter]');
    navLinks.forEach(function (l) { l.classList.remove('active'); });
    const allLink = document.querySelector('.nav-link[data-filter="all"]');
    if (allLink) allLink.classList.add('active');

    let visibleCount = 0;

    postCards.forEach(function (card) {
      if (!query) {
        // Empty query: show all posts
        card.hidden = false;
        visibleCount++;
        return;
      }

      // Build a searchable text blob from the card's key content areas
      const titleEl    = card.querySelector('.post-title');
      const contentEl  = card.querySelector('.post-content');
      const tagsEl     = card.querySelector('.post-tags');

      const titleText   = titleEl   ? titleEl.textContent   : '';
      const contentText = contentEl ? contentEl.textContent : '';
      const tagsText    = tagsEl    ? tagsEl.textContent    : '';

      const haystack = (titleText + ' ' + contentText + ' ' + tagsText).toLowerCase();
      const matches  = haystack.includes(query);

      card.hidden = !matches;
      if (matches) visibleCount++;
    });

    // Show or hide the "no results" message
    if (noResults) noResults.hidden = visibleCount > 0 || !query;
  }

  // Search on button click
  searchBtn.addEventListener('click', runSearch);

  // Live search as the user types (debounced to avoid excessive DOM writes)
  let debounceTimer;
  searchInput.addEventListener('input', function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(runSearch, 250);
  });

  // Also trigger on Enter key press
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      runSearch();
    }
  });
})();

/* ============================================================
   4. Comment Forms — Validation & Submission
   ============================================================ */

(function initCommentForms() {
  /** All comment submission forms on the page. */
  const forms = document.querySelectorAll('.comment-form');
  if (!forms.length) return;

  forms.forEach(function (form) {
    form.addEventListener('submit', handleCommentSubmit);
  });

  /**
   * Handles the comment form submit event.
   * Validates inputs, builds a comment object, renders it, and persists it.
   * @param {Event} e - The submit event.
   */
  function handleCommentSubmit(e) {
    e.preventDefault();

    const form   = e.currentTarget;
    const postId = form.dataset.post;

    const nameInput = form.querySelector('input[type="text"]');
    const msgInput  = form.querySelector('textarea');
    const errorEl   = document.getElementById('error-' + postId);

    // --- Validation ---
    const name    = nameInput ? nameInput.value.trim() : '';
    const message = msgInput  ? msgInput.value.trim()  : '';

    // Clear previous error state
    if (errorEl) errorEl.hidden = true;
    [nameInput, msgInput].forEach(function (el) {
      if (el) el.classList.remove('invalid');
    });

    if (!name) {
      showError(nameInput, errorEl, 'Please enter your name.');
      return;
    }

    if (name.length > MAX_NAME_LENGTH) {
      showError(nameInput, errorEl, 'Name must be ' + MAX_NAME_LENGTH + ' characters or fewer.');
      return;
    }

    if (!message) {
      showError(msgInput, errorEl, 'Please enter a comment message.');
      return;
    }

    if (message.length > MAX_MSG_LENGTH) {
      showError(msgInput, errorEl, 'Message must be ' + MAX_MSG_LENGTH + ' characters or fewer.');
      return;
    }

    // --- Build comment object ---
    const comment = {
      name:    sanitizeText(name),
      message: sanitizeText(message),
      date:    new Date().toLocaleString('en-US', {
        year:   'numeric',
        month:  'short',
        day:    'numeric',
        hour:   '2-digit',
        minute: '2-digit',
      }),
    };

    // --- Render comment in the DOM ---
    renderComment(postId, comment);

    // --- Persist to localStorage ---
    saveComment(postId, comment);

    // --- Reset form ---
    form.reset();
    if (msgInput) msgInput.style.height = '';

    // Provide accessible success feedback via the error element (reused as status)
    if (errorEl) {
      errorEl.style.color = 'var(--color-success)';
      errorEl.textContent = 'Comment posted successfully!';
      errorEl.hidden = false;
      // Auto-hide after 4 seconds
      setTimeout(function () {
        errorEl.hidden = true;
        errorEl.style.color = '';
      }, 4000);
    }
  }

  /**
   * Displays a validation error for a specific input field.
   * @param {HTMLElement|null} inputEl  - The invalid input element.
   * @param {HTMLElement|null} errorEl  - The error message container.
   * @param {string}           message - The error message to display.
   */
  function showError(inputEl, errorEl, message) {
    if (inputEl) {
      inputEl.classList.add('invalid');
      inputEl.focus();
    }
    if (errorEl) {
      errorEl.style.color = '';
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
  }
})();

/* ============================================================
   5. Comment Rendering Helper
   ============================================================ */

/**
 * Creates and appends a comment list item to the comment list for a given post.
 * @param {string|number} postId  - The post identifier.
 * @param {{name: string, message: string, date: string}} comment - Comment data.
 */
function renderComment(postId, comment) {
  const list = document.getElementById('comments-' + postId);
  if (!list) return;

  // Build the <li> element using DOM APIs (no innerHTML with user data)
  const li = document.createElement('li');
  li.className = 'comment-item';

  const header = document.createElement('div');

  const authorSpan = document.createElement('span');
  authorSpan.className = 'comment-author';
  authorSpan.textContent = comment.name;

  const dateSpan = document.createElement('span');
  dateSpan.className = 'comment-date';
  dateSpan.textContent = comment.date;

  header.appendChild(authorSpan);
  header.appendChild(dateSpan);

  const textEl = document.createElement('p');
  textEl.className = 'comment-text';
  textEl.textContent = comment.message;

  li.appendChild(header);
  li.appendChild(textEl);
  list.appendChild(li);

  // Scroll newly added comment into view
  li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ============================================================
   6. localStorage Persistence for Comments
   ============================================================ */

/**
 * Saves a comment for the specified post to localStorage.
 * Comments are stored as a JSON array under the key "comments_<postId>".
 * @param {string|number} postId  - The post identifier.
 * @param {{name: string, message: string, date: string}} comment - Comment data.
 */
function saveComment(postId, comment) {
  try {
    const key      = 'comments_' + postId;
    const existing = JSON.parse(localStorage.getItem(key) || '[]');
    existing.push(comment);
    localStorage.setItem(key, JSON.stringify(existing));
  } catch (err) {
    // localStorage may be unavailable in some private-browsing contexts.
    // Gracefully ignore the error — the comment is still rendered in the DOM.
    console.warn('Could not save comment to localStorage:', err);
  }
}

/**
 * Loads and renders all previously saved comments for every post on the page.
 * Called once on DOMContentLoaded.
 */
function loadSavedComments() {
  const postCards = document.querySelectorAll('.post-card[data-category]');

  postCards.forEach(function (card) {
    const postId = card.id.replace('post-', '');
    try {
      const saved = JSON.parse(localStorage.getItem('comments_' + postId) || '[]');
      saved.forEach(function (comment) {
        renderComment(postId, comment);
      });
    } catch (err) {
      console.warn('Could not load comments for post ' + postId + ':', err);
    }
  });
}

/* ============================================================
   7. Sanitisation Helper
   ============================================================ */

/**
 * Escapes HTML special characters in a string to prevent XSS when setting
 * textContent is not an option.  Since we use .textContent throughout the
 * comment rendering, this is a belt-and-suspenders safeguard.
 * @param {string} str - Raw user input string.
 * @returns {string} The sanitised string.
 */
function sanitizeText(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/* ============================================================
   8. Bootstrap — run on DOM ready
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
  loadSavedComments();
});
