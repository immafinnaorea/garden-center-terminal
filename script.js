const SUPABASE_URL = "https://wumqksavoweqkmeemtwd.supabase.co";
const SUPABASE_KEY = "sb_publishable_age7Wf-S-brKlOi16lk-AQ_HLoxR3gR";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let allItems = [];
let selectedMood = "";
let currentVisitedFriend = null;
let currentVisitedItems = [];
let currentPrompt = "";
let projectImagesByProject = {};

const promptBank = {
  gentle: { label: "GENTLE / STABILITY", items: ["What needs water today?","What part of me is still growing?","What can I let be imperfect?","What root kept me steady today?"] },
  creative: { label: "CREATIVE WRITING", items: ["Describe a greenhouse that protects impossible plants.","Write about a tree that remembers everyone who sat beneath it.","Describe a town after rain.","Invent a character who keeps seeds in their coat pocket."] },
  memory: { label: "MEMORY", items: ["What memory has been taking root lately?","What photo would explain today?","What moment would I press between book pages?"] },
  future: { label: "FUTURE GROWTH", items: ["What am I planting for future me?","What would a good season look like?","What project deserves patience?"] },
  dream: { label: "DREAMLIKE", items: ["Write about a flower that only opens when nobody is watching.","Describe a dream as if it were a map.","What did the night leave behind?"] }
};
promptBank.all = { label: "ALL PROMPTS", items: Object.values(promptBank).flatMap(c => c.items) };

function esc(s = "") { return String(s).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }

function setStatus(status) {
  $("activeStatus").textContent = status;
}

function openSection(id) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active-section"));
  document.querySelectorAll(".nav").forEach(n => n.classList.remove("active"));
  $(id).classList.add("active-section");
  document.querySelector(`[data-section="${id}"]`).classList.add("active");

  const map = {
    garden: "🌱 planting...",
    watering: "💧 watering...",
    seeds: "🌱 saving seeds...",
    moonflowers: "🌙 dreaming...",
    trees: "🌳 tending trees...",
    greenhouse: "📖 writing...",
    chimes: "🎵 listening...",
    orchard: "🍎 building...",
    community: "👥 visiting...",
    settings: "⚙ adjusting..."
  };
  setStatus(map[id] || "🌱 idle");
}

document.querySelectorAll(".nav").forEach(b => b.addEventListener("click", () => openSection(b.dataset.section)));

document.querySelectorAll("textarea, input").forEach(el => {
  el.addEventListener("input", () => {
    if (currentUser) setStatus("✍️ typing...");
  });
});

document.querySelectorAll(".mood-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".mood-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedMood = btn.dataset.mood;
    $("selectedMoodText").textContent = selectedMood;
    setStatus("🌡️ setting mood...");
  });
});

async function signUp() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const username = $("authUsername").value.trim();

  if (!email || !password || !username) {
    $("authMessage").textContent = "Email, password, and username are required.";
    return;
  }

  const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { username } } });

  if (error) {
    $("authMessage").textContent = error.message;
    return;
  }
  $("authMessage").textContent = "Account created. Check your email if confirmation is required, then login.";
}

async function login() {
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    $("authMessage").textContent = error.message;
    return;
  }
  await loadSession();
}

async function logout() {
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  allItems = [];
  $("authScreen").classList.remove("hidden");
  $("appScreen").classList.add("hidden");
}

async function loadSession() {
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;

  if (!currentUser) {
    $("authScreen").classList.remove("hidden");
    $("appScreen").classList.add("hidden");
    return;
  }

  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  await loadProfile();
  await loadCloudItems();
  await loadFriends();
}


async function loadProfile() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.warn("Profile load error:", error.message);
    currentProfile = {
      username: currentUser.email.split("@")[0],
      display_name: currentUser.email.split("@")[0]
    };
  } else {
    currentProfile = data;
  }

  const username = currentProfile?.username || currentUser.email.split("@")[0];
  const displayName = currentProfile?.display_name || username;

  $("userHandle").textContent = "@" + username;
  $("profileUsername").value = username;
  $("profileDisplayName").value = displayName;
}

async function saveProfile() {
  const username = $("profileUsername").value.trim().replace(/^@/, "").toLowerCase();
  const displayName = $("profileDisplayName").value.trim() || username;

  if (!username) {
    $("profileMessage").textContent = "Username is required.";
    return;
  }

  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    $("profileMessage").textContent = "Use 3–24 lowercase letters, numbers, or underscores.";
    return;
  }

  const { error } = await supabaseClient
    .from("profiles")
    .update({ username, display_name: displayName })
    .eq("id", currentUser.id);

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      $("profileMessage").textContent = "That username is already taken.";
    } else {
      $("profileMessage").textContent = "Profile save error: " + error.message;
    }
    return;
  }

  $("profileMessage").textContent = "Profile saved. Your garden now shows @" + username + ".";
  await loadProfile();
}


