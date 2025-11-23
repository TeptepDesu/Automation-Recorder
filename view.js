// Store edited data
let editedSteps = [];
let originalSteps = [];

// Get steps from storage
async function getSteps() {
  const data = await chrome.storage.local.get({ steps: [] });
  return data.steps || [];
}

// Get selected fields
function getSelectedFields() {
  const checkboxes = document.querySelectorAll('#fieldSelectorDropdown input[type="checkbox"]');
  const fields = [];
  const displayNames = {
    'stepNumber': 'StepNo',
    'actionType': 'ActionType',
    'elementText': 'ElementText',
    'elementTag': 'Tag',
    'elementId': 'ID',
    'dataTestId': 'Test ID',
    'elementName': 'Name',
    'elementClass': 'Class',
    'cssSelector': 'CSS',
    'xpath': 'XPath',
    'fullXpath': 'FullXPath',
    'value': 'Value',
    'pageUrl': 'URL',
    'timestamp': 'Timestamp'
  };
  
  checkboxes.forEach(cb => {
    if (cb.checked) {
      fields.push({
        field: cb.value,
        display: displayNames[cb.value]
      });
    }
  });
  return fields;
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard!');
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showToast('Copied to clipboard!');
  }
}

// Show toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}

// Render table
function renderTable(steps) {
  originalSteps = [...steps];
  editedSteps = steps.map(s => ({ ...s, editedActionType: s.actionType }));
  
  const selectedFields = getSelectedFields();
  const tableHead = document.getElementById('tableHead');
  const tableBody = document.getElementById('tableBody');
  const emptyMessage = document.getElementById('emptyMessage');
  
  if (!steps.length) {
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';
    emptyMessage.style.display = 'block';
    return;
  }
  
  emptyMessage.style.display = 'none';
  
  // Create header with resize handles
  const headerRow = document.createElement('tr');
  
  // Add delete column header first (leftmost)
  const deleteHeader = document.createElement('th');
  deleteHeader.className = 'delete-header';
  deleteHeader.textContent = 'Actions';
  deleteHeader.style.width = '80px';
  deleteHeader.style.minWidth = '80px';
  deleteHeader.style.maxWidth = '80px';
  headerRow.appendChild(deleteHeader);
  
  selectedFields.forEach((field, index) => {
    const th = document.createElement('th');
    th.textContent = field.display;
    th.dataset.field = field.field;
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.dataset.index = index;
    th.appendChild(resizeHandle);
    
    headerRow.appendChild(th);
  });
  
  tableHead.innerHTML = '';
  tableHead.appendChild(headerRow);
  
  // Initialize column resizing after table is fully rendered
  setTimeout(async () => {
    await loadColumnWidths();
    initializeColumnResize();
  }, 50);
  
  // Create rows
  tableBody.innerHTML = '';
  steps.forEach((step, index) => {
    const row = document.createElement('tr');
    row.dataset.index = index;
    
    // Add delete button cell first (leftmost)
    const deleteCell = document.createElement('td');
    deleteCell.className = 'delete-cell';
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '🗑️';
    deleteBtn.title = 'Delete row';
    deleteBtn.dataset.index = index;
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`Delete step ${step.stepNumber}?`)) {
        await deleteStep(index);
      }
    });
    deleteCell.appendChild(deleteBtn);
    row.appendChild(deleteCell);
    
    selectedFields.forEach((field, colIndex) => {
      const cell = document.createElement('td');
      const fieldValue = step[field.field] ?? '';
      const displayValue = String(fieldValue);
      
      // Make ActionType editable
      if (field.field === 'actionType') {
        cell.className = 'editable-cell action-type-cell';
        cell.contentEditable = true;
        cell.dataset.field = 'actionType';
        cell.dataset.index = index;
        
        // Determine the displayed ActionType text:
        // - If the user has edited this cell (editedActionType differs from raw actionType), use the edited value
        // - Otherwise, compute the formatted value (Action + elementText/dataTestId/elementId/value)
        let actionText;
        if (editedSteps[index] && editedSteps[index].editedActionType && editedSteps[index].editedActionType !== step.actionType) {
          actionText = editedSteps[index].editedActionType;
        } else {
          actionText = formatActionTypeForDisplay(step, step.actionType);
          if (!editedSteps[index]) {
            editedSteps[index] = { ...step };
          }
          editedSteps[index].editedActionType = actionText;
        }
        cell.textContent = actionText;
        
        // Handle blur to save edited value
        cell.addEventListener('blur', (e) => {
          const newValue = e.target.textContent.trim();
          if (editedSteps[index]) {
            editedSteps[index].editedActionType = newValue;
          }
        });
        
        // Prevent line breaks
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            cell.blur();
          }
        });
      } else {
        cell.className = 'copyable-cell';
        cell.textContent = displayValue;
        cell.title = 'Click to copy';
      }
      
      // Add click handler for copying (except editable cells)
      if (!cell.contentEditable) {
        cell.addEventListener('click', () => {
          copyToClipboard(displayValue);
        });
      }
      
      row.appendChild(cell);
    });
    
    tableBody.appendChild(row);
  });
}

