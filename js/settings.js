// js/settings.js
import { db, app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, getDocs, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const auth = getAuth(app);

// ----- Logout Functionality -----
document.querySelectorAll(".btn-logout").forEach(btn => {
  btn.addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.href = "login.html";
    } catch (error) {
      console.error("Error signing out:", error);
    }
  });
});

// ----- Navigation -----
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { id: "events", label: "Events", href: "events.html" }, 
  { id: "clients", label: "Clients", href: "clients.html" },
  { id: "crew", label: "Crew", href: "crew.html" },
  { id: "post-production", label: "Post-Production", href: "production.html" },
  { id: "settings", label: "Settings", href: "settings.html", active: true }
];

function renderNav(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = NAV_ITEMS.map(item => `
    <a href="${item.href}" class="nav-link w-full block ${item.active ? 'active' : ''}">${item.label}</a>
  `).join("");
}
renderNav("desktop-nav");
renderNav("mobile-nav");

document.getElementById("mobile-menu-btn")?.addEventListener("click", () => document.getElementById("mobile-drawer").classList.remove("hidden"));
document.getElementById("mobile-close-btn")?.addEventListener("click", () => document.getElementById("mobile-drawer").classList.add("hidden"));

function showToast(msg, isError = false) {
  const toast = document.getElementById("toast");
  toast.classList.replace(isError ? "bg-black" : "bg-red-600", isError ? "bg-red-600" : "bg-black");
  document.getElementById("toast-message").textContent = msg;
  toast.classList.remove("opacity-0", "translate-y-16");
  toast.classList.add("opacity-100", "translate-y-0");
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-16");
  }, 3000);
}

onAuthStateChanged(auth, (user) => {
  if (!user) window.location.href = "login.html";
});


// ==========================================
// 1. DATA EXPORT (ZIP + EXCEL CHUNKS + JSON)
// ==========================================
const btnExport = document.getElementById("btn-export-data");
const exportSpinner = document.getElementById("export-spinner");
const collectionsList = ["events", "clients", "crew", "production"]; 
const EXCEL_ROW_LIMIT = 50000; // Chunk limit for Excel performance