async function loadProjectImages() {
  projectImagesByProject = {};

  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("project_images")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Project images unavailable:", error.message);
    return;
  }

  (data || []).forEach(img => {
    if (!projectImagesByProject[img.project_id]) {
      projectImagesByProject[img.project_id] = [];
    }
    projectImagesByProject[img.project_id].push(img);
  });
}

async function getProjectImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const { data, error } = await supabaseClient.storage
    .from("project-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.warn("Project signed URL error:", error.message);
    return null;
  }

  return data.signedUrl;
}

async function uploadProjectImage(projectId) {
  const fileInput = $(`projectImageFile_${projectId}`);
  const captionInput = $(`projectImageCaption_${projectId}`);

  if (!fileInput || !fileInput.files[0]) {
    alert("Choose an image first.");
    return;
  }

  const file = fileInput.files[0];
  const caption = captionInput ? captionInput.value.trim() : "";
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${currentUser.id}/${projectId}/${Date.now()}_${cleanName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("project-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    alert("Project image upload error: " + uploadError.message);
    return;
  }
  
const { data: newImage, error: insertError } = await supabaseClient
  .from("project_images")
  .insert({
    project_id: projectId,
    user_id: currentUser.id,
    image_path: filePath,
    caption
  })
  .select()
  .single();

if (insertError) {
  alert("Project image save error: " + insertError.message);
  return;
}



projectImagesByProject[projectId].unshift(newImage);
if (!projectImagesByProject[projectId]) {
  projectImagesByProject[projectId] = [];
}

projectImagesByProject[projectId].unshift(newImage);

  fileInput.value = "";
  if (captionInput) captionInput.value = "";

await loadProjectImages();
await renderAll();
setStatus("📎 project board file added");
}

async function deleteProjectImage(imageId) {
  const { error } = await supabaseClient
    .from("project_images")
    .delete()
    .eq("id", imageId);

  if (error) {
    alert("Project image delete error: " + error.message);
    return;
  }
await loadProjectImages();
await renderAll();

  
}


async function loadCloudItems() {
  const { data, error } = await supabaseClient.from("garden_items").select("*").order("created_at", { ascending: false });
  if (error) {
    alert("Load error: " + error.message);
    return;
  }
  allItems = data || [];
  await renderAll();
}

async function addCloudItem(item) {
  if (!currentUser) return alert("Please login first.");

  const { error } = await supabaseClient.from("garden_items").insert({
    user_id: currentUser.id,
    section: item.section,
    title: item.title || null,
    body: item.body || null,
    mood: item.mood || null,
    prompt: item.prompt || null,
    song: item.song || null,
    people: item.people || null,
    image_url: item.image_url || null,
    is_shared: !!item.is_shared
  });

  if (error) {
    alert("Save error: " + error.message);
    return;
  }
  await loadCloudItems();
}

async function deleteCloudItem(id) {
  const { error } = await supabaseClient.from("garden_items").delete().eq("id", id);
  if (error) {
    alert("Delete error: " + error.message);
    return;
  }
  await loadCloudItems();
}

async function toggleShare(id, currentValue) {
  const { error } = await supabaseClient.from("garden_items").update({ is_shared: !currentValue }).eq("id", id);
  if (error) {
    alert("Share update error: " + error.message);
    return;
  }
  await loadCloudItems();
}

function itemHTML(item) {
  const label = item.title || item.mood || item.section.toUpperCase();

  return `<div class="item universal-card" onclick="openMemoryViewer('${item.id}')">
    <div class="universal-card-header">
      <strong>${esc(label)}</strong>
      ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}
    </div>

    <p class="muted">${new Date(item.created_at).toLocaleString()}</p>

    ${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}
    ${item.image_url && item.section !== "trees" ? `<img src="${item.image_url}" alt="Uploaded image">` : ""}
    ${item.body ? `<p>${esc(item.body).replaceAll("\n","<br>")}</p>` : ""}
    ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
    ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}

    <div class="button-row" onclick="event.stopPropagation()">
      <button onclick="openMemoryViewer('${item.id}')">OPEN</button>
      <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
      <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
    </div>
  </div>`;
}

function renderSection(section, target, empty) {
  const items = allItems.filter(i => i.section === section);
  $(target).innerHTML = items.length ? items.map(itemHTML).join("") : `<p class="muted">${empty}</p>`;
}

function renderPublicMockFeed() {
  const feed = $("publicMockFeed");
  if (!feed) return;

  const shared = allItems.filter(i => i.is_shared);
  feed.innerHTML = shared.length
    ? shared.map(item => `<div class="item"><strong>@${esc(currentProfile?.username || "you")} shared ${esc(item.section)}</strong><p>${esc(item.title || item.mood || "Public item")}</p>${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}</div>`).join("")
    : "<p class='muted'>No public/shared items yet. Check share on a Seed, Tree, Moonflower, or Entry.</p>";
}



async function getTreeImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;

  const { data, error } = await supabaseClient.storage
    .from("tree-photos")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    console.warn("Signed URL error:", error.message);
    return null;
  }

  return data.signedUrl;
}

