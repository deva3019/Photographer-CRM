// js/production.js
import { db, app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp
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
  { id: "settings", label: "Settings", href: "settings.html" }
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

const drawer = document.getElementById("mobile-drawer");
document.getElementById("mobile-menu-btn")?.addEventListener("click", () => drawer.classList.remove("hidden"));
document.getElementById("mobile-close-btn")?.addEventListener("click", () => drawer.classList.add("hidden"));
document.getElementById("mobile-overlay")?.addEventListener("click", () => drawer.classList.add("hidden"));

// ----- UI Helpers -----
function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-message").textContent = msg;
  toast.classList.remove("opacity-0", "translate-y-16");
  toast.classList.add("opacity-100", "translate-y-0");
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-16");
  }, 2800);
}

// ----- State Caches -----
let prodCache = [];
let eventsCache = [];
let crewCache = [];

// ----- Auth & Listeners -----
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 1. Fetch Events (To link projects & check financials)
    onSnapshot(collection(db, "events"), (snap) => {
      eventsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      populateEventDropdown();
      renderGrid();
    });

    // 2. Fetch Crew (To assign editors)
    onSnapshot(collection(db, "crew"), (snap) => {
      crewCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      populateEditorDropdown();
    });

    // 3. Fetch Production Pipeline
    onSnapshot(collection(db, "production"), (snap) => {
      prodCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderGrid();
    });

  } else {
    window.location.href = "login.html";
  }
});

// ----- Form Dropdowns -----
const selectEvent = document.getElementById("prod-event-id");
const selectEditor = document.getElementById("prod-editor");

function populateEventDropdown() {
  eventsCache.sort((a,b) => (b.date||"").localeCompare(a.date||"")); // Newest first
  selectEvent.innerHTML = `<option value="">-- Choose Event --</option>` + 
    eventsCache.map(e => `<option value="${e.id}">${e.eventName || e.client} (${e.date})</option>`).join("");
}

function populateEditorDropdown() {
  selectEditor.innerHTML = `<option value="">-- Unassigned --</option>` + 
    crewCache.map(c => `<option value="${c.name}">${c.name} (${c.role})</option>`).join("");
}

// ----- Grid Rendering (The Photographer Mindset Logic) -----
const grid = document.getElementById("pipeline-grid");
const emptyState = document.getElementById("pipeline-empty-state");

function getStageColor(stage) {
  if (stage === "Delivered") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (stage === "Ready for Delivery") return "bg-blue-100 text-blue-800 border-blue-200";
  if (stage === "Client Review") return "bg-amber-100 text-amber-800 border-amber-200";
  if (stage === "Printing") return "bg-purple-100 text-purple-800 border-purple-200";
  return "bg-gray-100 text-gray-800 border-gray-200";
}