// Format action type for display (initial format)
function formatActionTypeForDisplay(step, actionType) {
  if (!actionType) return '';
  
  // If it's already been edited, use the edited value
  if (actionType !== step.actionType) {
    return actionType;
  }
  
  // Format: Action + (elementText or dataTestId or elementId or value)
  const formatted = actionType.charAt(0).toUpperCase() + actionType.slice(1).toLowerCase();
  
  // For input actions, prioritize value if it exists (what user typed is more important)
  const isInputAction = actionType && (actionType.toLowerCase() === 'input' || actionType.toLowerCase() === 'change');
  
  // Check each field and use the first one that has a non-empty value
  // For input actions, check value first if it exists
  if (isInputAction && step.value !== undefined && step.value !== null && step.value.toString().trim() && step.value.toString().trim() !== '' && step.value.toString().trim() !== '••••••') {
    return `${formatted} ${step.value.toString().trim()}`;
  } else if (step.elementText && step.elementText.toString().trim() && step.elementText.toString().trim() !== '') {
    return `${formatted} ${step.elementText.toString().trim()}`;
  } else if (step.dataTestId && step.dataTestId.toString().trim() && step.dataTestId.toString().trim() !== '') {
    return `${formatted} ${step.dataTestId.toString().trim()}`;
  } else if (step.elementId && step.elementId.toString().trim() && step.elementId.toString().trim() !== '') {
    return `${formatted} ${step.elementId.toString().trim()}`;
  } else if (step.value !== undefined && step.value !== null && step.value.toString().trim() && step.value.toString().trim() !== '' && step.value.toString().trim() !== '••••••') {
    return `${formatted} ${step.value.toString().trim()}`;
  } else {
    return formatted;
  }
}

// Format ActionType for export using edited values
function formatActionTypeForExport(step, index) {
  // Use edited value if available
  if (editedSteps[index] && editedSteps[index].editedActionType) {
    return editedSteps[index].editedActionType;
  }
  
  // Fallback to original formatting
  // Format: Action + (elementText or dataTestId or elementId or value)
  const actionType = step.actionType ? step.actionType.charAt(0).toUpperCase() + step.actionType.slice(1).toLowerCase() : '';
  
  // For input actions, prioritize value if it exists (what user typed is more important)
  const isInputAction = step.actionType && (step.actionType.toLowerCase() === 'input' || step.actionType.toLowerCase() === 'change');
  
  // Check each field and use the first one that has a non-empty value
  // For input actions, check value first if it exists
  if (isInputAction && step.value !== undefined && step.value !== null && step.value.toString().trim() && step.value.toString().trim() !== '' && step.value.toString().trim() !== '••••••') {
    return `${actionType} ${step.value.toString().trim()}`;
  } else if (step.elementText && step.elementText.toString().trim() && step.elementText.toString().trim() !== '') {
    return `${actionType} ${step.elementText.toString().trim()}`;
  } else if (step.dataTestId && step.dataTestId.toString().trim() && step.dataTestId.toString().trim() !== '') {
    return `${actionType} ${step.dataTestId.toString().trim()}`;
  } else if (step.elementId && step.elementId.toString().trim() && step.elementId.toString().trim() !== '') {
    return `${actionType} ${step.elementId.toString().trim()}`;
  } else if (step.value !== undefined && step.value !== null && step.value.toString().trim() && step.value.toString().trim() !== '' && step.value.toString().trim() !== '••••••') {
    return `${actionType} ${step.value.toString().trim()}`;
  } else {
    return actionType;
  }
}

// Get steps with edited values merged
function getStepsWithEdits() {
  // Merge edited actionType values with original steps
  return originalSteps.map((step, index) => {
    const editedStep = { ...step };
    if (editedSteps[index] && editedSteps[index].editedActionType) {
      // Create a modified version for export that uses edited actionType
      editedStep._exportActionType = editedSteps[index].editedActionType;
    }
    return editedStep;
  });
}

