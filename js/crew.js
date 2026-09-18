// js/crew.js
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

// ----- Navigation Setup -----
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
    <a href="${item.href}" class="nav-link w-full block ${item.active ? 'active' : ''}">
      ${item.label}
    </a>
  `).join("");
}
renderNav("desktop-nav");
renderNav("mobile-nav");

// Mobile Drawer Controls
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

// ----- Real-time Firestore Sync & Auth Wrapper -----
let crewCache = [];
const tbody = document.getElementById("crew-list-tbody");
const emptyState = document.getElementById("crew-empty-state");

onAuthStateChanged(auth, (user) => {
  if (user) {
    onSnapshot(collection(db, "crew"), (snapshot) => {
      crewCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTable();
    }, (err) => console.error("Crew listener error:", err));
  } else {
    window.location.href = "login.html";
  }
});

function renderTable() {
  if (crewCache.length === 0) {
    tbody.innerHTML = "";
    emptyState.classList.remove("hidden");
    return;
  }
  emptyState.classList.add("hidden");
  
  // Sort alphabetically by name
  crewCache.sort((a,b) => (a.name||"").localeCompare(b.name||""));

  tbody.innerHTML = crewCache.map(member => `
    <tr class="hover:bg-gray-50/75 transition-colors">
      <td class="py-3 px-4">
        <p class="font-bold text-gray-900">${member.name}</p>
        <p class="text-xs text-gray-500 font-medium">${member.phone}</p>
      </td>
      <td class="py-3 px-4 text-xs font-bold text-gray-700">${member.role}</td>
      <td class="py-3 px-4">
        <span class="badge ${member.status === 'Active' ? 'badge-success' : 'badge-neutral'} px-2 py-1">${member.status}</span>
      </td>
      <td class="py-3 px-4 text-right space-x-1">
        <button class="btn btn-secondary text-[11px] px-2.5 py-1" onclick="window.openForm('${member.id}')">Edit</button>
        <button class="btn btn-danger text-[11px] px-2.5 py-1" onclick="window.deleteCrewMember('${member.id}')">Delete</button>
      </td>
    </tr>
  `).join("");
}

// ----- Form Logic -----
const modalForm = document.getElementById("modal-crew-form");
const crewForm = document.getElementById("crew-form");

document.getElementById("btn-open-crew-form").addEventListener("click", () => window.openForm());
document.querySelectorAll(".id-close-crew-form").forEach(el => el.addEventListener("click", () => modalForm.classList.add("hidden")));

window.openForm = function(id = null) {
  if (id) {
    const member = crewCache.find(c => c.id === id);
    document.getElementById("crew-modal-title").textContent = "Edit Crew Member";
    document.getElementById("form-crew-id").value = member.id;
    document.getElementById("form-crew-name").value = member.name || "";
    document.getElementById("form-crew-role").value = member.role || "Photographer";
    document.getElementById("form-crew-phone").value = member.phone || "";
    document.getElementById("form-crew-status").value = member.status || "Active";
  } else {
    document.getElementById("crew-modal-title").textContent = "Add Crew Member";
    crewForm.reset();
    document.getElementById("form-crew-id").value = "";
    document.getElementById("form-crew-status").value = "Active";
  }
  modalForm.classList.remove("hidden");
};

crewForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("form-crew-id").value;
  const payload = {
    name: document.getElementById("form-crew-name").value.trim(),
    role: document.getElementById("form-crew-role").value,
    phone: document.getElementById("form-crew-phone").value.trim(),
    status: document.getElementById("form-crew-status").value,
    updatedAt: serverTimestamp()
  };

  const btn = document.getElementById("btn-save-crew");
  btn.disabled = true;

  try {
    if (id) {
      await updateDoc(doc(db, "crew", id), payload);
      showToast("Crew member updated");
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, "crew"), payload);
      showToast("Crew member added");
    }
    modalForm.classList.add("hidden");
  } catch (error) {
    console.error("Error saving crew:", error);
    alert("Failed to save crew member.");
  } finally {
    btn.disabled = false;
  }
});

window.deleteCrewMember = async function(id) {
  if (!confirm("Are you sure you want to remove this crew member?")) return;
  try {
    await deleteDoc(doc(db, "crew", id));
    showToast("Crew member deleted");
  } catch (error) {
    console.error("Error deleting crew:", error);
    alert("Failed to delete.");
  }
};