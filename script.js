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
    ${item.image_url ? `<img src="${item.image_url}" alt="Uploaded memory image">` : ""}
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
  const feed = $("publicMockFeed");
  if (!feed) return;

  const shared = allItems.filter(i => i.is_shared);
  feed.innerHTML = shared.length
    ? shared.map(item => `<div class="item"><strong>@${esc(currentProfile?.username || "you")} shared ${esc(item.section)}</strong><p>${esc(item.title || item.mood || "Public item")}</p>${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}</div>`).join("")
    : "<p class='muted'>No public/shared items yet. Check share on a Seed, Tree, Moonflower, or Entry.</p>";
}


async function renderTrees() {
  const items = allItems.filter(i => i.section === "trees");

  if (!items.length) {
    $("treeList").innerHTML = "<p class='muted'>NO MEMORY TREES PLANTED YET.</p>";
    return;
  }

  const cards = await Promise.all(items.map(async item => {
    const imageUrl = await getTreeImageUrl(item.image_url);

    return `<div class="tree-card">
      <strong>${esc(item.title || "MEMORY TREE")}</strong>
      ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}
      <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
${imageUrl ? `<img class="tree-memory-photo" src="${imageUrl}" alt="Uploaded memory image" onclick="openMemoryViewer('${item.id}')">` : ""}      ${item.body ? `<p>${esc(item.body).replaceAll("\\n","<br>")}</p>` : ""}
      ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
      ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
      <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
      <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
    </div>`;
  }));

  $("treeList").innerHTML = cards.join("");
}

async function openMemoryViewer(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  const imageUrl = await getTreeImageUrl(item.image_url);

  $("memoryViewerUser").textContent = "@" + (currentProfile?.username || "you");
  $("memoryViewerTitle").textContent = item.title || "MEMORY TREE";
  $("memoryViewerDate").textContent = new Date(item.created_at).toLocaleString();

  $("memoryViewerImage").src = imageUrl || "";
  $("memoryViewerImage").style.display = imageUrl ? "block" : "none";

  $("memoryViewerText").innerHTML = `
    ${item.body ? `<p>${esc(item.body).replaceAll("\\n","<br>")}</p>` : ""}
    ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
    ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
  `;

  $("memoryViewer").classList.remove("hidden");
}

function closeMemoryViewer() {
  $("memoryViewer").classList.add("hidden");
}

                    
    return `<div class="tree-card">
      <strong>${esc(item.title || "MEMORY TREE")}</strong>
      ${item.is_shared ? `<span class="shared-badge">PUBLIC</span>` : `<span class="shared-badge">PRIVATE</span>`}
      <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
      ${imageUrl ? `<img src="${imageUrl}" alt="Uploaded memory image">` : ""}
      ${item.body ? `<p>${esc(item.body).replaceAll("\\n","<br>")}</p>` : ""}
      ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
      ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
      <button onclick="toggleShare('${item.id}', ${item.is_shared})">${item.is_shared ? "MAKE PRIVATE" : "SHARE"}</button>
      <button onclick="deleteCloudItem('${item.id}')">REMOVE</button>
    </div>`;
  }));

  $("treeList").innerHTML = cards.join("");
}

async function renderAll() {
  renderSection("garden", "gardenEntries", "NO GARDEN ENTRIES YET.");
  renderSection("prompt_vault", "promptVault", "NO SAVED PROMPTS.");
  renderSection("seeds", "seedBank", "NO SEEDS SAVED YET.");
  renderSection("moonflowers", "dreamList", "NO DREAMS SAVED YET.");

  await renderTrees();

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
$("saveProject").onclick = () => { const body = $("projectText").value.trim(); const title = $("projectTitle").value.trim() || "PROJECT TREE"; if (!body && !title) return alert("Plant something first."); addCloudItem({ section: "orchard", title, body, is_shared: $("shareProject").checked }); $("projectTitle").value = ""; $("projectText").value = ""; $("shareProject").checked = false; };



async function searchFriend() {
  const term = $("friendSearchInput").value.trim().replace(/^@/, "").toLowerCase();
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

  if (!data || !data.length) {
    $("friendSearchResults").innerHTML = "<p class='muted'>No gardeners found.</p>";
    return;
  }

  $("friendSearchResults").innerHTML = data.map(p => `
    <div class="search-result">
      <strong>@${esc(p.username)}</strong>
      <p class="muted">${esc(p.display_name || p.username)}</p>
      <button class="secondary" onclick="sendFriendRequest('${p.id}')">🌱 PLANT FRIENDSHIP</button>
      <button class="secondary" onclick="visitGarden('${p.id}', '${esc(p.username)}')">VISIT PUBLIC GARDEN</button>
    </div>
  `).join("");
}

async function sendFriendRequest(receiverId) {
  const { error } = await supabaseClient
    .from("friends")
    .insert({ sender_id: currentUser.id, receiver_id: receiverId, status: "pending" });

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      alert("Friendship already planted or pending.");
    } else {
      alert("Friend request error: " + error.message);
    }
    return;
  }

  alert("Friendship seed planted.");
  await loadFriends();
}

