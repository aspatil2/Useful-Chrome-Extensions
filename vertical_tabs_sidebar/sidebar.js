document.addEventListener('DOMContentLoaded', () => {
  const tabList = document.getElementById('tab-list');
  const searchInput = document.getElementById('search-input');

  // Initial render
  loadTabs();

  // Search functionality
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    const items = tabList.querySelectorAll('.tab-item');
    items.forEach(item => {
      const title = item.querySelector('.tab-title').textContent.toLowerCase();
      if (title.includes(query)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });
  });

  // Tab Events
  chrome.tabs.onCreated.addListener((tab) => {
    addTabElement(tab);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    updateTabElement(tabId, changeInfo, tab);
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabElement(tabId);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    updateActiveTab(tabId);
  });

  // Functions

  async function loadTabs() {
    tabList.innerHTML = '';
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabs.forEach(tab => addTabElement(tab));
  }

  function addTabElement(tab) {
    const li = document.createElement('li');
    li.className = 'tab-item';
    li.id = `tab-${tab.id}`;
    if (tab.active) {
      li.classList.add('active');
      scrollIntoViewIfNeeded(li);
    }

    // Favicon
    const img = document.createElement('img');
    img.className = 'tab-favicon';
    // Use a default icon if favIconUrl is missing, or chrome://favicon/
    img.src = tab.favIconUrl || 'icons/icon16.png';
    img.onerror = () => { img.src = 'icons/icon16.png'; }; // Fallback

    // Allow chrome://favicon/ URL usage if we had permissions, but typically need more logic. 
    // Usually best to check if it exists. 
    if (!tab.favIconUrl && tab.url) {
      try {
        // Basic attempt to get favicon service if permissed, often restricted
        const url = new URL(tab.url);
        img.src = `https://www.google.com/s2/favicons?domain=${url.hostname}`;
      } catch (e) { }
    }

    // Title
    const span = document.createElement('span');
    span.className = 'tab-title';
    span.textContent = tab.title;

    // Close Button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'close-btn';
    closeBtn.title = 'Close tab';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.remove(tab.id);
    });

    li.appendChild(img);
    li.appendChild(span);
    li.appendChild(closeBtn);

    // Click to switch
    li.addEventListener('click', () => {
      chrome.tabs.update(tab.id, { active: true });
    });

    // Middle click to close
    // Middle click to close
    li.addEventListener('mousedown', (e) => {
      if (e.button === 1) { // Middle click
        e.preventDefault();
        e.stopPropagation(); // prevent other listeners
        chrome.tabs.remove(tab.id);
        // Remove the element immediately to give feedback, though onRemoved will do it too
        // But onRemoved is async. chrome.tabs.remove is async.
      }
    });

    tabList.appendChild(li);
  }

  function updateTabElement(tabId, changeInfo, tab) {
    const li = document.getElementById(`tab-${tabId}`);
    if (!li) return; // Might happen if tab creation hasn't processed yet or filtered

    if (changeInfo.title) {
      li.querySelector('.tab-title').textContent = changeInfo.title;
    }
    if (changeInfo.favIconUrl) {
      li.querySelector('.tab-favicon').src = changeInfo.favIconUrl;
    }
    if (changeInfo.status === 'complete') {
      // sometimes favicon comes late
      if (tab.favIconUrl) li.querySelector('.tab-favicon').src = tab.favIconUrl;
    }
  }

  function removeTabElement(tabId) {
    const li = document.getElementById(`tab-${tabId}`);
    if (li) {
      li.remove();
    }
  }

  function updateActiveTab(activeTabId) {
    // Remove active class from old one
    const currentActive = tabList.querySelector('.active');
    if (currentActive) {
      currentActive.classList.remove('active');
    }

    // Add to new one
    const newActive = document.getElementById(`tab-${activeTabId}`);
    if (newActive) {
      newActive.classList.add('active');
      scrollIntoViewIfNeeded(newActive);
    }
  }

  function scrollIntoViewIfNeeded(element) {
    // Basic logic to scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
});
