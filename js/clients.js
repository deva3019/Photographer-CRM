// js/clients.js
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

// ----- State Cache -----
let clientsCache = [];
let eventsCache = [];
let activeViewingClientId = null;

// ----- Auth Wrapper & Listeners -----
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 1. Listen to Events (Required for calculations)
    onSnapshot(collection(db, "events"), (snap) => {
      eventsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTable(); // Re-render table to update financial math
      
      // Update details modal if open
      if (activeViewingClientId) window.openClientDetails(activeViewingClientId);
    });

    // 2. Listen to Clients
    onSnapshot(collection(db, "clients"), (snap) => {
      clientsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTable();
    });
  } else {
    window.location.href = "login.html";
  }
});

// ----- Compute & Render Table -----
const tbody = document.getElementById("clients-tbody");
const emptyState = document.getElementById("clients-empty-state");

function renderTable() {
  if (clientsCache.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  
  clientsCache.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  tbody.innerHTML = clientsCache.map(client => {
    // Relational Math: Find events linked to this client
    const clientEvents = eventsCache.filter(e => e.clientName === client.name || e.phone === client.phone);
    
    let totalSpent = 0;
    let balanceDue = 0;
    clientEvents.forEach(e => {
      const t = parseFloat(e.totalAmount) || 0;
      const a = parseFloat(e.advance) || 0;
      totalSpent += t;
      balanceDue += (t - a);
    });

    return `
      <tr class="hover:bg-gray-50/75 transition-colors cursor-pointer" onclick="window.openClientDetails('${client.id}')">
        <td class="py-3 px-4">
          <p class="font-bold text-gray-900">${client.name}</p>
          <p class="text-xs text-gray-500 font-medium">${client.phone}</p>
        </td>
        <td class="py-3 px-4 text-center font-bold text-gray-700">${clientEvents.length}</td>
        <td class="py-3 px-4 text-right text-xs font-bold">₹${totalSpent.toLocaleString()}</td>
        <td class="py-3 px-4 text-right text-xs font-bold ${balanceDue > 0 ? 'text-amber-700' : 'text-emerald-700'}">₹${balanceDue.toLocaleString()}</td>
        <td class="py-3 px-4 text-right space-x-1" onclick="event.stopPropagation()">
          <button class="btn btn-secondary text-[11px] px-2.5 py-1" onclick="openForm('${client.id}')">Edit</button>
          <button class="btn btn-danger text-[11px] px-2.5 py-1" onclick="deleteClient('${client.id}')">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
}

// ----- Client Details Modal -----
window.openClientDetails = function(clientId) {
  const client = clientsCache.find(c => c.id === clientId);
  if (!client) return;
  activeViewingClientId = clientId;

  document.getElementById("det-cli-name").textContent = client.name;
  document.getElementById("det-cli-phone").textContent = `${client.phone} | ${client.email || "No email provided"}`;

  // Process History
  const clientEvents = eventsCache.filter(e => e.clientName === client.name || e.phone === client.phone);
  clientEvents.sort((a, b) => (b.date || "").localeCompare(a.date || "")); // Newest first

  let totalSpent = 0;
  let balanceDue = 0;
  
  const historyContainer = document.getElementById("det-cli-history");
  if (clientEvents.length === 0) {
    historyContainer.innerHTML = `<p class="text-xs text-gray-500 italic">No events booked yet.</p>`;
  } else {
    historyContainer.innerHTML = clientEvents.map(e => {
      const t = parseFloat(e.totalAmount) || 0;
      const a = parseFloat(e.advance) || 0;
      const b = t - a;
      totalSpent += t;
      balanceDue += b;
      
      return `
        <div class="p-3 border border-gray-200 rounded bg-white flex justify-between items-center shadow-sm">
          <div>
            <p class="font-bold text-sm text-gray-900">${e.eventName || e.type || "Event"}</p>
            <p class="text-xs text-gray-500">${e.date} · ${e.status}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-bold">Total: ₹${t.toLocaleString()}</p>
            <p class="text-[10px] font-bold ${b > 0 ? 'text-amber-700' : 'text-emerald-700'}">Bal: ₹${b.toLocaleString()}</p>
          </div>
        </div>
      `;
    }).join("");
  }

  document.getElementById("det-cli-events").textContent = clientEvents.length;
  document.getElementById("det-cli-spent").textContent = `₹${totalSpent.toLocaleString()}`;
  document.getElementById("det-cli-balance").textContent = `₹${balanceDue.toLocaleString()}`;

  document.getElementById("modal-client-details").classList.remove("hidden");
};

// WhatsApp Integration
document.getElementById("btn-wa-client").addEventListener("click", () => {
  const client = clientsCache.find(c => c.id === activeViewingClientId);
  if(!client || !client.phone) return;
  let waPhone = client.phone.replace(/\D/g, '');
  if(waPhone.length === 10) waPhone = "91" + waPhone;
  window.open(`https://wa.me/${waPhone}`, "_blank");
});

document.querySelectorAll(".id-close-details").forEach(el => el.addEventListener("click", () => {
  document.getElementById("modal-client-details").classList.add("hidden");
  activeViewingClientId = null;
}));

// ----- Add / Edit Form Logic -----
const modalForm = document.getElementById("modal-client-form");
const clientForm = document.getElementById("client-form");

document.getElementById("btn-add-client").addEventListener("click", () => openForm());
document.querySelectorAll(".id-close-form").forEach(el => el.addEventListener("click", () => modalForm.classList.add("hidden")));

window.openForm = function(id = null) {
  if (id) {
    const client = clientsCache.find(c => c.id === id);
    document.getElementById("modal-title").textContent = "Edit Client";
    document.getElementById("cli-id").value = client.id;
    document.getElementById("cli-name").value = client.name || "";
    document.getElementById("cli-phone").value = client.phone || "";
    document.getElementById("cli-email").value = client.email || "";
  } else {
    document.getElementById("modal-title").textContent = "Add Client";
    clientForm.reset();
    document.getElementById("cli-id").value = "";
  }
  modalForm.classList.remove("hidden");
};

clientForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("cli-id").value;
  const payload = {
    name: document.getElementById("cli-name").value.trim(),
    phone: document.getElementById("cli-phone").value.trim(),
    email: document.getElementById("cli-email").value.trim(),
    updatedAt: serverTimestamp()
  };

  const btn = document.getElementById("btn-save-client");
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, "clients", id), payload);
      showToast("Client updated successfully");
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "clients"), payload);
      showToast("Client added successfully");
    }
    modalForm.classList.add("hidden");
  } catch (error) {
    alert("Failed to save client data.");
  } finally {
    btn.disabled = false;
  }
});

window.deleteClient = async function(id) {
  if (!confirm("Are you sure you want to delete this client?")) return;
  try {
    await deleteDoc(doc(db, "clients", id));
    showToast("Client deleted");
  } catch (error) {
    alert("Failed to delete.");
  }
};