function renderGrid() {
  if (prodCache.length === 0) {
    grid.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  
  // Sort: Put "Delivered" at the bottom, others by newest
  prodCache.sort((a, b) => {
    if (a.stage === "Delivered" && b.stage !== "Delivered") return 1;
    if (a.stage !== "Delivered" && b.stage === "Delivered") return -1;
    return 0; 
  });

  grid.innerHTML = prodCache.map(p => {
    // Relational Check: Find the linked event
    const linkedEvent = eventsCache.find(e => e.id === p.eventId) || {};
    
    // Financial Security Check: Does the client owe money?
    const total = Number(linkedEvent.totalAmount || 0);
    const adv = Number(linkedEvent.advance || 0);
    const balanceDue = total - adv;
    
    let paymentWarningHTML = "";
    if (balanceDue > 0) {
      paymentWarningHTML = `
        <div class="mt-3 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700 flex items-center gap-1.5 font-bold">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          DO NOT DELIVER: ₹${balanceDue.toLocaleString()} Due
        </div>
      `;
    } else if (total > 0 && balanceDue <= 0) {
      paymentWarningHTML = `
        <div class="mt-3 p-2 bg-emerald-50 border border-emerald-200 rounded text-[10px] text-emerald-700 flex items-center gap-1.5 font-bold">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          Fully Paid. Safe to Deliver.
        </div>
      `;
    }

    return `
      <div class="panel bg-white/95 backdrop-blur p-4 flex flex-col justify-between shadow-sm border border-gray-200 relative overflow-hidden group">
        
        <!-- Header -->
        <div class="flex justify-between items-start mb-2">
          <div class="pr-3 min-w-0">
            <h4 class="font-bold text-sm text-gray-900 leading-tight truncate">${linkedEvent.eventName || p.eventName || "Unknown Event"}</h4>
            <p class="text-[10px] text-gray-500 font-medium uppercase tracking-wider mt-0.5">${linkedEvent.clientName || "Unknown Client"}</p>
          </div>
          <button class="text-gray-300 hover:text-red-600 transition-colors action-delete shrink-0" data-id="${p.id}" title="Remove Project">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
        
        <!-- Badges -->
        <div class="flex flex-wrap gap-2 mb-3">
          <span class="border px-2 py-0.5 rounded text-[10px] font-bold ${getStageColor(p.stage)}">${p.stage}</span>
          ${p.dueDate ? `<span class="border border-gray-200 bg-gray-50 text-gray-600 px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Due: ${p.dueDate}</span>` : ''}
        </div>

        <!-- Details -->
        <div class="text-[11px] text-gray-600 mb-3 space-y-1">
          <p><span class="font-semibold text-gray-800">Editor:</span> ${p.editor || "Unassigned"}</p>
          <p class="line-clamp-2" title="${p.notes}"><span class="font-semibold text-gray-800">Deliverables:</span> ${p.notes || "No specific notes."}</p>
        </div>

        <!-- Warning -->
        ${paymentWarningHTML}
        
        <!-- Stage Updater -->
        <div class="mt-4 pt-3 border-t border-gray-100">
          <label class="text-[9px] uppercase tracking-widest font-bold text-gray-400 block mb-1">Update Pipeline Stage</label>
          <select class="input-control select-control w-full text-xs font-bold text-black border-gray-300 stage-updater" data-id="${p.id}">
            <option value="Data Backup" ${p.stage === 'Data Backup' ? 'selected' : ''}>Data Backup</option>
            <option value="Culling" ${p.stage === 'Culling' ? 'selected' : ''}>Culling</option>
            <option value="Photo Editing" ${p.stage === 'Photo Editing' ? 'selected' : ''}>Photo Editing</option>
            <option value="Video Editing" ${p.stage === 'Video Editing' ? 'selected' : ''}>Video Editing</option>
            <option value="Client Review" ${p.stage === 'Client Review' ? 'selected' : ''}>Client Review</option>
            <option value="Album Design" ${p.stage === 'Album Design' ? 'selected' : ''}>Album Design</option>
            <option value="Printing" ${p.stage === 'Printing' ? 'selected' : ''}>Printing / Framing</option>
            <option value="Ready for Delivery" ${p.stage === 'Ready for Delivery' ? 'selected' : ''}>Ready for Delivery</option>
            <option value="Delivered" ${p.stage === 'Delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </div>
      </div>
    `;
  }).join("");

  // Quick Stage Update listener
  document.querySelectorAll(".stage-updater").forEach(select => {
    select.addEventListener("change", async (e) => {
      try {
        await updateDoc(doc(db, "production", e.target.dataset.id), { stage: e.target.value });
        showToast(`Moved to ${e.target.value}`);
      } catch (err) {
        showToast("Error updating stage.");
      }
    });
  });

  // Delete listener
  document.querySelectorAll(".action-delete").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if (confirm("Remove this project from post-production?")) {
        await deleteDoc(doc(db, "production", e.currentTarget.dataset.id));
        showToast("Project removed.");
      }
    });
  });
}

// ----- Form Logic -----
const modalForm = document.getElementById("modal-prod");
const prodForm = document.getElementById("prod-form");

document.getElementById("btn-add-production").addEventListener("click", () => {
  prodForm.reset();
  document.getElementById("prod-stage").value = "Data Backup";
  modalForm.classList.remove("hidden");
});
document.querySelectorAll(".id-close-modal").forEach(el => el.addEventListener("click", () => modalForm.classList.add("hidden")));

prodForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  
  const eventId = selectEvent.value;
  // Fallback text if event is somehow missing from cache during save
  const selectedEventDoc = eventsCache.find(ev => ev.id === eventId) || {};

  const payload = {
    eventId: eventId,
    eventName: selectedEventDoc.eventName || "Custom Project",
    stage: document.getElementById("prod-stage").value,
    dueDate: document.getElementById("prod-due-date").value,
    editor: document.getElementById("prod-editor").value,
    notes: document.getElementById("prod-notes").value.trim(),
    createdAt: serverTimestamp()
  };

  try {
    await addDoc(collection(db, "production"), payload);
    showToast("Project added to pipeline");
    modalForm.classList.add("hidden");
  } catch (err) {
    alert("Failed to add project.");
  }
});