async function renderTrees() {
  const items = allItems.filter(i => i.section === "trees");

  if (!items.length) {
    $("treeList").innerHTML = "<p class='muted'>NO MEMORY TREES PLANTED YET.</p>";
    return;
  }

  const cards = await Promise.all(items.map(async item => {
    const imageUrl = await getTreeImageUrl(item.image_url);

    return `<div class="tree-card universal-card" onclick="openMemoryViewer('${item.id}')">
      <strong>${esc(item.title || "MEMORY TREE")}</strong>
      ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}
      <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
      ${imageUrl ? `<img class="tree-memory-photo" src="${imageUrl}" alt="Uploaded memory image" onclick="openMemoryViewer('${item.id}')">` : ""}
      ${item.body ? `<p>${esc(item.body).replaceAll("\n","<br>")}</p>` : ""}
      ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
      ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
      <button onclick="openMemoryViewer('${item.id}')">OPEN MEMORY</button>
      <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
      <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
    </div>`;
  }));

  $("treeList").innerHTML = cards.join("");
}



async function openMemoryViewer(id, source = "own") {
  const list = source === "visited" ? currentVisitedItems : allItems;
  const item = list.find(i => i.id === id);
  if (!item) return;

  let imageUrl = null;
  if (item.section === "trees") {
    imageUrl = await getTreeImageUrl(item.image_url);
  } else {
    imageUrl = item.image_url || null;
  }

  const viewer = $("memoryViewer");
  if (!viewer) {
    alert("Memory viewer HTML is missing.");
    return;
  }

  $("memoryViewerUser").textContent = source === "visited"
    ? "@" + (currentVisitedFriend?.username || "friend")
    : "@" + (currentProfile?.username || "you");

  $("memoryViewerTitle").textContent = item.title || item.mood || item.section.toUpperCase();
  $("memoryViewerDate").textContent = new Date(item.created_at).toLocaleString();

  $("memoryViewerImage").src = imageUrl || "";
  $("memoryViewerImage").style.display = imageUrl ? "block" : "none";

  const parsedProjectForViewer = item.section === "orchard" ? parseProjectBody(item.body) : null;

  $("memoryViewerText").innerHTML = item.section === "orchard"
    ? `
      <p class="muted">SECTION: ORCHARD PROJECT</p>
      <p><strong>STATUS:</strong> ${esc(parsedProjectForViewer.status)}</p>
      ${parsedProjectForViewer.due ? `<p><strong>DUE:</strong> ${esc(parsedProjectForViewer.due)}</p>` : ""}
      ${parsedProjectForViewer.overview ? `<p>${esc(parsedProjectForViewer.overview).replaceAll("\n","<br>")}</p>` : ""}
      <div class="milestone-box"><strong>MILESTONES</strong>${renderMilestones(parsedProjectForViewer)}</div>
      ${parsedProjectForViewer.notes ? `<p><strong>NOTES:</strong><br>${esc(parsedProjectForViewer.notes).replaceAll("\n","<br>")}</p>` : ""}
      <div><strong>REFERENCE BOARD</strong>${await renderProjectBoard(item, parsedProjectForViewer)}</div>
    `
    : `
      <p class="muted">SECTION: ${esc(item.section.toUpperCase())}</p>
      ${item.mood ? `<p><strong>MOOD:</strong> ${esc(item.mood)}</p>` : ""}
      ${item.prompt ? `<p><strong>PROMPT:</strong><br><em>${esc(item.prompt)}</em></p>` : ""}
      ${item.body ? `<p>${esc(item.body).replaceAll("\n","<br>")}</p>` : ""}
      ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
      ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
    `;

  viewer.classList.remove("hidden");
}

