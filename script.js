/* ===================================================
   AI Auto Papers Generator
   M Ijaz - GHS 124/NB
   Real AI generation via Pollinations.ai text API (free, no key)
=================================================== */

const STORAGE_KEY = "aiPapers_v1";
const AI_ENDPOINT = "https://text.pollinations.ai/openai";

// ---------- DOM ----------
const paperForm   = document.getElementById("paperForm");
const genBtn      = document.getElementById("genBtn");
const genBtnText  = document.getElementById("genBtnText");
const outputCard  = document.getElementById("outputCard");
const outputTitle = document.getElementById("outputTitle");
const paperOutput = document.getElementById("paperOutput");
const genStatus   = document.getElementById("genStatus");
const actionBar   = document.getElementById("actionBar");

const generatorView = document.getElementById("generatorView");
const libraryView   = document.getElementById("libraryView");
const libraryBtn    = document.getElementById("libraryBtn");
const backBtn       = document.getElementById("backBtn");
const papersList     = document.getElementById("papersList");
const emptyMsg       = document.getElementById("emptyMsg");
const searchBox      = document.getElementById("searchBox");

const toast = document.getElementById("toast");

const detailModal  = document.getElementById("detailModal");
const detailTitle  = document.getElementById("detailTitle");
const detailBody   = document.getElementById("detailBody");
const closeDetail  = document.getElementById("closeDetail");

let currentPaper = null; // { title, meta, content }
let currentDetailId = null;
let abortController = null;

// ---------- Helpers ----------
function showToast(msg){
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"), 2200);
}

function switchView(view){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  view.classList.add("active");
}

function loadPapers(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  }catch(e){ return []; }
}
function savePapers(papers){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(papers));
}

// ---------- Prompt Builder ----------
function buildPrompt(f){
  return `You are an expert Pakistani school teacher and paper-setter, fully aligned with the Punjab/PEC/PECTTA style textbook curriculum.

Create a complete, ready-to-print examination paper with these exact specifications:

- Class/Grade: ${f.klass}
- Subject: ${f.subject}
- Chapters/Topics to cover: ${f.topics}
- Paper Type: ${f.type}
- Language: ${f.lang}
- Difficulty: ${f.diff}
- Total Marks: ${f.marks}
- Number of MCQs: ${f.mcq}
- Number of Short Questions: ${f.short}
- Number of Long Questions: ${f.long}
${f.extra ? "- Extra instructions: " + f.extra : ""}

Formatting rules:
1. Start with a proper paper header: School Name line placeholder "GHS 124/NB", Class, Subject, Paper Type, Time Allowed, Total Marks, Name/Roll No fields.
2. Section A: Multiple Choice Questions (MCQs) - each with 4 options (a,b,c,d), one correct concept-based question per topic, numbered.
3. Section B: Short Questions - clear, concise, directly from the given topics.
4. Section C: Long/Detailed Questions - descriptive, aligned to textbook depth for that class level.
5. Number every question. Assign marks per question that sum to the total marks.
6. Use the requested language throughout (Urdu script if Urdu is requested).
7. At the very end, include an "Answer Key" section with correct MCQ answers only (a/b/c/d), do not answer short/long questions.
8. Do NOT include any explanation about how you created it, no preamble, no markdown code fences - output the paper content directly as plain formatted text, ready to copy into a document.`;
}

