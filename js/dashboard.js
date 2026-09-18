// js/dashboard.js
import { db, app } from "./firebase-config.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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

// Navigation
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

// Mobile Drawer Controls
const drawer = document.getElementById("mobile-drawer");
document.getElementById("mobile-menu-btn")?.addEventListener("click", () => drawer.classList.remove("hidden"));
document.getElementById("mobile-close-btn")?.addEventListener("click", () => drawer.classList.add("hidden"));
document.getElementById("mobile-overlay")?.addEventListener("click", () => drawer.classList.add("hidden"));

// Helpers
function emptyState(msg) { return `<p class="text-xs text-gray-500 py-3">${msg}</p>`; }
function paymentBadge(status) {
  const map = { paid: `<span class="badge badge-success">Paid</span>`, partial: `<span class="badge badge-warning">Partial</span>`, pending: `<span class="badge badge-danger">Pending</span>` };
  return map[status] || `<span class="badge badge-neutral">—</span>`;
}
function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Data Caches
let allEventsCache = [];

// Authentication Check BEFORE fetching data
onAuthStateChanged(auth, (user) => {
  if (user) {
    
    // 1. Events (Stats, Lists, Countdown, Revenue, and Calendar)
    onSnapshot(collection(db, "events"), (snapshot) => {
      allEventsCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      const todayStr = getTodayString();
      const currentMonthPrefix = todayStr.substring(0, 7); 
      
      const todayList = allEventsCache.filter(e => e.date === todayStr || e.status === "today");
      const upcomingList = allEventsCache.filter(e => {
        if (e.status === "Cancelled" || e.status === "Completed") return false;
        return (e.date && e.date > todayStr) || e.status === "upcoming";
      });
      upcomingList.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

      document.getElementById("stat-today").textContent = todayList.length;
      document.getElementById("stat-confirmed").textContent = allEventsCache.filter(e => (e.status || "").toLowerCase() === "confirmed").length;

      // Render Lists
      document.getElementById("today-events").innerHTML = todayList.length ? todayList.map(e => `
        <div class="row p-1.5 -mx-1.5">
          <div class="min-w-0"><p class="text-sm font-medium truncate">${e.eventName || e.client}</p><p class="text-xs text-gray-500 truncate">${e.type || e.eventType} · ${e.venue}</p></div>
          <div class="text-right shrink-0"><span class="text-xs font-medium text-gray-700 block">${e.startTime || e.time || "All Day"}</span></div>
        </div>`).join("") : emptyState("No events scheduled today.");

      document.getElementById("upcoming-events").innerHTML = upcomingList.length ? upcomingList.map(e => `
        <div class="row p-1.5 -mx-1.5">
          <div class="min-w-0"><p class="text-sm font-medium truncate">${e.eventName || e.client}</p><p class="text-xs text-gray-500 truncate">${e.type || e.eventType}</p></div>
          <div class="text-right shrink-0"><span class="text-xs font-medium text-gray-700 block">${e.date}</span></div>
        </div>`).join("") : emptyState("No upcoming events.");

      // Countdown Banner
      const banner = document.getElementById("next-event-banner");
      if (upcomingList.length > 0 || todayList.length > 0) {
        const nextEvent = todayList.length > 0 ? todayList[0] : upcomingList[0];
        banner.classList.remove("hidden");
        document.getElementById("next-event-title").textContent = nextEvent.eventName || nextEvent.client || "Untitled Event";
        
        if (todayList.includes(nextEvent)) {
          document.getElementById("next-event-countdown").textContent = "Today!";
          document.getElementById("next-event-countdown").classList.replace("text-white", "text-emerald-400");
          document.getElementById("next-event-subtext").textContent = "Get your gear ready";
        } else {
          const todayDate = new Date(todayStr);
          const nextDate = new Date(nextEvent.date);
          const diffDays = Math.ceil(Math.abs(nextDate - todayDate) / (1000 * 60 * 60 * 24));
          
          document.getElementById("next-event-countdown").textContent = diffDays;
          document.getElementById("next-event-countdown").classList.replace("text-emerald-400", "text-white");
          document.getElementById("next-event-subtext").textContent = diffDays === 1 ? "Day to go" : "Days to go";
        }
      } else {
        banner.classList.add("hidden");
      }

      // Expected Revenue
      const monthEvents = allEventsCache.filter(e => e.date && e.date.startsWith(currentMonthPrefix) && e.status !== "Cancelled");
      let expectedTotal = 0;
      let collectedTotal = 0;

      monthEvents.forEach(e => {
        const total = Number(e.totalAmount || 0);
        const advance = Number(e.advance || 0);
        expectedTotal += total;
        collectedTotal += (e.status === "Completed") ? total : advance;
      });

      document.getElementById("revenue-expected").textContent = `₹${expectedTotal.toLocaleString()}`;
      document.getElementById("revenue-collected").textContent = `₹${collectedTotal.toLocaleString()}`;
      
      let percentage = expectedTotal === 0 ? 0 : (collectedTotal / expectedTotal) * 100;
      setTimeout(() => { document.getElementById("revenue-progress").style.width = `${Math.min(percentage, 100)}%`; }, 300);

      // Re-render calendar if open
      if (!document.getElementById("modal-calendar").classList.contains("hidden")) {
        renderCalendar();
      }
    });

    // 2. Follow-ups
    onSnapshot(collection(db, "followups"), (snap) => {
      const docs = snap.docs.map(d => d.data());
      document.getElementById("stat-enquiries").textContent = docs.length;
      document.getElementById("followups").innerHTML = docs.length ? docs.map(f => `
        <div class="row"><p class="text-sm font-medium truncate">${f.client}</p><div class="text-right shrink-0"><p class="text-xs text-gray-700">${f.status}</p></div></div>
      `).join("") : emptyState("No follow-ups pending.");
    });

    // 3. Payments
    onSnapshot(collection(db, "payments"), (snap) => {
      const docs = snap.docs.map(d => d.data());
      document.getElementById("stat-payments").textContent = docs.filter(p => p.status !== "paid").length;
      document.getElementById("payments").innerHTML = docs.length ? docs.map(p => `
        <div class="row"><div class="min-w-0"><p class="text-sm font-medium truncate">${p.client}</p></div>${paymentBadge(p.status)}</div>
      `).join("") : emptyState("No records.");
    });

    // 4. Crew & Prod
    onSnapshot(collection(db, "crew"), (snap) => {
      const docs = snap.docs.map(d => d.data());
      document.getElementById("crew").innerHTML = docs.length ? docs.map(c => `<div class="row"><p class="text-sm font-medium">${c.name}</p><span class="text-xs text-gray-500">${c.status}</span></div>`).join("") : emptyState("No crew.");
    });

    onSnapshot(collection(db, "production"), (snap) => {
      const docs = snap.docs.map(d => d.data());
      document.getElementById("production").innerHTML = docs.length ? docs.map(p => `<div class="row"><p class="text-sm font-medium">${p.event}</p><span class="badge badge-neutral">${p.stage}</span></div>`).join("") : emptyState("No production.");
    });

  } else {
    window.location.href = "login.html";
  }
});