function closeMemoryViewer() {
  const viewer = $("memoryViewer");
  if (viewer) viewer.classList.add("hidden");
}

function makeMemoryViewerDraggable() {
  const viewer = $("memoryViewer");
  const header = $("memoryViewerHeader");

  if (!viewer || !header) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.addEventListener("mousedown", e => {
    if (e.target.tagName.toLowerCase() === "button") return;

    dragging = true;
    const rect = viewer.getBoundingClientRect();

    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;

    viewer.style.left = startLeft + "px";
    viewer.style.top = startTop + "px";
    viewer.style.right = "auto";
    viewer.style.bottom = "auto";

    document.body.style.userSelect = "none";
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    viewer.style.left = startLeft + (e.clientX - startX) + "px";
    viewer.style.top = startTop + (e.clientY - startY) + "px";
  });

  document.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.userSelect = "";
  });
}


function parseProjectBody(body = "") {
  const project = {
    status: "Seeded",
    due: "",
    overview: "",
    milestones: [],
    notes: "",
    board: []
  };

  const text = String(body || "");

  const statusMatch = text.match(/\[STATUS\]\n([\s\S]*?)(?=\n\[|$)/);
  const dueMatch = text.match(/\[DUE\]\n([\s\S]*?)(?=\n\[|$)/);
  const overviewMatch = text.match(/\[OVERVIEW\]\n([\s\S]*?)(?=\n\[|$)/);
  const milestonesMatch = text.match(/\[MILESTONES\]\n([\s\S]*?)(?=\n\[|$)/);
  const notesMatch = text.match(/\[NOTES\]\n([\s\S]*?)(?=\n\[|$)/);
  const boardMatch = text.match(/\[BOARD\]\n([\s\S]*?)(?=\n\[|$)/);

  if (statusMatch) project.status = statusMatch[1].trim() || "Seeded";
  if (dueMatch) project.due = dueMatch[1].trim();
  if (overviewMatch) project.overview = overviewMatch[1].trim();
  if (notesMatch) project.notes = notesMatch[1].trim();
  if (boardMatch) {
    project.board = boardMatch[1]
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean);
  }

  if (milestonesMatch) {
    project.milestones = milestonesMatch[1]
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const done = /^(x|\[x\]|✅|done:)/i.test(line);
        const label = line.replace(/^(x|\[x\]|✅|done:|-|\[ \]|☐)\s*/i, "").trim();
        return { done, label };
      });
  }

  if (!statusMatch && !overviewMatch && !milestonesMatch && !notesMatch) {
    project.overview = text;
  }

  return project;
}

function formatProjectBody(status, due, overview, milestones, notes, board) {
  return `[STATUS]
${status || "Seeded"}

[DUE]
${due || ""}

[OVERVIEW]
${overview || ""}

[MILESTONES]
${milestones || ""}

[NOTES]
${notes || ""}

[BOARD]
${board || ""}`;
}

function projectProgress(project) {
  if (!project.milestones.length) return 0;
  const done = project.milestones.filter(m => m.done).length;
  return Math.round((done / project.milestones.length) * 100);
}

let orchardFilter = "all";

async function setOrchardFilter(status) {
  orchardFilter = status;
  await renderOrchard();
}

function renderMilestones(project) {
  if (!project.milestones.length) {
    return "<p class='muted'>No milestones yet.</p>";
  }

  return `<ul class="milestone-list">
    ${project.milestones.map(m => `<li class="${m.done ? "done" : ""}">
      <span>${m.done ? "✓" : "☐"}</span>
      <span>${esc(m.label)}</span>
    </li>`).join("")}
  </ul>`;
}


async function renderProjectBoard(item, project) {
  const savedImages = projectImagesByProject[item.id] || [];

  const savedCards = await Promise.all(savedImages.map(async img => {
  const url = await getProjectImageUrl(img.image_path);

  const isPreviewImage = /\.(png|jpg|jpeg|gif|webp)$/i.test(img.image_path);
  const isPdf = /\.pdf$/i.test(img.image_path);

return `<div class="project-board-card image-card">
  ${url && isPreviewImage
    ? `<img src="${url}" alt="Project board image">`
    : url && isPdf
? `<a class="project-file-card pdf-preview-card" href="${url}" target="_blank">
    <iframe src="${url}#page=1&zoom=45" loading="lazy"></iframe>
    <span>📄 OPEN PDF</span>
  </a>`      : url
        ? `<a class="project-file-card" href="${url}" target="_blank">📎 OPEN FILE</a>`
        : `<p class="muted">File unavailable</p>`
  }
  ${img.caption ? `<p>${esc(img.caption)}</p>` : ""}
      <button class="tiny-button" onclick="deleteProjectImage('${img.id}')">REMOVE</button>
    </div>`;
  }));

  const textCards = (project.board || []).map(line => {
    const isImage = /^https?:\/\/.*\.(png|jpg|jpeg|gif|webp)(\?.*)?$/i.test(line);
    return `<div class="project-board-card">
      ${isImage ? `<img src="${esc(line)}" alt="Project reference image">` : `<p>${esc(line)}</p>`}
    </div>`;
  });

  const uploadControls = `<div class="project-board-uploader">
   <input id="projectImageFile_${item.id}" type="file" accept="image/*,.pdf,application/pdf,.heic,.heif">
    <input id="projectImageCaption_${item.id}" placeholder="Caption / reference note...">
    <button onclick="uploadProjectImage('${item.id}')">ADD IMAGE TO BOARD</button>
  </div>`;

  const cards = [...savedCards, ...textCards].join("");

  return `${uploadControls}<div class="project-board-grid">${cards || "<p class='muted'>No reference board items yet.</p>"}</div>`;
}

function formatCalendarDate(date) {
  return date.toISOString().slice(0, 10);
}

function renderSidebarPlanner() {
  const calendar = $("sidebarCalendar");
  const upcoming = $("sidebarUpcoming");
  const range = $("plannerRange");
  if (!calendar || !upcoming) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const projects = allItems
    .filter(i => i.section === "orchard")
    .map(item => ({ item, project: parseProjectBody(item.body) }))
    .filter(p => p.project.due);

  const days = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const key = formatCalendarDate(d);
    days.push({
      date: d,
      key,
      dueProjects: projects.filter(p => p.project.due === key)
    });
  }

  if (range) {
    const end = new Date(today);
    end.setDate(today.getDate() + 29);
    range.textContent = `${today.toLocaleDateString()} → ${end.toLocaleDateString()}`;
  }

  calendar.innerHTML = days.map(day => {
    const isToday = day.key === formatCalendarDate(today);
    const hasDue = day.dueProjects.length > 0;
    return `<button class="sidebar-day ${isToday ? "today" : ""} ${hasDue ? "has-due" : ""}" title="${esc(day.key)}">
      <span>${day.date.getDate()}</span>
      ${hasDue ? `<em>${day.dueProjects.length}</em>` : ""}
    </button>`;
  }).join("");

  const upcomingProjects = projects
    .filter(p => p.project.due >= formatCalendarDate(today))
    .sort((a, b) => a.project.due.localeCompare(b.project.due))
    .slice(0, 6);

  upcoming.innerHTML = upcomingProjects.length
    ? upcomingProjects.map(p => `<div class="upcoming-item">
        <span>${esc(p.project.due)}</span>
        <button onclick="openMemoryViewer('${p.item.id}')">${esc(p.item.title || "Project")}</button>
      </div>`).join("")
    : "<p class='muted'>No dated projects yet.</p>";
}

async function renderOrchard() {
  renderSidebarPlanner();

  const allProjects = allItems.filter(i => i.section === "orchard");
  const projects = orchardFilter === "all"
    ? allProjects
    : allProjects.filter(item => parseProjectBody(item.body).status === orchardFilter);

  const stats = $("orchardStats");
  if (stats) {
    stats.textContent = `PROJECTS: ${allProjects.length} // ACTIVE: ${allProjects.filter(i => parseProjectBody(i.body).status !== "Finished").length}`;
  }

  document.querySelectorAll(".orchard-filter").forEach(btn => {
    btn.classList.toggle("active-filter", btn.dataset.status === orchardFilter);
  });

  const target = $("projectList");
  if (!target) return;

  if (!projects.length) {
    target.innerHTML = "<p class='muted'>NO PROJECT TREES YET.</p>";
    return;
  }

  const projectCards = await Promise.all(projects.map(async item => {
    const project = parseProjectBody(item.body);
    const progress = projectProgress(project);

    return `<div class="orchard-card">
      <div class="orchard-card-header">
        <strong>${esc(item.title || "PROJECT TREE")}</strong>
        <span class="status-chip status-${esc(project.status).toLowerCase()}">${esc(project.status)}</span>
      </div>

      <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
      ${project.due ? `<p class="muted">TARGET: ${esc(project.due)}</p>` : ""}

      <div class="progress-wrap">
        <div class="progress-label">PROJECT COMPLETION // ${progress}%</div>
        <div class="progress-bar"><span style="width:${progress}%"></span></div>
      </div>

      ${project.overview ? `<p>${esc(project.overview).replaceAll("\\n", "<br>")}</p>` : ""}

      <div class="milestone-box">
        <strong>MILESTONES</strong>
        ${renderMilestones(project)}
      </div>

      ${project.notes ? `<details><summary>WORKSHOP NOTES</summary><p>${esc(project.notes).replaceAll("\\n", "<br>")}</p></details>` : ""}

      <details>
        <summary>REFERENCE BOARD</summary>
        ${await renderProjectBoard(item, project)}
      </details>

      ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}

      <div class="button-row" onclick="event.stopPropagation()">
        <button onclick="openMemoryViewer('${item.id}')">OPEN PROJECT</button>
        <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
        <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
      </div>
    </div>`;
  }));

  target.innerHTML = projectCards.join("");
}

async function renderAll() {
  renderSection("garden", "gardenEntries", "NO GARDEN ENTRIES YET.");
  renderSection("prompt_vault", "promptVault", "NO SAVED PROMPTS.");
  renderSection("seeds", "seedBank", "NO SEEDS SAVED YET.");
  renderSection("moonflowers", "dreamList", "NO DREAMS SAVED YET.");

  await renderTrees();

  renderSection("greenhouse", "greenhouseList", "GREENHOUSE IS EMPTY.");
  renderSection("chimes", "songList", "NO WIND CHIMES YET.");
  await renderOrchard();
  renderPublicMockFeed();
}


function newPrompt() {
  const c = promptBank[$("promptType").value];
  $("promptLabel").textContent = c.label;
  $("promptText").textContent = c.items[Math.floor(Math.random() * c.items.length)];
  currentPrompt = $("promptText").textContent;
  $("sidebarPrompt").innerHTML = `<em>${esc(currentPrompt)}</em>`;
  setStatus("💧 watering prompt...");
}

function usePrompt(prompt, category) {
  $("promptLabel").textContent = category;
  $("promptText").textContent = prompt;
  currentPrompt = prompt;
  $("sidebarPrompt").innerHTML = `<em>${esc(currentPrompt)}</em>`;
  openSection("garden");
  $("gardenEntry").value = prompt + "\n\n";
  $("gardenEntry").focus();
}
async function searchFriend() {
  const term = $("friendSearchInput")?.value.trim().replace(/^@/, "").toLowerCase();

  if (!term) {
    $("friendSearchResults").innerHTML = "<p class='muted'>Type a username first.</p>";
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, username, display_name")
    .ilike("username", `%${term}%`)
    .neq("id", currentUser.id)
    .limit(10);

  if (error) {
    $("friendSearchResults").innerHTML = `<p class='muted'>Search error: ${esc(error.message)}</p>`;
    return;
  }

  $("friendSearchResults").innerHTML = data?.length
    ? data.map(p => `
      <div class="search-result">
        <strong>@${esc(p.username)}</strong>
        <p class="muted">${esc(p.display_name || p.username)}</p>
        <button onclick="visitGarden('${p.id}', '${esc(p.username)}')">VISIT GARDEN</button>
      </div>
    `).join("")
    : "<p class='muted'>No gardeners found.</p>";
}

async function loadFriends() {
  if (!currentUser) return;

  const sidebar = $("sidebarFriendsList");
  const realList = $("realFriendsList");
  const requests = $("friendRequestsList");

  const { data, error } = await supabaseClient
    .from("friends")
    .select("*")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Friend load error:", error.message);
    if (sidebar) sidebar.innerHTML = "<p class='muted'>Friend load error.</p>";
    if (realList) realList.innerHTML = "<p class='muted'>Friend load error.</p>";
    return;
  }

  const rows = data || [];
  const accepted = rows.filter(r => r.status === "accepted");
  const pendingIncoming = rows.filter(r => r.status === "pending" && r.receiver_id === currentUser.id);

  const friendIds = [...new Set(
    accepted.map(r => r.sender_id === currentUser.id ? r.receiver_id : r.sender_id)
  )];

  let profiles = [];
  if (friendIds.length || pendingIncoming.length) {
    const ids = [...new Set([
      ...friendIds,
      ...pendingIncoming.map(r => r.sender_id)
    ])];

    const res = await supabaseClient
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);

    profiles = res.data || [];
  }

  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));

  const friendHTML = accepted.length
    ? accepted.map(r => {
        const friendId = r.sender_id === currentUser.id ? r.receiver_id : r.sender_id;
        const p = profileById[friendId];

        return `<div class="friend-row">
          <strong>@${esc(p?.username || "unknown")}</strong>
          <button onclick="visitGarden('${friendId}', '${esc(p?.username || "unknown")}')">VISIT</button>
        </div>`;
      }).join("")
    : "<p class='muted'>No friends loaded yet.</p>";

  if (sidebar) sidebar.innerHTML = friendHTML;
  if (realList) realList.innerHTML = friendHTML;

  if (requests) {
    requests.innerHTML = pendingIncoming.length
      ? pendingIncoming.map(r => {
          const p = profileById[r.sender_id];

          return `<div class="request-card">
            <strong>@${esc(p?.username || "unknown")}</strong>
            <button onclick="respondFriendRequest('${r.id}', 'accepted')">ACCEPT</button>
            <button onclick="deleteFriendship('${r.id}')">DECLINE</button>
          </div>`;
        }).join("")
      : "<p class='muted'>No pending requests.</p>";
  }
}
$("signupBtn").addEventListener("click", signUp);
$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", logout);
$("saveProfileBtn").addEventListener("click", saveProfile);
$("searchFriendBtn").addEventListener("click", searchFriend);

