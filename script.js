const SUPABASE_URL = "https://wumqksavoweqkmeemtwd.supabase.co";
const SUPABASE_KEY = "sb_publishable_age7Wf-S-brKlOi16lk-AQ_HLoxR3gR";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
let currentUser = null;
let allItems = [];
let selectedMood = "";
let currentPrompt = "";

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

  $("userEmail").textContent = currentUser.email;
  $("authScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");
  await loadCloudItems();
}

async function loadCloudItems() {
  const { data, error } = await supabaseClient.from("garden_items").select("*").order("created_at", { ascending: false });
  if (error) {
    alert("Load error: " + error.message);
    return;
  }
  allItems = data || [];
  renderAll();
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
  return `<div class="item">
    <strong>${esc(item.title || item.mood || item.section.toUpperCase())}</strong>
    ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}
    <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
    ${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}
    ${item.body ? `<p>${esc(item.body).replaceAll("\n","<br>")}</p>` : ""}
    ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
    ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
    <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
    <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
  </div>`;
}

function renderSection(section, target, empty) {
  const items = allItems.filter(i => i.section === section);
  $(target).innerHTML = items.length ? items.map(itemHTML).join("") : `<p class="muted">${empty}</p>`;
}

function renderPublicMockFeed() {
  const shared = allItems.filter(i => i.is_shared);
  $("publicMockFeed").innerHTML = shared.length
    ? shared.map(item => `<div class="item"><strong>@you shared ${esc(item.section)}</strong><p>${esc(item.title || item.mood || "Public item")}</p>${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}</div>`).join("")
    : "<p class='muted'>No public/shared items yet. Check share on a Seed, Tree, Moonflower, or Entry.</p>";
}

function renderAll() {
  renderSection("garden", "gardenEntries", "NO GARDEN ENTRIES YET.");
  renderSection("prompt_vault", "promptVault", "NO SAVED PROMPTS.");
  renderSection("seeds", "seedBank", "NO SEEDS SAVED YET.");
  renderSection("moonflowers", "dreamList", "NO DREAMS SAVED YET.");
  renderSection("trees", "treeList", "NO MEMORY TREES PLANTED YET.");
  renderSection("greenhouse", "greenhouseList", "GREENHOUSE IS EMPTY.");
  renderSection("chimes", "songList", "NO WIND CHIMES YET.");
  renderSection("orchard", "projectList", "NO PROJECT TREES YET.");
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

$("signupBtn").addEventListener("click", signUp);
$("loginBtn").addEventListener("click", login);
$("logoutBtn").addEventListener("click", logout);

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
$("saveTree").onclick = () => { const body = $("treeMemory").value.trim(); const title = $("treeTitle").value.trim() || "MEMORY TREE"; if (!body && !title) return alert("Plant something first."); addCloudItem({ section: "trees", title, body, song: $("treeSong").value.trim(), people: $("treePeople").value.trim(), is_shared: $("shareTree").checked }); $("treeTitle").value = ""; $("treeMemory").value = ""; $("treeSong").value = ""; $("treePeople").value = ""; $("shareTree").checked = false; };
$("saveGreenhouse").onclick = () => { const body = $("greenText").value.trim(); if (!body) return alert("Write something first."); addCloudItem({ section: "greenhouse", title: $("greenTitle").value.trim() || "GREENHOUSE PIECE", body, is_shared: $("shareGreenhouse").checked }); $("greenTitle").value = ""; $("greenText").value = ""; $("shareGreenhouse").checked = false; };
$("saveSong").onclick = () => { const title = $("songTitle").value.trim(); if (!title) return alert("Add a song title first."); addCloudItem({ section: "chimes", title, body: $("songArtist").value.trim() + "\n" + $("songVibe").value.trim(), is_shared: $("shareSong").checked }); $("songTitle").value = ""; $("songArtist").value = ""; $("songVibe").value = ""; $("shareSong").checked = false; };
$("saveProject").onclick = () => { const body = $("projectText").value.trim(); const title = $("projectTitle").value.trim() || "PROJECT TREE"; if (!body && !title) return alert("Plant something first."); addCloudItem({ section: "orchard", title, body, is_shared: $("shareProject").checked }); $("projectTitle").value = ""; $("projectText").value = ""; $("shareProject").checked = false; };

$("applyTheme").onclick = () => {
  const color = $("hexColor").value.trim() || $("themeColor").value;
  document.documentElement.style.setProperty("--text", color);
  document.documentElement.style.setProperty("--line", color);
  document.documentElement.style.setProperty("--muted", color + "99");
  localStorage.setItem("gt_theme", color);
};
$("themeColor").oninput = () => $("hexColor").value = $("themeColor").value;
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

newPrompt();
updateClock();
setInterval(updateClock, 1000);
loadSession();
