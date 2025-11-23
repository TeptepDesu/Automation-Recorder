// Listen for recording state changes
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    // Inject content script into all existing tabs
    chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(err => console.log(`Injection failed for tab ${tab.id}:`, err));
      });
    });
  }
});

// Open view.html in a popup window when extension icon is clicked
chrome.action.onClicked.addListener(async () => {
  const url = chrome.runtime.getURL('view.html');
  
  // Check if the popup window is already open by querying all tabs
  try {
    const tabs = await chrome.tabs.query({ url: url });
    
    if (tabs.length > 0) {
      // Found existing tab with the extension URL
      const tab = tabs[0];
      
      // Get the window for this tab
      const window = await chrome.windows.get(tab.windowId);
      
      // Focus the window and bring it to front
      await chrome.windows.update(window.id, { 
        focused: true 
      });
      
      // Also update the tab to make sure it's active
      await chrome.tabs.update(tab.id, { 
        active: true 
      });
      
      return;
    }
  } catch (error) {
    console.log('Error checking for existing window:', error);
  }
  
  // No existing window found, create new popup window
  await chrome.windows.create({
    url: url,
    type: 'popup',
    width: 1200,
    height: 800,
    focused: true
  });
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('JAR installed');
});