$("saveGardenEntry").onclick = () => {
  const body = $("gardenEntry").value.trim();
  if (!body) return alert("Write something first.");
  addCloudItem({ section: "garden", mood: selectedMood || "None", body, title: selectedMood || "Garden Entry", is_shared: $("shareGardenEntry").checked });
  $("gardenEntry").value = "";
  $("gardenHelped").value = "";
  $("shareGardenEntry").checked = false;
  selectedMood = "";
  $("selectedMoodText").textContent = "None";
  document.querySelectorAll(".mood-btn").forEach(b => b.classList.remove("selected"));
};

$("newPrompt").onclick = newPrompt;
$("promptType").onchange = newPrompt;
$("savePrompt").onclick = () => addCloudItem({ section: "prompt_vault", title: $("promptLabel").textContent, prompt: $("promptText").textContent, is_shared: false });
$("sendPromptToGarden").onclick = () => usePrompt($("promptText").textContent, $("promptLabel").textContent);

$("saveSeed").onclick = () => { const body = $("seedText").value.trim(); if (!body) return alert("Drop a seed first."); addCloudItem({ section: "seeds", title: "SEED", body, is_shared: $("shareSeed").checked }); $("seedText").value = ""; $("shareSeed").checked = false; };
$("saveDream").onclick = () => { const body = $("dreamText").value.trim(); if (!body) return alert("Write the dream first."); addCloudItem({ section: "moonflowers", title: $("dreamTitle").value.trim() || "MOONFLOWER", body, is_shared: $("shareDream").checked }); $("dreamTitle").value = ""; $("dreamText").value = ""; $("shareDream").checked = false; };