// ================= EVENT CALENDAR LOGIC =================
let calDate = new Date();
let currentMonth = calDate.getMonth();
let currentYear = calDate.getFullYear();

function renderCalendar() {
  const grid = document.getElementById("calendar-grid");
  const monthYearLabel = document.getElementById("cal-month-year");
  grid.innerHTML = "";

  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  monthYearLabel.textContent = `${monthNames[currentMonth]} ${currentYear}`;

  // Empty slots for previous month
  for (let i = 0; i < firstDay; i++) {
    grid.innerHTML += `<div class="p-1 border border-transparent"></div>`;
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Find events for this specific day
    const dayEvents = allEventsCache.filter(e => e.date === dateStr);

    let eventHtml = dayEvents.map(e => {
      // Gray for completed/cancelled, Black for Upcoming/Confirmed
      const isPast = (e.status === 'Completed' || e.status === 'Cancelled');
      const colorClass = isPast ? 'bg-gray-200 text-gray-700' : 'bg-black text-white shadow-sm';
      const label = e.eventName || e.clientName || "Event";
      
      return `
        <div class="text-[9px] sm:text-[10px] truncate px-1.5 py-0.5 rounded mt-1 font-medium ${colorClass}" title="${label}">
          ${label}
        </div>
      `;
    }).join('');

    const isToday = (dateStr === getTodayString());
    const bgClass = isToday ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-100 hover:bg-gray-100 transition-colors';
    const numColor = isToday ? 'text-blue-700' : 'text-gray-700';

    grid.innerHTML += `
      <div class="p-1 sm:p-2 border rounded-lg min-h-[60px] sm:min-h-[80px] flex flex-col ${bgClass}">
        <span class="font-bold text-xs ${numColor} block text-right">${day}</span>
        <div class="flex-1 overflow-y-auto custom-scrollbar mt-0.5 space-y-1">
          ${eventHtml}
        </div>
      </div>
    `;
  }
}

// Calendar Navigation
document.getElementById("btn-open-calendar").addEventListener("click", () => {
  // Reset to current actual month every time it opens
  calDate = new Date();
  currentMonth = calDate.getMonth();
  currentYear = calDate.getFullYear();
  renderCalendar();
  document.getElementById("modal-calendar").classList.remove("hidden");
});

document.querySelectorAll(".id-close-calendar").forEach(btn => btn.addEventListener("click", () => {
  document.getElementById("modal-calendar").classList.add("hidden");
}));

document.getElementById("cal-prev").addEventListener("click", () => {
  currentMonth--;
  if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  renderCalendar();
});

document.getElementById("cal-next").addEventListener("click", () => {
  currentMonth++;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  renderCalendar();
});