btnExport.addEventListener("click", async () => {
  btnExport.disabled = true;
  exportSpinner.classList.remove("hidden");
  
  try {
    const backupData = {
      _metadata: { exportedAt: new Date().toISOString(), version: "2.1" }
    };

    // 1. Fetch all collections from Firestore
    for (const colName of collectionsList) {
      const snap = await getDocs(collection(db, colName));
      backupData[colName] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
    }

    // Initialize JSZip
    const zip = new JSZip();
    
    // Add the raw JSON file for system restores
    zip.file("System_Restore_Data.json", JSON.stringify(backupData, null, 2));

    // 2. Convert Data to Excel Chunks
    for (const colName of collectionsList) {
      const dataArray = backupData[colName];
      if (!dataArray || dataArray.length === 0) continue;

      // Flatten objects (like services {}) for Excel readability
      const flatData = dataArray.map(item => {
        let flatItem = { ...item };
        if (flatItem.services) {
          flatItem.services = Object.keys(flatItem.services).filter(k => flatItem.services[k]).join(", ");
        }
        if (Array.isArray(flatItem.assignedCrew)) {
          flatItem.assignedCrew = flatItem.assignedCrew.join(" | ");
        }
        return flatItem;
      });

      // Split into chunks if data exceeds EXCEL_ROW_LIMIT
      const chunks = [];
      for (let i = 0; i < flatData.length; i += EXCEL_ROW_LIMIT) {
        chunks.push(flatData.slice(i, i + EXCEL_ROW_LIMIT));
      }

      // Generate .xlsx files for each chunk using SheetJS
      chunks.forEach((chunk, index) => {
        const worksheet = XLSX.utils.json_to_sheet(chunk);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, colName);
        
        // Write to array buffer
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        // Naming: "Events.xlsx" or "Events_Part_2.xlsx"
        const fileName = chunks.length > 1 ? `${colName.charAt(0).toUpperCase() + colName.slice(1)}_Part_${index + 1}.xlsx` : `${colName.charAt(0).toUpperCase() + colName.slice(1)}.xlsx`;
        
        // Add to Zip
        zip.file(fileName, excelBuffer);
      });
    }

    // 3. Generate ZIP and Trigger Download
    const zipBlob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(zipBlob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `Memories_Studio_Backup_${new Date().toISOString().split('T')[0]}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("ZIP & Excel Download Complete!");
  } catch (err) {
    console.error(err);
    showToast("Error generating Excel backup.", true);
  } finally {
    btnExport.disabled = false;
    exportSpinner.classList.add("hidden");
  }
});


// ==========================================
// 2. DATA IMPORT (RESTORE JSON ONLY)
// ==========================================
const btnTriggerImport = document.getElementById("btn-trigger-import");
const importFileInput = document.getElementById("import-file");
const importSpinner = document.getElementById("import-spinner");

btnTriggerImport.addEventListener("click", () => importFileInput.click());

importFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (!confirm("WARNING: Restoring data will overwrite existing records with matching IDs and add new ones. Are you absolutely sure?")) {
    importFileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = async (event) => {
    btnTriggerImport.disabled = true;
    importSpinner.classList.remove("hidden");

    try {
      const data = JSON.parse(event.target.result);
      const batch = writeBatch(db);
      let operationCount = 0;

      for (const colName of collectionsList) {
        if (data[colName] && Array.isArray(data[colName])) {
          data[colName].forEach(docData => {
            const docId = docData._id;
            delete docData._id; 
            const ref = docId ? doc(db, colName, docId) : doc(collection(db, colName));
            batch.set(ref, docData, { merge: true });
            operationCount++;
          });
        }
      }

      if (operationCount > 0) {
        await batch.commit();
        showToast(`Successfully restored ${operationCount} records!`);
      } else {
        showToast("No valid data found in file.", true);
      }
    } catch (err) {
      console.error(err);
      showToast("Error processing restore file.", true);
    } finally {
      btnTriggerImport.disabled = false;
      importSpinner.classList.add("hidden");
      importFileInput.value = "";
    }
  };
  reader.readAsText(file);
});


// ==========================================
// 3. INTERACTIVE DATA VIEWER
// ==========================================
const viewerArea = document.getElementById("viewer-upload-area");
const viewerInput = document.getElementById("viewer-file-input");
const viewerOutput = document.getElementById("viewer-output-area");
const btnClearViewer = document.getElementById("btn-clear-viewer");
const viewerTabs = document.getElementById("viewer-tabs");
const viewerTables = document.getElementById("viewer-tables-container");

viewerArea.addEventListener("click", () => viewerInput.click());
viewerArea.addEventListener("dragover", (e) => { e.preventDefault(); viewerArea.classList.add("drag-active"); });
viewerArea.addEventListener("dragleave", () => viewerArea.classList.remove("drag-active"));
viewerArea.addEventListener("drop", (e) => {
  e.preventDefault();
  viewerArea.classList.remove("drag-active");
  if (e.dataTransfer.files.length) handleViewerFile(e.dataTransfer.files[0]);
});
viewerInput.addEventListener("change", (e) => {
  if (e.target.files.length) handleViewerFile(e.target.files[0]);
});

function handleViewerFile(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      renderViewer(data);
    } catch (err) {
      showToast("Invalid JSON file.", true);
    }
  };
  reader.readAsText(file);
}

function renderViewer(data) {
  viewerArea.classList.add("hidden");
  viewerOutput.classList.remove("hidden");
  btnClearViewer.classList.remove("hidden");
  
  viewerTabs.innerHTML = "";
  viewerTables.innerHTML = "";

  let firstValidKey = null;

  Object.keys(data).forEach(key => {
    if (key === "_metadata") return; 
    const items = data[key];
    if (!Array.isArray(items) || items.length === 0) return;

    if (!firstValidKey) firstValidKey = key;

    const tab = document.createElement("button");
    tab.className = `px-4 py-2 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${key === firstValidKey ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`;
    tab.textContent = `${key} (${items.length})`;
    tab.dataset.target = `table-${key}`;
    tab.onclick = (e) => switchViewerTab(e.currentTarget, key);
    viewerTabs.appendChild(tab);

    const headers = Object.keys(items[0]).filter(k => k !== "_id" && !k.toLowerCase().includes("at")); 
    
    let tableHTML = `
      <div id="table-${key}" class="hidden json-table">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="border-b border-gray-200 text-gray-500 uppercase">
              ${headers.map(h => `<th class="py-2 px-3 font-semibold">${h}</th>`).join("")}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 text-gray-800">
            ${items.map(row => `
              <tr class="hover:bg-gray-50">
                ${headers.map(h => {
                  let val = row[h];
                  if (typeof val === "object" && val !== null) val = "{...}";
                  return `<td class="py-2 px-3 truncate max-w-[150px]" title="${val}">${val !== undefined ? val : '-'}</td>`;
                }).join("")}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
    viewerTables.insertAdjacentHTML('beforeend', tableHTML);
  });

  if (firstValidKey) document.getElementById(`table-${firstValidKey}`).classList.remove("hidden");
}

function switchViewerTab(activeTabBtn, key) {
  Array.from(viewerTabs.children).forEach(btn => {
    btn.classList.remove('border-indigo-600', 'text-indigo-600');
    btn.classList.add('border-transparent', 'text-gray-500');
  });
  Array.from(viewerTables.children).forEach(table => table.classList.add('hidden'));

  activeTabBtn.classList.add('border-indigo-600', 'text-indigo-600');
  activeTabBtn.classList.remove('border-transparent', 'text-gray-500');
  document.getElementById(`table-${key}`).classList.remove("hidden");
}

btnClearViewer.addEventListener("click", () => {
  viewerOutput.classList.add("hidden");
  btnClearViewer.classList.add("hidden");
  viewerArea.classList.remove("hidden");
  viewerInput.value = "";
});