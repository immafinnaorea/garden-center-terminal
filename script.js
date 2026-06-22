currentPrompt = $("promptText").textContent;
$("sidebarPrompt").innerHTML = `<em>${esc(currentPrompt)}</em>`;
setStatus("💧 watering prompt...");
}

}

function usePrompt(prompt, category) {