// CSV export
function stepsToCSV(steps) {
  const selectedFields = getSelectedFields();
  if (selectedFields.length === 0) {
    alert('Please select at least one field to export');
    return null;
  }

  const header = selectedFields.map(f => f.display);
  const rows = steps.map((s, index) => selectedFields.map(f => {
    // Transform actionType field for export using edited values
    if (f.field === 'actionType') {
      // Use _exportActionType if available (edited), otherwise format normally
      if (s._exportActionType) {
        return s._exportActionType;
      }
      return formatActionTypeForExport(s, index);
    }
    return s[f.field];
  }));
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
  return csv;
}

function downloadBlob(content, filename, type='text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCSV() {
  const steps = getStepsWithEdits();
  if (!steps.length) { alert('No steps to export'); return; }
  const csv = stepsToCSV(steps);
  if (csv) {
    downloadBlob(csv, 'recorded-steps.csv', 'text/csv;charset=utf-8;');
  }
}

// XLSX export using SheetJS
async function exportXLSX() {
  const steps = getStepsWithEdits();
  if (!steps.length) { alert('No steps to export'); return; }
  
  const selectedFields = getSelectedFields();
  if (selectedFields.length === 0) {
    alert('Please select at least one field to export');
    return;
  }

  const data = steps.map((s, index) => {
    const row = {};
    selectedFields.forEach(f => {
      // Transform actionType field for export using edited values
      if (f.field === 'actionType') {
        // Use _exportActionType if available (edited), otherwise format normally
        if (s._exportActionType) {
          row[f.display] = s._exportActionType;
        } else {
          row[f.display] = formatActionTypeForExport(s, index);
        }
      } else {
        row[f.display] = s[f.field];
      }
    });
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TestSteps');
  XLSX.writeFile(wb, 'recorded-steps.xlsx');
}

// Delete a single step
async function deleteStep(index) {
  const steps = await getSteps();
  if (index < 0 || index >= steps.length) return;
  
  // Remove the step
  steps.splice(index, 1);
  
  // Renumber steps
  steps.forEach((step, idx) => {
    step.stepNumber = idx + 1;
  });
  
  // Save updated steps
  await chrome.storage.local.set({ steps });
  
  // Update editedSteps and originalSteps arrays
  editedSteps.splice(index, 1);
  originalSteps.splice(index, 1);
  
  // Refresh the table
  refresh();
}

// Clear storage
async function clearSteps() {
  if (!confirm('Clear recorded steps?')) return;
  await chrome.storage.local.set({ steps: [] });
  editedSteps = [];
  originalSteps = [];
  refresh();
}

// Refresh UI
async function refresh() {
  const steps = await getSteps();
  
  // Preserve edited values when refreshing
  if (editedSteps.length > 0 && originalSteps.length > 0) {
    // Create a map of edited values by step number
    const editedMap = new Map();
    editedSteps.forEach((edited, index) => {
      if (originalSteps[index] && edited.editedActionType) {
        editedMap.set(originalSteps[index].stepNumber, edited.editedActionType);
      }
    });
    
    // Apply edited values to new steps based on stepNumber
    steps.forEach((step, index) => {
      if (editedMap.has(step.stepNumber)) {
        if (!editedSteps[index]) {
          editedSteps[index] = { ...step };
        }
        editedSteps[index].editedActionType = editedMap.get(step.stepNumber);
      }
    });
  }
  
  renderTable(steps);
}

// Column resize functionality
let isResizing = false;
let currentResizeColumn = null;
let startX = 0;
let startWidth = 0;

function initializeColumnResize() {
  const resizeHandles = document.querySelectorAll('.resize-handle');
  const table = document.getElementById('stepsTable');
  
  // Load saved column widths
  loadColumnWidths();
  
  resizeHandles.forEach(handle => {
    // Skip if this is the delete column
    const th = handle.parentElement;
    if (th && th.classList.contains('delete-header')) return;
    handle.addEventListener('mousedown', (e) => {
      isResizing = true;
      currentResizeColumn = parseInt(handle.dataset.index);
      startX = e.pageX;
      
      const th = handle.parentElement;
      startWidth = th.offsetWidth;
      
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      
      e.preventDefault();
      e.stopPropagation();
    });
  });
  
  document.addEventListener('mousemove', (e) => {
    if (!isResizing || currentResizeColumn === null) return;
    
    const diff = e.pageX - startX;
    const newWidth = Math.max(50, startWidth + diff); // Minimum width of 50px
    
    const headers = document.querySelectorAll('#tableHead th');
    const selectedFields = getSelectedFields();
    
    if (headers[currentResizeColumn] && selectedFields[currentResizeColumn]) {
      const fieldName = selectedFields[currentResizeColumn].field;
      
      // Update header
      headers[currentResizeColumn].style.width = newWidth + 'px';
      headers[currentResizeColumn].style.minWidth = newWidth + 'px';
      headers[currentResizeColumn].style.maxWidth = newWidth + 'px';
      
      // Apply same width to all cells in this column
      const cells = document.querySelectorAll(`#tableBody td:nth-child(${currentResizeColumn + 1})`);
      cells.forEach(cell => {
        cell.style.width = newWidth + 'px';
        cell.style.minWidth = newWidth + 'px';
        cell.style.maxWidth = newWidth + 'px';
      });
    }
  });
  
  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      // Save column widths
      saveColumnWidths();
      
      currentResizeColumn = null;
    }
  });
}