async function uploadTreePhoto(file) {
  if (!file) return null;

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${currentUser.id}/${Date.now()}_${cleanName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("tree-photos")
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false
    });

  if (uploadError) {
    throw uploadError;
  }

  return filePath;
}

$("saveTree").onclick = async () => {
  const body = $("treeMemory").value.trim();
  const title = $("treeTitle").value.trim() || "MEMORY TREE";
  const file = $("treePhoto").files[0];

  if (!body && !title && !file) return alert("Plant something first.");

  try {
    $("treeUploadStatus").textContent = file ? "Uploading photo..." : "Saving tree...";
    const imageUrl = file ? await uploadTreePhoto(file) : null;

    await addCloudItem({
      section: "trees",
      title,
      body,
      song: $("treeSong").value.trim(),
      people: $("treePeople").value.trim(),
      image_url: imageUrl,
      is_shared: $("shareTree").checked
    });

    $("treeTitle").value = "";
    $("treeMemory").value = "";
    $("treePhoto").value = "";
    $("treeSong").value = "";
    $("treePeople").value = "";
    $("shareTree").checked = false;
    $("treeUploadStatus").textContent = "Tree planted.";
  } catch (error) {
    $("treeUploadStatus").textContent = "Tree upload error: " + error.message;
  }
};
$("saveGreenhouse").onclick = () => { const body = $("greenText").value.trim(); if (!body) return alert("Write something first."); addCloudItem({ section: "greenhouse", title: $("greenTitle").value.trim() || "GREENHOUSE PIECE", body, is_shared: $("shareGreenhouse").checked }); $("greenTitle").value = ""; $("greenText").value = ""; $("shareGreenhouse").checked = false; };
$("saveSong").onclick = () => { const title = $("songTitle").value.trim(); if (!title) return alert("Add a song title first."); addCloudItem({ section: "chimes", title, body: $("songArtist").value.trim() + "\n" + $("songVibe").value.trim(), is_shared: $("shareSong").checked }); $("songTitle").value = ""; $("songArtist").value = ""; $("songVibe").value = ""; $("shareSong").checked = false; };
$("saveProject").onclick = () => {
  const title = $("projectTitle").value.trim() || "PROJECT TREE";
  const status = $("projectStatus").value;
  const due = $("projectDueDate").value;
  const overview = $("projectText").value.trim();
  const milestones = $("projectMilestones").value.trim();
  const notes = $("projectNotes").value.trim();
  const board = $("projectBoard").value.trim();

  if (!title && !overview && !milestones && !notes && !board) {
    alert("Plant something first.");
    return;
  }

  const body = formatProjectBody(status, due, overview, milestones, notes, board);

  addCloudItem({
    section: "orchard",
    title,
    body,
    is_shared: $("shareProject").checked
  });

  $("projectTitle").value = "";
  $("projectStatus").value = "Seeded";
  $("projectDueDate").value = "";
  $("projectText").value = "";
  $("projectMilestones").value = "";
  $("projectNotes").value = "";
  $("projectBoard").value = "";
  $("shareProject").checked = false;
};
$("themeColor").oninput = () => $("hexColor").value = $("themeColor").value;
$("applyTheme").onclick = () => {
  const color = $("hexColor").value.trim() || $("themeColor").value;

  document.documentElement.style.setProperty("--text", color);
  document.documentElement.style.setProperty("--line", color);
  document.documentElement.style.setProperty("--muted", color + "99");

  localStorage.setItem("gt_theme", color);
  setStatus("🎨 theme applied");
};
$("resetTheme").onclick = () => { localStorage.removeItem("gt_theme"); location.reload(); };