// ---------- AI Streaming Call ----------
async function generateWithAI(prompt, onChunk){
  abortController = new AbortController();
  const body = {
    model: "openai",
    messages: [
      { role: "system", content: "You are a precise, curriculum-aligned Pakistani school exam paper generator. Always output complete, well-structured, ready-to-use paper text only." },
      { role: "user", content: prompt }
    ],
    stream: true
  };

  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: abortController.signal
  });

  if(!res.ok || !res.body){
    throw new Error("AI stream unavailable, status " + res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullText = "";

  while(true){
    const { value, done } = await reader.read();
    if(done) break;
    buffer += decoder.decode(value, { stream: true });

    let lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete line in buffer

    for(const line of lines){
      const trimmed = line.trim();
      if(!trimmed.startsWith("data:")) continue;
      const dataStr = trimmed.slice(5).trim();
      if(dataStr === "[DONE]") continue;
      try{
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta?.content
                    || json.choices?.[0]?.text
                    || "";
        if(delta){
          fullText += delta;
          onChunk(delta, fullText);
        }
      }catch(e){ /* ignore partial json */ }
    }
  }
  return fullText;
}

// Fallback: non-streaming GET request (used if streaming fails)
async function generateWithAIFallback(prompt){
  const url = "https://text.pollinations.ai/" + encodeURIComponent(prompt) + "?model=openai";
  const res = await fetch(url);
  if(!res.ok) throw new Error("AI request failed: " + res.status);
  return await res.text();
}

// ---------- Generate Handler ----------
paperForm.addEventListener("submit", async (e)=>{
  e.preventDefault();

  const f = {
    klass:  document.getElementById("f_class").value,
    subject: document.getElementById("f_subject").value.trim(),
    topics: document.getElementById("f_topics").value.trim(),
    type:   document.getElementById("f_type").value,
    lang:   document.getElementById("f_lang").value,
    mcq:    document.getElementById("f_mcq").value || 0,
    short:  document.getElementById("f_short").value || 0,
    long:   document.getElementById("f_long").value || 0,
    diff:   document.getElementById("f_diff").value,
    marks:  document.getElementById("f_marks").value,
    extra:  document.getElementById("f_extra").value.trim()
  };

  if(!f.klass || !f.subject || !f.topics){
    showToast("Please zaroori fields bharen");
    return;
  }

  outputCard.classList.remove("hidden");
  outputTitle.textContent = `${f.subject} - ${f.klass} (${f.type})`;
  paperOutput.textContent = "";
  actionBar.classList.add("hidden");
  genStatus.className = "status-dot live";
  genBtn.disabled = true;
  genBtnText.textContent = "⏳ AI Paper Bana Raha Hai...";
  outputCard.scrollIntoView({behavior:"smooth", block:"start"});

  const prompt = buildPrompt(f);

  try{
    let full = "";
    try{
      full = await generateWithAI(prompt, (delta, textSoFar)=>{
        paperOutput.textContent = textSoFar;
        paperOutput.scrollTop = paperOutput.scrollHeight;
      });
    }catch(streamErr){
      // fallback to non-streaming
      paperOutput.textContent = "";
      full = await generateWithAIFallback(prompt);
      paperOutput.textContent = full;
    }

    if(!full || full.trim().length < 20){
      throw new Error("Empty AI response");
    }

    currentPaper = {
      title: `${f.subject} - ${f.klass}`,
      meta: `${f.type} • ${f.lang} • ${f.diff} • ${f.marks} Marks`,
      content: full,
      createdAt: Date.now()
    };

    genStatus.className = "status-dot done";
    actionBar.classList.remove("hidden");
    showToast("Paper tayyar ho gaya! ✅");

  }catch(err){
    genStatus.className = "status-dot error";
    paperOutput.textContent = "❌ AI paper generate nahi ho saka. Internet check karen aur dobara try karen.\n\nError: " + err.message;
    showToast("Generation fail ho gayi, dobara try karen");
  }finally{
    genBtn.disabled = false;
    genBtnText.textContent = "✨ AI Say Paper Banayen";
  }
});

// ---------- Actions: Save / Copy / Download / Share / Print / Regenerate ----------
document.getElementById("saveBtn").addEventListener("click", ()=>{
  if(!currentPaper) return;
  const papers = loadPapers();
  papers.unshift({
    id: "p_" + Date.now(),
    title: currentPaper.title,
    meta: currentPaper.meta,
    content: currentPaper.content,
    createdAt: currentPaper.createdAt
  });
  savePapers(papers);
  showToast("Paper save ho gaya 💾");
});

document.getElementById("copyBtn").addEventListener("click", ()=> copyText(currentPaper?.content));
document.getElementById("downloadBtn").addEventListener("click", ()=> downloadText(currentPaper?.title, currentPaper?.content));
document.getElementById("shareBtn").addEventListener("click", ()=> shareText(currentPaper?.title, currentPaper?.content));
document.getElementById("printBtn").addEventListener("click", ()=> printText(currentPaper?.title, currentPaper?.content));
document.getElementById("regenBtn").addEventListener("click", ()=> paperForm.requestSubmit());

function copyText(text){
  if(!text) return;
  navigator.clipboard.writeText(text)
    .then(()=> showToast("Copy ho gaya 📋"))
    .catch(()=> showToast("Copy fail ho gaya"));
}

function downloadText(title, text){
  if(!text) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (title || "paper").replace(/[^\w\-]+/g,"_") + ".txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast("Download ho gaya ⬇️");
}

function shareText(title, text){
  if(!text) return;
  if(navigator.share){
    navigator.share({ title: title || "AI Paper", text }).catch(()=>{});
  }else{
    copyText(text);
    showToast("Share support nahi, copy kar diya");
  }
}

function printText(title, text){
  if(!text) return;
  const w = window.open("", "_blank");
  w.document.write(`<pre style="white-space:pre-wrap;font-family:sans-serif;font-size:14px;padding:20px;">${escapeHtml(text)}</pre>`);
  w.document.title = title || "Paper";
  w.document.close();
  w.focus();
  w.print();
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

// ---------- Library ----------
libraryBtn.addEventListener("click", ()=>{
  renderLibrary();
  switchView(libraryView);
});
backBtn.addEventListener("click", ()=> switchView(generatorView));

function renderLibrary(filter=""){
  const papers = loadPapers();
  const q = filter.trim().toLowerCase();
  const filtered = q ? papers.filter(p =>
    p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
  ) : papers;

  papersList.innerHTML = "";
  emptyMsg.classList.toggle("hidden", filtered.length > 0);

  filtered.forEach(p=>{
    const item = document.createElement("div");
    item.className = "paper-item";
    const date = new Date(p.createdAt).toLocaleDateString();
    item.innerHTML = `
      <div class="pi-info">
        <h4>${escapeHtml(p.title)}</h4>
        <p>${escapeHtml(p.meta || "")} • ${date}</p>
      </div>
      <button class="pi-del" data-id="${p.id}" title="Delete">🗑️</button>
    `;
    item.addEventListener("click", (e)=>{
      if(e.target.closest(".pi-del")) return;
      openDetail(p);
    });
    item.querySelector(".pi-del").addEventListener("click", (e)=>{
      e.stopPropagation();
      deletePaper(p.id);
    });
    papersList.appendChild(item);
  });
}

searchBox.addEventListener("input", ()=> renderLibrary(searchBox.value));

function deletePaper(id){
  let papers = loadPapers();
  papers = papers.filter(p => p.id !== id);
  savePapers(papers);
  renderLibrary(searchBox.value);
  showToast("Paper delete ho gaya 🗑️");
}

// ---------- Detail Modal ----------
function openDetail(p){
  currentDetailId = p.id;
  detailTitle.textContent = p.title;
  detailBody.textContent = p.content;
  detailModal.classList.remove("hidden");
}
closeDetail.addEventListener("click", ()=> detailModal.classList.add("hidden"));
detailModal.addEventListener("click", (e)=>{ if(e.target === detailModal) detailModal.classList.add("hidden"); });

document.getElementById("detailCopy").addEventListener("click", ()=> copyText(detailBody.textContent));
document.getElementById("detailDownload").addEventListener("click", ()=> downloadText(detailTitle.textContent, detailBody.textContent));
document.getElementById("detailShare").addEventListener("click", ()=> shareText(detailTitle.textContent, detailBody.textContent));
document.getElementById("detailPrint").addEventListener("click", ()=> printText(detailTitle.textContent, detailBody.textContent));
document.getElementById("detailDelete").addEventListener("click", ()=>{
  if(currentDetailId){
    deletePaper(currentDetailId);
    detailModal.classList.add("hidden");
  }
});

// ---------- PWA Install ----------
let deferredPrompt = null;
const installBar = document.getElementById("installBar");
window.addEventListener("beforeinstallprompt", (e)=>{
  e.preventDefault();
  deferredPrompt = e;
  installBar.classList.remove("hidden");
});
document.getElementById("installBtn").addEventListener("click", async ()=>{
  installBar.classList.add("hidden");
  if(deferredPrompt){
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
});
document.getElementById("installClose").addEventListener("click", ()=> installBar.classList.add("hidden"));

// ---------- Service Worker ----------
if("serviceWorker" in navigator){
  window.addEventListener("load", ()=>{
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