// Save column widths to storage
async function saveColumnWidths() {
  const headers = document.querySelectorAll('#tableHead th');
  const widths = {};
  
  headers.forEach((th, index) => {
    if (th.dataset.field) {
      widths[th.dataset.field] = th.offsetWidth;
    }
  });
  
  await chrome.storage.local.set({ columnWidths: widths });
}

// Load column widths from storage
async function loadColumnWidths() {
  const { columnWidths = {} } = await chrome.storage.local.get('columnWidths');
  const headers = document.querySelectorAll('#tableHead th');
  
  headers.forEach((th, index) => {
    if (th.dataset.field && columnWidths[th.dataset.field]) {
      const width = columnWidths[th.dataset.field];
      th.style.width = width + 'px';
      th.style.minWidth = width + 'px';
      th.style.maxWidth = width + 'px';
    }
  });
  
  // Apply widths to cells
  if (Object.keys(columnWidths).length > 0) {
    const selectedFields = getSelectedFields();
    selectedFields.forEach((field, colIndex) => {
      if (columnWidths[field.field]) {
        const width = columnWidths[field.field];
        const cells = document.querySelectorAll(`#tableBody td:nth-child(${colIndex + 1})`);
        cells.forEach(cell => {
          cell.style.width = width + 'px';
          cell.style.minWidth = width + 'px';
          cell.style.maxWidth = width + 'px';
        });
      }
    });
  }
}

// Function to toggle recording state
async function toggleRecording() {
  const recordBtn = document.getElementById('recordBtn');
  const isRecording = recordBtn.classList.contains('recording');
  const newRecordingState = !isRecording;
  
  // Toggle recording state in storage
  await chrome.storage.local.set({ isRecording: newRecordingState });
  
  // If starting recording, inject content script into all existing tabs
  if (newRecordingState) {
    await chrome.runtime.sendMessage({ action: 'startRecording' });
  }
  
  // Update button state
  recordBtn.classList.toggle('recording');
  recordBtn.textContent = isRecording ? 'Start Recording' : 'Stop Recording';
}

// Field selector functionality
document.addEventListener('DOMContentLoaded', async () => {
  const fieldSelectorBtn = document.getElementById('fieldSelectorBtn');
  const fieldSelectorDropdown = document.getElementById('fieldSelectorDropdown');
  const selectAllBtn = document.getElementById('selectAllFields');
  const deselectAllBtn = document.getElementById('deselectAllFields');

  // Toggle dropdown
  fieldSelectorBtn.addEventListener('click', () => {
    fieldSelectorDropdown.classList.toggle('show');
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.field-selector')) {
      fieldSelectorDropdown.classList.remove('show');
    }
  });

  // Select/Deselect all buttons
  selectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('#fieldSelectorDropdown input[type="checkbox"]')
      .forEach(cb => cb.checked = true);
    refresh();
  });

  deselectAllBtn.addEventListener('click', () => {
    document.querySelectorAll('#fieldSelectorDropdown input[type="checkbox"]')
      .forEach(cb => cb.checked = false);
    refresh();
  });

  // Update table when field selection changes
  document.querySelectorAll('#fieldSelectorDropdown input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      refresh();
    });
  });

  // Initialize recording button state
  const recordBtn = document.getElementById('recordBtn');
  const { isRecording = false } = await chrome.storage.local.get('isRecording');
  if (isRecording) {
    recordBtn.classList.add('recording');
    recordBtn.textContent = 'Stop Recording';
  }

  // Add event listeners
  recordBtn.addEventListener('click', toggleRecording);
  document.getElementById('refreshBtn').addEventListener('click', refresh);
  document.getElementById('clearBtn').addEventListener('click', clearSteps);
  document.getElementById('exportCsvBtn').addEventListener('click', exportCSV);
  document.getElementById('exportXlsxBtn').addEventListener('click', exportXLSX);

  // Initial render
  refresh();
  
  // Listen for storage changes to auto-refresh
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.steps) {
      refresh();
    }
  });
});