function updateClock() { $("clock").textContent = new Date().toLocaleString(); }
const savedTheme = localStorage.getItem("gt_theme");
if (savedTheme) {
  document.documentElement.style.setProperty("--text", savedTheme);
  document.documentElement.style.setProperty("--line", savedTheme);
  document.documentElement.style.setProperty("--muted", savedTheme + "99");
  $("themeColor").value = savedTheme;
  $("hexColor").value = savedTheme;
}


document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    closeMemoryViewer();
  }
});

makeMemoryViewerDraggable();
setupMooseSoundControls();
newPrompt();
updateClock();
setInterval(updateClock, 1000);
loadSession();


/* ===== V7.1 MOOSE GRAZE SOUND ===== */
let mooseCrunchEnabled = true;
let mooseCrunchTimer = null;

function playMooseCrunch() {
  if (!mooseCrunchEnabled) return;

  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;

    // Crunch layer: short noisy burst
    const bufferSize = ctx.sampleRate * 0.16;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      const decay = 1 - i / bufferSize;
      output[i] = (Math.random() * 2 - 1) * decay * decay;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(950, now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.17);

    // Low thunk layer, like a tiny 8-bit wall chip
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    oscGain.gain.setValueAtTime(0.035, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  } catch (e) {
    console.warn("Moose crunch audio skipped:", e.message);
  }
}


function setupMooseSoundControls() {
  const toggle = $("enableMooseSound");
  const test = $("testMooseSound");

  if (toggle) {
    const saved = localStorage.getItem("moose_crunch_enabled");
    if (saved !== null) {
      mooseCrunchEnabled = saved === "true";
      toggle.checked = mooseCrunchEnabled;
    }

    toggle.addEventListener("change", () => {
      mooseCrunchEnabled = toggle.checked;
      localStorage.setItem("moose_crunch_enabled", String(mooseCrunchEnabled));
    });
  }

  if (test) {
    test.addEventListener("click", playMooseCrunch);
  }
}


function startMooseCrunchLoop() {
  if (mooseCrunchTimer) return;
  mooseCrunchTimer = setInterval(playMooseCrunch, 2600);
}

document.addEventListener("keydown", e => {
  if (e.key.toLowerCase() === "m") {
    mooseCrunchEnabled = !mooseCrunchEnabled;
  }
});

document.addEventListener("click", () => {
  startMooseCrunchLoop();
}, { once: true });
