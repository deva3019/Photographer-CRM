// js/events.js
import { db, app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const auth = getAuth(app);

// Navigation 
const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", href: "dashboard.html" },
  { id: "events", label: "Events", href: "events.html", active: true },
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

function getStatusBadge(status) {
  switch ((status || "").toLowerCase()) {
    case "confirmed": return `<span class="badge badge-success px-2 py-1">Confirmed</span>`;
    case "tentative": return `<span class="badge badge-warning px-2 py-1">Tentative</span>`;
    case "completed": return `<span class="badge badge-neutral px-2 py-1">Completed</span>`;
    case "cancelled": return `<span class="badge badge-danger px-2 py-1">Cancelled</span>`;
    default: return `<span class="badge badge-info px-2 py-1">${status || "Enquiry"}</span>`;
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toast-message").textContent = msg;
  toast.classList.remove("opacity-0", "translate-y-16");
  toast.classList.add("opacity-100", "translate-y-0");
  setTimeout(() => {
    toast.classList.remove("opacity-100", "translate-y-0");
    toast.classList.add("opacity-0", "translate-y-16");
  }, 3000);
}

function formatTime12h(time24) {
  if (!time24) return "";
  let [h, m] = time24.split(":");
  let hours = parseInt(h);
  let ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${m} ${ampm}`;
}

let eventsCache = [];
let clientsCache = [];
let crewCache = [];
let activeViewingEventId = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    onSnapshot(collection(db, "clients"), (snap) => {
      clientsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      clientsCache.sort((a,b) => (a.name||"").localeCompare(b.name||""));
      populateClientDropdown();
    });

    onSnapshot(collection(db, "crew"), (snap) => {
      crewCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      crewCache.sort((a,b) => (a.name||"").localeCompare(b.name||""));
      renderCrewCheckboxes();
    });

    onSnapshot(collection(db, "events"), (snapshot) => {
      eventsCache = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderEventsTable();
      if (activeViewingEventId) {
        const current = eventsCache.find(e => e.id === activeViewingEventId);
        if (current) window.openEventDetails(current.id);
      }
    });
  } else {
    window.location.href = "login.html";
  }
});

const clientSelect = document.getElementById("form-client-select");
function populateClientDropdown() {
  clientSelect.innerHTML = `<option value="">-- Choose Client from Database --</option>` + 
    clientsCache.map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join("");
}

clientSelect.addEventListener("change", (e) => {
  const selected = clientsCache.find(c => c.id === e.target.value);
  if (selected) {
    document.getElementById("form-client-name").value = selected.name || "";
    document.getElementById("form-client-phone").value = selected.phone || "";
    document.getElementById("form-client-email").value = selected.email || "";
  }
});

function renderCrewCheckboxes(selectedArray = []) {
  const container = document.getElementById('dynamic-crew-list');
  container.innerHTML = crewCache.map(c => {
    const roleStr = c.role || 'Crew';
    const valStr = `${c.name} (${roleStr})`;
    const isChecked = selectedArray.includes(valStr) ? "checked" : "";
    return `
      <label class="checkbox-container text-[11px]">
        <input type="checkbox" name="form-crew" value="${valStr}" ${isChecked} />
        <span class="truncate" title="${valStr}">${c.name} <span class="text-gray-400 font-normal">(${roleStr})</span></span>
      </label>
    `;
  }).join('');
}

// ----- Filter Elements -----
const searchInput = document.getElementById("event-search-input");
const statusFilter = document.getElementById("event-filter-status");
const typeFilter = document.getElementById("event-filter-type");
const fromDateFilter = document.getElementById("event-filter-from");
const toDateFilter = document.getElementById("event-filter-to");

[searchInput, statusFilter, typeFilter, fromDateFilter, toDateFilter].forEach(el => el?.addEventListener("input", renderEventsTable));

function renderEventsTable() {
  const tbody = document.getElementById("events-list-tbody");
  const emptyMessage = document.getElementById("events-empty-state");
  if (!tbody) return;

  const queryTerm = (searchInput.value || "").trim().toLowerCase();
  const selectedStatus = statusFilter.value;
  const selectedType = typeFilter.value.trim().toLowerCase();
  const fromDate = fromDateFilter.value;
  const toDate = toDateFilter.value;

  const filtered = eventsCache.filter(item => {
    if (selectedStatus !== "all" && (item.status || "").toLowerCase() !== selectedStatus.toLowerCase()) return false;
    if (selectedType && selectedType !== "all" && !(item.eventType || item.type || "").toLowerCase().includes(selectedType)) return false;
    
    // NEW: Date Range Filter Logic
    if (fromDate && item.date < fromDate) return false;
    if (toDate && item.date > toDate) return false;

    if (queryTerm) {
      const haystack = [item.eventName, item.clientName, item.venue, item.phone].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(queryTerm)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    emptyMessage.classList.remove("hidden");
    return;
  }
  emptyMessage.classList.add("hidden");

  tbody.innerHTML = filtered.map(e => {
    const total = Number(e.totalAmount || 0);
    const balance = total - Number(e.advance || 0);
    return `
      <tr class="hover:bg-gray-50/75 transition-colors cursor-pointer" onclick="window.openEventDetails('${e.id}')">
        <td class="py-3 px-4"><p class="font-bold text-gray-900">${e.eventName || e.client || "Untitled"}</p><p class="text-xs text-gray-500 font-medium">${e.clientName || ""} ${e.phone ? `· ${e.phone}` : ""}</p></td>
        <td class="py-3 px-4 text-xs font-bold text-gray-700">${e.eventType || e.type || "—"}</td>
        <td class="py-3 px-4"><p class="text-xs font-bold text-gray-900">${e.date || "TBD"}</p><p class="text-[11px] text-gray-500">${formatTime12h(e.startTime || e.time) || "Time TBD"}</p></td>
        <td class="py-3 px-4 text-xs max-w-[150px] truncate font-medium text-gray-800">${e.venue || "—"}</td>
        <td class="py-3 px-4">${getStatusBadge(e.status)}</td>
        <td class="py-3 px-4 text-right"><p class="text-xs font-bold text-gray-900">₹${total.toLocaleString()}</p><p class="text-[11px] font-bold ${balance > 0 ? 'text-amber-700' : 'text-emerald-700'}">Bal: ₹${balance.toLocaleString()}</p></td>
        <td class="py-3 px-4 text-right"><button class="btn btn-secondary text-[11px] px-3 py-1 font-semibold">View</button></td>
      </tr>
    `;
  }).join("");
}

// ----- View Event Details -----
window.openEventDetails = function(eventId) {
  const item = eventsCache.find(e => e.id === eventId);
  if (!item) return;
  activeViewingEventId = item.id;

  document.getElementById("det-event-name").textContent = item.eventName || item.client || "Untitled Event";
  document.getElementById("det-event-id").textContent = `ID: ${item.id}`;
  document.getElementById("det-status-badge").innerHTML = getStatusBadge(item.status);
  
  const knownStatuses = ["Enquiry", "Tentative", "Confirmed", "Completed", "Cancelled"];
  document.getElementById("det-quick-status").value = knownStatuses.includes(item.status) ? item.status : "Confirmed";

  document.getElementById("det-client-name").textContent = item.clientName || item.client || "—";
  document.getElementById("det-client-phone").textContent = item.phone || "—";
  document.getElementById("det-client-email").textContent = item.email || "—";

  const timeDisplay = formatTime12h(item.startTime || item.time) + (item.endTime ? ` - ${formatTime12h(item.endTime)}` : "");
  document.getElementById("det-date-time").textContent = `${item.date || "Date TBD"} ${timeDisplay ? `(${timeDisplay})` : ""}`;
  document.getElementById("det-venue").textContent = item.venue || "Venue not set";
  document.getElementById("det-location").textContent = item.location || "Coimbatore";

  document.getElementById("det-package-name").textContent = item.package || "Custom Package";
  
  const sContainer = document.getElementById("det-services-pills");
  const s = item.services || {};
  let activeSvc = [];
  if(s.photography) activeSvc.push("Traditional Photo");
  if(s.videography) activeSvc.push("Traditional Video");
  if(s.candid) activeSvc.push("Candid Photo");
  if(s.cinematic) activeSvc.push("Cinematic Video");
  if(s.drone) activeSvc.push("Drone");
  if(s.livestreaming) activeSvc.push("Live Streaming");
  if(s.album) activeSvc.push("Premium Album");
  if(s.outdoor) activeSvc.push("Outdoor Shoot");

  sContainer.innerHTML = activeSvc.length ? activeSvc.map(svc => `<span class="px-2.5 py-1 bg-gray-100 border border-gray-200 rounded text-[10px] font-bold text-gray-700">${svc}</span>`).join("") : `<span class="text-xs text-gray-400">Standard coverage</span>`;
  
  const extraP = document.getElementById("det-extra-services");
  if(item.extraServices) {
    extraP.textContent = `Extras: ${item.extraServices}`;
    extraP.classList.remove("hidden");
  } else {
    extraP.classList.add("hidden");
  }

  let crewDisplay = "—";
  if (Array.isArray(item.assignedCrew) && item.assignedCrew.length > 0) {
    crewDisplay = `<ul class="list-disc pl-4 space-y-0.5">` + item.assignedCrew.map(c => `<li>${c}</li>`).join("") + `</ul>`;
  } else if (item.crewRequirements) {
    crewDisplay = item.crewRequirements;
  }
  document.getElementById("det-crew").innerHTML = crewDisplay;

  // Financials & Payment Mode rendering
  const total = Number(item.totalAmount || 0);
  const advance = Number(item.advance || 0);
  document.getElementById("det-total").textContent = `₹${total.toLocaleString()}`;
  document.getElementById("det-advance").textContent = `₹${advance.toLocaleString()}`;
  document.getElementById("det-balance").textContent = `₹${(total - advance).toLocaleString()}`;
  
  document.getElementById("det-pay-mode").textContent = advance > 0 ? `(${item.paymentMode || 'Cash'})` : "";

  document.getElementById("det-notes").textContent = item.notes || "No notes.";
  document.getElementById("det-timeline").textContent = item.timeline || "No timeline.";

  document.getElementById("modal-event-details").classList.remove("hidden");
};

document.getElementById("det-quick-status").addEventListener("change", async (e) => {
  if (!activeViewingEventId) return;
  try {
    await updateDoc(doc(db, "events", activeViewingEventId), { status: e.target.value });
    showToast(`Status updated to ${e.target.value}`);
  } catch (err) {
    showToast("Error updating status.");
  }
});

// ----- Add / Edit Form -----
const modalForm = document.getElementById("modal-event-form");
const eventForm = document.getElementById("event-form");
const btnSave = document.getElementById("btn-save-event");

document.getElementById("btn-open-create-event").addEventListener("click", () => openEventForm());
document.querySelectorAll(".id-close-form").forEach(b => b.addEventListener("click", () => modalForm.classList.add("hidden")));
document.querySelectorAll(".id-close-details").forEach(b => b.addEventListener("click", () => {
  document.getElementById("modal-event-details").classList.add("hidden");
  activeViewingEventId = null;
}));

const inTotal = document.getElementById("form-total-amount");
const inAdv = document.getElementById("form-advance");
const inBal = document.getElementById("form-balance");
function calcBal() { inBal.value = (parseFloat(inTotal.value)||0) - (parseFloat(inAdv.value)||0); }
inTotal.addEventListener("input", calcBal);
inAdv.addEventListener("input", calcBal);

function openEventForm(eventData = null) {
  document.getElementById("form-error-msg").classList.add("hidden");
  
  if (eventData) {
    document.getElementById("form-modal-title").textContent = "Edit Event";
    document.getElementById("btn-save-text").textContent = "Save Changes";
    document.getElementById("form-event-id").value = eventData.id;

    document.getElementById("form-event-name").value = eventData.eventName || eventData.client || "";
    document.getElementById("form-event-type").value = eventData.eventType || eventData.type || "";
    document.getElementById("form-event-date").value = eventData.date || "";
    document.getElementById("form-event-start-time").value = eventData.startTime || eventData.time || "";
    document.getElementById("form-event-end-time").value = eventData.endTime || "";
    document.getElementById("form-event-venue").value = eventData.venue || "";
    document.getElementById("form-event-location").value = eventData.location || "Coimbatore";
    document.getElementById("form-event-status").value = eventData.status || "Confirmed";

    document.getElementById("form-client-select").value = ""; 
    document.getElementById("form-client-name").value = eventData.clientName || eventData.client || "";
    document.getElementById("form-client-phone").value = eventData.phone || "";
    document.getElementById("form-client-email").value = eventData.email || "";

    document.getElementById("form-package-name").value = eventData.package || "";
    const s = eventData.services || {};
    document.getElementById("svc-photography").checked = s.photography !== false;
    document.getElementById("svc-videography").checked = s.videography !== false;
    document.getElementById("svc-candid").checked = !!s.candid;
    document.getElementById("svc-cinematic").checked = !!s.cinematic;
    document.getElementById("svc-drone").checked = !!s.drone;
    document.getElementById("svc-livestreaming").checked = !!s.livestreaming;
    document.getElementById("svc-album").checked = !!s.album;
    document.getElementById("svc-outdoor").checked = !!s.outdoor;
    document.getElementById("form-extra-services").value = eventData.extraServices || "";

    renderCrewCheckboxes(eventData.assignedCrew || []);

    inTotal.value = eventData.totalAmount || 0;
    inAdv.value = eventData.advance || 0;
    document.getElementById("form-payment-mode").value = eventData.paymentMode || "Cash"; // Pre-fill new field
    calcBal();

    document.getElementById("form-timeline").value = eventData.timeline || "";
    document.getElementById("form-notes").value = eventData.notes || "";
  } else {
    document.getElementById("form-modal-title").textContent = "Add New Event";
    document.getElementById("btn-save-text").textContent = "Create Event";
    eventForm.reset();
    document.getElementById("form-event-id").value = "";
    document.getElementById("form-event-date").value = new Date().toISOString().split('T')[0];
    document.getElementById("form-event-location").value = "Coimbatore";
    renderCrewCheckboxes([]); 
    calcBal();
  }

  document.getElementById("modal-event-details").classList.add("hidden");
  modalForm.classList.remove("hidden");
}

eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const selectedCrew = Array.from(document.querySelectorAll('input[name="form-crew"]:checked')).map(cb => cb.value);

  const payload = {
    eventName: document.getElementById("form-event-name").value.trim(),
    eventType: document.getElementById("form-event-type").value.trim(),
    date: document.getElementById("form-event-date").value,
    startTime: document.getElementById("form-event-start-time").value,
    endTime: document.getElementById("form-event-end-time").value,
    venue: document.getElementById("form-event-venue").value.trim(),
    location: document.getElementById("form-event-location").value.trim(),
    status: document.getElementById("form-event-status").value,
    clientName: document.getElementById("form-client-name").value.trim(),
    phone: document.getElementById("form-client-phone").value.trim(),
    email: document.getElementById("form-client-email").value.trim(),
    package: document.getElementById("form-package-name").value.trim(),
    services: {
      photography: document.getElementById("svc-photography").checked,
      videography: document.getElementById("svc-videography").checked,
      candid: document.getElementById("svc-candid").checked,
      cinematic: document.getElementById("svc-cinematic").checked,
      drone: document.getElementById("svc-drone").checked,
      livestreaming: document.getElementById("svc-livestreaming").checked,
      album: document.getElementById("svc-album").checked,
      outdoor: document.getElementById("svc-outdoor").checked
    },
    extraServices: document.getElementById("form-extra-services").value.trim(),
    assignedCrew: selectedCrew,
    totalAmount: parseFloat(inTotal.value) || 0,
    advance: parseFloat(inAdv.value) || 0,
    paymentMode: document.getElementById("form-payment-mode").value, // Save new field
    timeline: document.getElementById("form-timeline").value.trim(),
    notes: document.getElementById("form-notes").value.trim(),
    updatedAt: serverTimestamp()
  };

  btnSave.disabled = true;
  document.getElementById("btn-save-spinner").classList.remove("hidden");

  try {
    const eventId = document.getElementById("form-event-id").value;
    if (eventId) {
      await updateDoc(doc(db, "events", eventId), payload);
      showToast("Event updated!");
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "events"), payload);
      showToast("Event created!");
    }
    modalForm.classList.add("hidden");
  } catch (err) {
    document.getElementById("form-error-msg").textContent = "Error saving. Check connection.";
    document.getElementById("form-error-msg").classList.remove("hidden");
  } finally {
    btnSave.disabled = false;
    document.getElementById("btn-save-spinner").classList.add("hidden");
  }
});

document.getElementById("det-btn-edit").addEventListener("click", () => {
  const item = eventsCache.find(e => e.id === activeViewingEventId);
  if (item) openEventForm(item);
});

// Delete Logic
const modalDelete = document.getElementById("modal-confirm-delete");
document.getElementById("det-btn-delete").addEventListener("click", () => {
  document.getElementById("del-event-name").textContent = document.getElementById("det-event-name").textContent;
  modalDelete.classList.remove("hidden");
});
document.querySelectorAll(".id-close-delete").forEach(b => b.addEventListener("click", () => modalDelete.classList.add("hidden")));

document.getElementById("del-btn-confirm").addEventListener("click", async () => {
  if (!activeViewingEventId) return;
  try {
    await deleteDoc(doc(db, "events", activeViewingEventId));
    showToast("Event deleted.");
    modalDelete.classList.add("hidden");
    document.getElementById("modal-event-details").classList.add("hidden");
    activeViewingEventId = null;
  } catch (err) {
    showToast("Error deleting event.");
  }
});

// ================= INVOICE LOGIC =================
const modalInvoice = document.getElementById("modal-invoice");
const invCalcTotal = document.getElementById("inv-calc-total");
const invCalcAdv = document.getElementById("inv-calc-advance");
const invCalcBal = document.getElementById("inv-calc-balance");
const invStandardRate = document.getElementById("inv-standard-rate");

function updateInvoiceMath() {
  const total = parseFloat(invCalcTotal.textContent.replace(/,/g, '')) || 0;
  const adv = parseFloat(invCalcAdv.textContent.replace(/,/g, '')) || 0;
  invCalcBal.textContent = (total - adv).toLocaleString();
}
invCalcTotal.addEventListener("input", updateInvoiceMath);
invCalcAdv.addEventListener("input", updateInvoiceMath);

document.getElementById("btn-open-invoice").addEventListener("click", () => {
  const item = eventsCache.find(e => e.id === activeViewingEventId);
  if(!item) return;

  document.getElementById("inv-package").innerHTML = `${item.package || "Custom Wedding Package"}`;
  
  const totalStr = Number(item.totalAmount || 0).toLocaleString();
  invStandardRate.innerHTML = `Standard Rate: ₹${(Number(item.totalAmount || 0) + 30000).toLocaleString()}`;
  document.getElementById("inv-special-rate").textContent = `${totalStr}/-`;
  
  const s = item.services || {};
  let activeSvc = [];
  if(s.photography) activeSvc.push("• 1 Traditional Photographer (Unlimited full-day coverage)");
  if(s.videography) activeSvc.push("• 1 Traditional Videographer (Unlimited full-day coverage)");
  if(s.candid) activeSvc.push("• 1 Candid Photographer (Unlimited captures)");
  if(s.cinematic) activeSvc.push("• 1 Cinematic Videographer");
  if(s.drone) activeSvc.push("• Drone / Helicam Services (Premium aerial perspectives)");
  if(s.livestreaming) activeSvc.push("• Premium Live Streaming Services");
  if(item.extraServices) activeSvc.push(`• Extra: ${item.extraServices}`);
  
  const timeDisplay = formatTime12h(item.startTime || item.time) + (item.endTime ? ` - ${formatTime12h(item.endTime)}` : "");
  
  document.getElementById("inv-event-schedule").innerHTML = `
    <h4 class="font-bold text-[13px] text-gray-800 mb-1 border-b border-gray-300 pb-1">Event 1: ${item.eventType || "Main Event"}</h4>
    <div class="grid grid-cols-3 gap-4 mb-4 text-xs">
      <div>
        <p class="font-bold text-gray-400 uppercase tracking-widest text-[9px]">Date & Time</p>
        <p>${item.date}</p>
        <p class="text-gray-600">${timeDisplay || "Time TBD"}</p>
      </div>
      <div class="col-span-2">
        <p class="font-bold text-gray-400 uppercase tracking-widest text-[9px]">Venue</p>
        <p>${item.venue || "Venue TBD"}</p>
        <p class="text-gray-600">${item.location || ""}</p>
      </div>
    </div>
    <p class="font-bold text-gray-400 uppercase tracking-widest text-[9px] mb-1">Services Captured</p>
    <ul class="text-xs text-gray-700 space-y-0.5">
      ${activeSvc.length > 0 ? activeSvc.join("") : "• Standard Event Coverage"}
    </ul>
  `;

  document.getElementById("inv-foot-client-name").textContent = item.clientName || item.client || "";
  document.getElementById("inv-foot-client-phone").textContent = item.phone || "";
  
  invCalcTotal.textContent = totalStr;
  invCalcAdv.textContent = Number(item.advance || 0).toLocaleString();
  updateInvoiceMath();

  modalInvoice.classList.remove("hidden");
});

document.querySelectorAll(".id-close-invoice").forEach(b => b.addEventListener("click", () => modalInvoice.classList.add("hidden")));

// WhatsApp
document.getElementById("btn-whatsapp-invoice").addEventListener("click", () => {
  const item = eventsCache.find(e => e.id === activeViewingEventId);
  if(!item) return;

  let waPhone = (item.phone || "").replace(/\D/g, '');
  if(waPhone.length === 10) waPhone = "91" + waPhone; 

  const msg = `*MEMORIES PHOTOGRAPHY* 📸
_Booking Confirmation_

*Event:* ${item.eventName || item.clientName}
*Date:* ${item.date}
*Venue:* ${item.venue}
*Package:* ${document.getElementById("inv-package").innerText}

*Financial Summary:*
Total Package Value: ₹${invCalcTotal.textContent}
Advance Received: ₹${invCalcAdv.textContent}
*Balance Due: ₹${invCalcBal.textContent}*

Thank you for choosing us to capture your eternal milestones! ✨`;

  window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, "_blank");
});