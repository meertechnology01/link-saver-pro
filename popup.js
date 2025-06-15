document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const linkInput = document.getElementById('linkInput');
  const tagInput = document.getElementById('tagInput');
  const addBtn = document.getElementById('addBtn');
  const linkList = document.getElementById('linkList');
  const linksCount = document.getElementById('linksCount');
  const searchInput = document.getElementById('searchInput');
  const filterTags = document.getElementById('filterTags');
  const folderSelect = document.getElementById('folderSelect');
  const newFolderBtn = document.getElementById('newFolderBtn');
  const saveCurrentTabBtn = document.getElementById('saveCurrentTab');
  const exportBtn = document.getElementById('exportBtn');
  const sortBtn = document.getElementById('sortBtn');

  // Modal elements
  const exportModal = document.getElementById('exportModal');
  const folderModal = document.getElementById('folderModal');
  const closeModal = document.getElementById('closeModal');
  const closeFolderModal = document.getElementById('closeFolderModal');
  const folderNameInput = document.getElementById('folderNameInput');
  const createFolderBtn = document.getElementById('createFolderBtn');
  const cancelFolderBtn = document.getElementById('cancelFolderBtn');

  // State variables
  let currentFolder = 'default';
  let allLinks = [];
  let allFolders = { default: 'All Links' };
  let sortOrder = 'oldest'; // 'oldest' or 'newest'
  let draggedElement = null;
  let activeFilters = new Set();

  // Utility functions
  function isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function getDomainFromUrl(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Unknown';
    }
  }

  function getFaviconUrl(url) {
    try {
      const domain = new URL(url).origin;
      return `${domain}/favicon.ico`;
    } catch {
      return null;
    }
  }

  function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  function showFeedback(message, type = 'success') {
    const feedback = document.createElement('div');
    feedback.textContent = message;
    feedback.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      z-index: 1001;
      animation: slideIn 0.3s ease-out;
      background: ${type === 'success' ? '#34a853' : '#ea4335'};
      color: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(feedback);
    setTimeout(() => {
      feedback.remove();
    }, 3000);
  }

  // Chrome Sync functions
  function saveToSync(data) {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) {
        console.log('Sync failed, using local storage');
        chrome.storage.local.set(data);
      }
    });
  }

  function loadFromSync(keys, callback) {
    chrome.storage.sync.get(keys, (result) => {
      if (chrome.runtime.lastError || Object.keys(result).length === 0) {
        chrome.storage.local.get(keys, callback);
      } else {
        callback(result);
      }
    });
  }

  // Data management
  function updateLinksCount(count) {
    linksCount.textContent = count;
    linksCount.style.display = count > 0 ? 'inline' : 'none';
  }

  function loadFolders() {
    loadFromSync({ folders: allFolders }, (result) => {
      allFolders = result.folders;
      updateFolderSelect();
    });
  }

  function updateFolderSelect() {
    folderSelect.innerHTML = '';
    Object.entries(allFolders).forEach(([id, name]) => {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `📁 ${name}`;
      if (id === currentFolder) option.selected = true;
      folderSelect.appendChild(option);
    });
  }

  function loadLinks() {
    loadFromSync({ links: [] }, (result) => {
      allLinks = result.links;
      renderLinks();
      updateFilterTags();
    });
  }

  function saveLinks() {
    saveToSync({ links: allLinks });
  }

  function saveFolders() {
    saveToSync({ folders: allFolders });
  }

  // Rendering functions
  function renderLinks() {
    const filteredLinks = filterLinks();
    linkList.innerHTML = '';
    updateLinksCount(filteredLinks.length);

    if (filteredLinks.length === 0) {
      const emptyState = document.createElement('li');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
        <div style="text-align: center; padding: 40px 16px; color: var(--text-secondary);">
          ${allLinks.length === 0 ? 
            '📝 No links saved yet.<br>Add your first link above!' : 
            '🔍 No links match your search.<br>Try different keywords.'}
        </div>
      `;
      linkList.appendChild(emptyState);
      return;
    }

    // Sort links
    const sortedLinks = [...filteredLinks].sort((a, b) => {
      return sortOrder === 'oldest' ? a.time - b.time : b.time - a.time;
    });

    sortedLinks.forEach((linkObj, index) => {
      const li = createLinkElement(linkObj, filteredLinks.indexOf(linkObj));
      linkList.appendChild(li);
    });
  }

  function createLinkElement(linkObj, originalIndex) {
    const li = document.createElement('li');
    li.className = 'draggable';
    li.draggable = true;
    li.dataset.originalIndex = originalIndex;
    
    // Favicon
    const favicon = document.createElement('div');
    favicon.className = 'link-favicon';
    const faviconImg = document.createElement('img');
    faviconImg.src = getFaviconUrl(linkObj.url);
    faviconImg.onerror = () => {
      favicon.innerHTML = '🔗';
    };
    favicon.appendChild(faviconImg);
    
    // Drag handle
    const dragHandle = document.createElement('span');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.title = 'Drag to reorder';
    
    // Link content
    const linkContent = document.createElement('div');
    linkContent.className = 'link-content';
    
    const linkUrl = document.createElement('a');
    linkUrl.href = linkObj.url;
    linkUrl.target = '_blank';
    linkUrl.rel = 'noopener noreferrer';
    linkUrl.className = 'link-url';
    linkUrl.textContent = linkObj.title || linkObj.url;
    linkUrl.title = linkObj.url;
    
    const linkDomain = document.createElement('div');
    linkDomain.className = 'link-domain';
    linkDomain.textContent = getDomainFromUrl(linkObj.url);
    
    const linkTime = document.createElement('div');
    linkTime.className = 'link-time';
    linkTime.textContent = formatTimeAgo(linkObj.time);
    
    // Tags
    if (linkObj.tags && linkObj.tags.length > 0) {
      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'link-tags';
      linkObj.tags.forEach(tag => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'link-tag';
        tagSpan.textContent = tag;
        tagSpan.onclick = () => toggleFilter(tag);
        tagsContainer.appendChild(tagSpan);
      });
      linkContent.appendChild(tagsContainer);
    }
    
    linkContent.appendChild(linkUrl);
    linkContent.appendChild(linkDomain);
    linkContent.appendChild(linkTime);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'link-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'action-btn';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit link';
    editBtn.onclick = () => editLink(originalIndex);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete link';
    deleteBtn.onclick = () => deleteLink(originalIndex);
    
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    
    li.appendChild(favicon);
    li.appendChild(dragHandle);
    li.appendChild(linkContent);
    li.appendChild(actions);
    
    // Drag and drop events
    li.addEventListener('dragstart', handleDragStart);
    li.addEventListener('dragover', handleDragOver);
    li.addEventListener('drop', handleDrop);
    li.addEventListener('dragend', handleDragEnd);
    
    return li;
  }

  // Filtering and searching
  function filterLinks() {
    let filtered = allLinks;
    
    // Filter by folder
    if (currentFolder !== 'default') {
      filtered = filtered.filter(link => link.folder === currentFolder);
    }
    
    // Filter by search
    const searchTerm = searchInput.value.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(link => 
        link.url.toLowerCase().includes(searchTerm) ||
        (link.title && link.title.toLowerCase().includes(searchTerm)) ||
        (link.tags && link.tags.some(tag => tag.toLowerCase().includes(searchTerm)))
      );
    }
    
    // Filter by active tags
    if (activeFilters.size > 0) {
      filtered = filtered.filter(link => 
        link.tags && link.tags.some(tag => activeFilters.has(tag))
      );
    }
    
    return filtered;
  }

  function updateFilterTags() {
    const allTags = new Set();
    allLinks.forEach(link => {
      if (link.tags) {
        link.tags.forEach(tag => allTags.add(tag));
      }
    });
    
    filterTags.innerHTML = '';
    allTags.forEach(tag => {
      const tagBtn = document.createElement('button');
      tagBtn.className = `filter-tag ${activeFilters.has(tag) ? 'active' : ''}`;
      tagBtn.textContent = tag;
      tagBtn.onclick = () => toggleFilter(tag);
      filterTags.appendChild(tagBtn);
    });
  }

  function toggleFilter(tag) {
    if (activeFilters.has(tag)) {
      activeFilters.delete(tag);
    } else {
      activeFilters.add(tag);
    }
    renderLinks();
    updateFilterTags();
  }

  // Drag and drop functionality
  function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const afterElement = getDragAfterElement(linkList, e.clientY);
    if (afterElement == null) {
      linkList.appendChild(draggedElement);
    } else {
      linkList.insertBefore(draggedElement, afterElement);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    
    // Get new order
    const newOrder = Array.from(linkList.children)
      .filter(li => li.classList.contains('draggable'))
      .map(li => parseInt(li.dataset.originalIndex));
    
    // Reorder the links array
    const reorderedLinks = newOrder.map(index => allLinks[index]);
    allLinks = reorderedLinks;
    saveLinks();
    renderLinks();
    
    showFeedback('Links reordered!');
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    draggedElement = null;
  }

  function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.draggable:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  // Link management
  function addLink() {
    const url = linkInput.value.trim();
    const tags = tagInput.value.trim().split(',').map(tag => tag.trim()).filter(tag => tag);
    
    if (!url) {
      showFeedback('Please enter a URL', 'error');
      linkInput.focus();
      return;
    }

    let processedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      processedUrl = 'https://' + url;
    }

    if (!isValidUrl(processedUrl)) {
      showFeedback('Please enter a valid URL', 'error');
      linkInput.focus();
      return;
    }

    // Check for duplicates
    const urlExists = allLinks.some(link => link.url === processedUrl);
    if (urlExists) {
      showFeedback('This link is already saved', 'error');
      linkInput.focus();
      return;
    }

    // Get page title
    getPageTitle(processedUrl, (title) => {
      const newLink = {
        url: processedUrl,
        title: title || getDomainFromUrl(processedUrl),
        time: Date.now(),
        folder: currentFolder,
        tags: tags
      };

      allLinks.push(newLink);
      saveLinks();
      linkInput.value = '';
      tagInput.value = '';
      renderLinks();
      updateFilterTags();
      showFeedback('Link saved successfully!');
    });
  }

  function getPageTitle(url, callback) {
    // Try to get title from current tab if it matches
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url === url) {
          callback(tabs[0].title);
        } else {
          callback(null);
        }
      });
    } else {
      callback(null);
    }
  }

  function editLink(index) {
    const link = allLinks[index];
    const newUrl = prompt('Edit URL:', link.url);
    if (newUrl && newUrl !== link.url) {
      if (isValidUrl(newUrl)) {
        link.url = newUrl;
        saveLinks();
        renderLinks();
        showFeedback('Link updated!');
      } else {
        showFeedback('Invalid URL', 'error');
      }
    }
  }

  function deleteLink(index) {
    if (confirm('Are you sure you want to delete this link?')) {
      allLinks.splice(index, 1);
      saveLinks();
      renderLinks();
      updateFilterTags();
      showFeedback('Link deleted');
    }
  }

  function saveCurrentTab() {
    if (chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && !tabs[0].url.startsWith('chrome://')) {
          const url = tabs[0].url;
          const title = tabs[0].title;
          
          // Check for duplicates
          const urlExists = allLinks.some(link => link.url === url);
          if (urlExists) {
            showFeedback('This tab is already saved', 'error');
            return;
          }

          const newLink = {
            url: url,
            title: title,
            time: Date.now(),
            folder: currentFolder,
            tags: []
          };

          allLinks.push(newLink);
          saveLinks();
          renderLinks();
          showFeedback('Current tab saved!');
        } else {
          showFeedback('Cannot save this type of page', 'error');
        }
      });
    }
  }

  // Folder management
  function createFolder() {
    const folderName = folderNameInput.value.trim();
    if (!folderName) {
      showFeedback('Please enter a folder name', 'error');
      return;
    }

    if (Object.values(allFolders).includes(folderName)) {
      showFeedback('Folder already exists', 'error');
      return;
    }

    const folderId = 'folder_' + Date.now();
    allFolders[folderId] = folderName;
    saveFolders();
    updateFolderSelect();
    closeFolderModal.click();
    showFeedback('Folder created!');
  }

  // Export functionality
  function exportLinks(format) {
    const links = filterLinks();
    let content, filename, mimeType;

    switch (format) {
      case 'json':
        content = JSON.stringify(links, null, 2);
        filename = 'links.json';
        mimeType = 'application/json';
        break;
      
      case 'csv':
        const headers = ['URL', 'Title', 'Domain', 'Tags', 'Folder', 'Date Added'];
        const csvRows = [headers.join(',')];
        
        links.forEach(link => {
          const row = [
            `"${link.url}"`,
            `"${link.title || ''}"`,
            `"${getDomainFromUrl(link.url)}"`,
            `"${(link.tags || []).join('; ')}"`,
            `"${allFolders[link.folder] || 'All Links'}"`,
            `"${new Date(link.time).toLocaleString()}"`
          ];
          csvRows.push(row.join(','));
        });
        
        content = csvRows.join('\n');
        filename = 'links.csv';
        mimeType = 'text/csv';
        break;
      
      case 'html':
        const htmlContent = `
<!DOCTYPE html>
<html><head><title>Exported Links</title></head><body>
<h1>My Saved Links</h1>
<ul>
${links.map(link => `
  <li>
    <a href="${link.url}" target="_blank">${link.title || link.url}</a>
    ${link.tags ? `<br><small>Tags: ${link.tags.join(', ')}</small>` : ''}
    <br><small>Added: ${new Date(link.time).toLocaleString()}</small>
  </li>
`).join('')}
</ul>
</body></html>`;
        content = htmlContent;
        filename = 'links.html';
        mimeType = 'text/html';
        break;
    }

    downloadFile(content, filename, mimeType);
    closeModal.click();
    showFeedback(`Links exported as ${format.toUpperCase()}!`);
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Event listeners
  addBtn.addEventListener('click', addLink);
  linkInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addLink();
  });
  
  tagInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addLink();
  });

  searchInput.addEventListener('input', renderLinks);
  
  folderSelect.addEventListener('change', (e) => {
    currentFolder = e.target.value;
    activeFilters.clear();
    renderLinks();
    updateFilterTags();
  });

  newFolderBtn.addEventListener('click', () => {
    folderModal.style.display = 'flex';
    folderNameInput.focus();
  });

  saveCurrentTabBtn.addEventListener('click', saveCurrentTab);
  exportBtn.addEventListener('click', () => {
    exportModal.style.display = 'flex';
  });

  sortBtn.addEventListener('click', () => {
    sortOrder = sortOrder === 'oldest' ? 'newest' : 'oldest';
    sortBtn.textContent = sortOrder === 'oldest' ? '📅 Oldest First' : '📅 Newest First';
    renderLinks();
  });

  // Modal events
  closeModal.addEventListener('click', () => {
    exportModal.style.display = 'none';
  });

  closeFolderModal.addEventListener('click', () => {
    folderModal.style.display = 'none';
    folderNameInput.value = '';
  });

  createFolderBtn.addEventListener('click', createFolder);
  cancelFolderBtn.addEventListener('click', () => {
    closeFolderModal.click();
  });

  folderNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createFolder();
  });

  // Export button events
  document.getElementById('exportJson').addEventListener('click', () => exportLinks('json'));
  document.getElementById('exportCsv').addEventListener('click', () => exportLinks('csv'));
  document.getElementById('exportHtml').addEventListener('click', () => exportLinks('html'));

  // Close modals when clicking outside
  exportModal.addEventListener('click', (e) => {
    if (e.target === exportModal) closeModal.click();
  });

  folderModal.addEventListener('click', (e) => {
    if (e.target === folderModal) closeFolderModal.click();
  });

  // Initialize
  linkInput.focus();
  loadFolders();
  loadLinks();

  // Auto-update timestamps
  setInterval(() => {
    const timeElements = document.querySelectorAll('.link-time');
    timeElements.forEach((element, index) => {
      const linkIndex = parseInt(element.closest('li').dataset.originalIndex);
      if (allLinks[linkIndex]) {
        element.textContent = formatTimeAgo(allLinks[linkIndex].time);
      }
    });
  }, 60000);
});