async function loadFriends() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("friends")
    .select("*")
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Friend load error:", error.message);
    return;
  }

  const rows = data || [];
  const ids = [...new Set(rows.flatMap(r => [r.sender_id, r.receiver_id]).filter(id => id !== currentUser.id))];

  let profiles = [];
  if (ids.length) {
    const res = await supabaseClient
      .from("profiles")
      .select("id, username, display_name")
      .in("id", ids);
    profiles = res.data || [];
  }

  const profileById = Object.fromEntries(profiles.map(p => [p.id, p]));
  const pendingIncoming = rows.filter(r => r.status === "pending" && r.receiver_id === currentUser.id);
  const accepted = rows.filter(r => r.status === "accepted");

  $("friendRequestsList").innerHTML = pendingIncoming.length
    ? pendingIncoming.map(r => {
        const p = profileById[r.sender_id];
        return `<div class="request-card">
          <strong>@${esc(p?.username || "unknown")}</strong>
          <p class="muted">wants to plant a friendship.</p>
          <button class="primary" onclick="respondFriendRequest('${r.id}', 'accepted')">ACCEPT</button>
          <button class="secondary" onclick="deleteFriendship('${r.id}')">DECLINE</button>
        </div>`;
      }).join("")
    : "<p class='muted'>No pending friendship requests.</p>";

  $("realFriendsList").innerHTML = accepted.length
    ? accepted.map(r => {
        const friendId = r.sender_id === currentUser.id ? r.receiver_id : r.sender_id;
        const p = profileById[friendId];
        return `<div class="friend-row">
          <strong onclick="visitGarden('${friendId}', '${esc(p?.username || "unknown")}')">@${esc(p?.username || "unknown")}</strong>
          <button class="secondary" onclick="visitGarden('${friendId}', '${esc(p?.username || "unknown")}')">VISIT GARDEN</button>
          <button class="secondary" onclick="deleteFriendship('${r.id}')">REMOVE</button>
        </div>`;
      }).join("")
    : "<p class='muted'>No accepted friends yet.</p>";

  const sidebar = $("sidebarFriendsList");
  if (sidebar) {
    sidebar.innerHTML = accepted.length
      ? accepted.map(r => {
          const friendId = r.sender_id === currentUser.id ? r.receiver_id : r.sender_id;
          const p = profileById[friendId];
          return `<p><button class="sidebar-friend-button" onclick="visitGarden('${friendId}', '${esc(p?.username || "unknown")}')">🌱 @${esc(p?.username || "unknown")}</button></p>`;
        }).join("")
      : "<p class='muted'>No friends yet.</p>";
  }
}

async function respondFriendRequest(friendshipId, status) {
  const { error } = await supabaseClient
    .from("friends")
    .update({ status })
    .eq("id", friendshipId);

  if (error) {
    alert("Request update error: " + error.message);
    return;
  }

  await loadFriends();
}

async function deleteFriendship(friendshipId) {
  const { error } = await supabaseClient
    .from("friends")
    .delete()
    .eq("id", friendshipId);

  if (error) {
    alert("Friendship delete error: " + error.message);
    return;
  }

  await loadFriends();
}

async function visitGarden(friendId, username) {
  currentVisitedFriend = { id: friendId, username };
  currentVisitedItems = [];

  $("visitedGardenTitle").textContent = `IN @${username}'S GARDEN`;
  $("visitedGardenSubtitle").textContent = "Loading shared/public memories, entries, and trees...";
  $("visitedGardenItems").innerHTML = "<p class='muted'>Loading shared garden...</p>";
  openSection("community");

  const { data, error } = await supabaseClient
    .from("garden_items")
    .select("*")
    .eq("user_id", friendId)
    .eq("is_shared", true)
    .order("created_at", { ascending: false });

  if (error) {
    $("visitedGardenItems").innerHTML = `<p class='muted'>Garden load error: ${esc(error.message)}</p>`;
    return;
  }

  currentVisitedItems = data || [];
  renderVisitedGarden("all");
}

function renderVisitedGarden(filter = "all") {
  if (!currentVisitedFriend) {
    $("visitedGardenItems").innerHTML = "<p class='muted'>Select a friend to visit their garden.</p>";
    return;
  }

  document.querySelectorAll(".garden-filter").forEach(btn => {
    btn.classList.toggle("active-filter", btn.dataset.filter === filter);
  });

  const visible = filter === "all"
    ? currentVisitedItems
    : currentVisitedItems.filter(item => item.section === filter);

  const counts = currentVisitedItems.reduce((acc, item) => {
    acc[item.section] = (acc[item.section] || 0) + 1;
    return acc;
  }, {});

  $("visitedGardenSubtitle").innerHTML = `
    <div class="garden-summary">
      @${esc(currentVisitedFriend.username)} has shared
      ${currentVisitedItems.length} public item${currentVisitedItems.length === 1 ? "" : "s"}.
      Trees: ${counts.trees || 0} //
      Entries: ${counts.garden || 0} //
      Moonflowers: ${counts.moonflowers || 0} //
      Chimes: ${counts.chimes || 0} //
      Orchard: ${counts.orchard || 0}
    </div>
  `;

  $("visitedGardenItems").innerHTML = visible.length
    ? visible.map(item => `<div class="visited-item">
        <strong>${esc(item.title || item.mood || item.section)}</strong>
        <span class="shared-badge">${esc(item.section).toUpperCase()}</span>
        <p class="muted">${new Date(item.created_at).toLocaleString()}</p>
        ${item.image_url ? `<img src="${item.image_url}" alt="Shared garden image">` : ""}
        ${item.prompt ? `<p><em>${esc(item.prompt)}</em></p>` : ""}
        ${item.body ? `<p>${esc(item.body).replaceAll("\\n","<br>")}</p>` : ""}
        ${item.song ? `<p class="muted">SONG: ${esc(item.song)}</p>` : ""}
        ${item.people ? `<p class="muted">PEOPLE: ${esc(item.people)}</p>` : ""}
      </div>`).join("")
    : `<p class='muted'>No ${filter === "all" ? "public items" : filter} shared yet.</p>`;
}

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
