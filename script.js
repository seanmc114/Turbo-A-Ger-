// TURBO: MTW German (Sein/Haben/Gehen) — voice + mic + highscores + unlocks
// Same structure/flow as your original MTW game, just German.
// Marking (German): pronouns required; case-insensitive; ä/ö/ü/ß ≡ ae/oe/ue/ss; spaces collapsed; "?" required for questions.
(()=>{
  const $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s));

  // ----- CONFIG -----
  const CONFIG = {
    title: "MTW German (Sein/Haben/Gehen)",
    // Same style unlock codes (change if you like)
    codes: { D2: "MTW-D2-OPEN", D3: "MTW-D3-OPEN", FRIDAY: "MTW-FRI-OPEN" },
    days: {
      D1: { label: "Monday (sein)",    verbs: ["sein"] },
      D2: { label: "Tuesday (haben)",  verbs: ["haben"] },
      D3: { label: "Wednesday (gehen)", verbs: ["gehen"] }
    },
    QUESTIONS_PER_RUN: 10,
    PENALTY_SECONDS: 30
  };

  // ----- VOICE -----
  const VOICE = {
    enabled: 'speechSynthesis' in window,
    english: null, german: null,
    init(){
      if(!this.enabled) return;
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.english = voices.find(v=>/^en[-_]/i.test(v.lang)) || voices.find(v=>/en/i.test(v.lang)) || voices[0] || null;
        this.german = voices.find(v=>/^de[-_]/i.test(v.lang)) || voices.find(v=>/german/i.test(v.name)) || this.english;
      };
      pick();
      window.speechSynthesis.onvoiceschanged = pick;
    },
    speak(text, lang='en'){
      if(!this.enabled || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      const voice = lang.startsWith('de') ? (this.german || this.english) : (this.english || this.german);
      if(voice) u.voice = voice;
      u.lang = voice?.lang || (lang.startsWith('de') ? 'de-DE' : 'en-GB');
      try { speechSynthesis.cancel(); } catch(e){}
      speechSynthesis.speak(u);
    }
  };
  VOICE.init();

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srSupported = !!SR;

  // ----- DB (German) -----
  // Arrays: [ich, du, er, sie, wir, ihr, sie(pl)]
  const DB = {
    sein:{present:["bin","bist","ist","ist","sind","seid","sind"],
          past:["war","warst","war","war","waren","wart","waren"],
          futureInf:"sein"},
    haben:{present:["habe","hast","hat","hat","haben","habt","haben"],
           past:["hatte","hattest","hatte","hatte","hatten","hattet","hatten"],
           futureInf:"haben"},
    gehen:{present:["gehe","gehst","geht","geht","gehen","geht","gehen"],
           past:["ging","gingst","ging","ging","gingen","gingt","gingen"],
           futureInf:"gehen"}
  };

  const PERSONS = [
    {label:"I", en:"I", de:"ich"},
    {label:"you (sg.)", en:"you", de:"du", tag:" (you: singular)"},
    {label:"he", en:"he", de:"er"},
    {label:"she", en:"she", de:"sie"},
    {label:"we", en:"we", de:"wir"},
    {label:"you (pl.)", en:"you", de:"ihr", tag:" (you: plural)"},
    {label:"they", en:"they", de:"sie"}
  ];

  const TENSES = ["Present","Past","Future"];
  let currentTense = "Present";
  let currentMode = null;
  let startTime = 0, timerId = null;

  // Title
  document.title = `TURBO: ${CONFIG.title}`;
  $("h1").innerHTML = `<span class="turbo">TURBO</span>: ${CONFIG.title}`;

  setTenseButtons();
  $("#codeBtn").onclick = handleCode;
  renderModes();

  // ----- Unlock state -----
  function keyUnlocked(day){ return `turbo_mtw_unlocked_${CONFIG.title}_${day}`; }
  function isUnlocked(day){
    if (day === "D1") return true;      // Monday always open
    if (day === "HOMEWORK") return true;
    const v = localStorage.getItem(keyUnlocked(day));
    return v === "1";
  }
  function unlock(day){ localStorage.setItem(keyUnlocked(day), "1"); }

  function handleCode(){
    const code = ($("#codeInput").value || "").trim();
    const msg = $("#codeMsg");
    const map = CONFIG.codes || {};
    let matched = null;
    for (const [day, c] of Object.entries(map)) { if (c === code) { matched = day; break; } }
    if (!matched) { msg.textContent = "❌ Code not recognised"; return; }
    if (matched === "FRIDAY") {
      unlock("D2"); unlock("D3"); unlock("FRIDAY");
      msg.textContent = "✅ Friday Test (and all days) unlocked!";
    } else {
      unlock(matched);
      if (isUnlocked("D2") && isUnlocked("D3")) unlock("FRIDAY");
      msg.textContent = `✅ ${CONFIG.days[matched]?.label || matched} unlocked`;
    }
    renderModes();
    $("#codeInput").value = "";
  }

  // ----- Menu -----
  function renderModes(){
    const host = $("#mode-list"); host.innerHTML = "";
    host.appendChild(makeModeBtn("HOMEWORK", "Homework Tonight (All unlocked days)"));
    host.appendChild(makeModeBtn("D1", CONFIG.days.D1.label));
    host.appendChild(makeModeBtn("D2", CONFIG.days.D2.label));
    host.appendChild(makeModeBtn("D3", CONFIG.days.D3.label));
    host.appendChild(makeModeBtn("FRIDAY", "Friday Test (All week)"));
  }
  function makeModeBtn(modeKey, label){
    const btn = document.createElement("button"); btn.className = "mode-btn"; btn.dataset.mode = modeKey;
    const locked = (modeKey==="HOMEWORK") ? false
                  : (modeKey==="D1") ? false
                  : (modeKey==="FRIDAY") ? !isUnlocked("FRIDAY") && !(isUnlocked("D2") && isUnlocked("D3"))
                  : !isUnlocked(modeKey);
    btn.disabled = locked; 
    const icon = locked ? "🔒" : "🔓";
    const best = getBest(currentTense, modeKey);
    btn.textContent = `${icon} ${label}${best!=null ? " — Best: "+best.toFixed(1)+"s" : ""}`;
    btn.onclick = () => { if (!locked) startMode(modeKey); };
    return btn;
  }

  // ----- Build quiz -----
  function startMode(modeKey){
    currentMode = modeKey;
    $("#mode-list").style.display = "none";
    $("#game").style.display = "block";
    $("#results").innerHTML = "";
    $("#back-button").style.display = "none";

    const pool = buildPoolForMode(modeKey, currentTense);
    shuffle(pool);
    const quiz = pool.slice(0, CONFIG.QUESTIONS_PER_RUN);

    const qwrap = $("#questions"); qwrap.innerHTML = "";

    // Voice bar
    const vbar = $("#voice-bar");
    if (VOICE.enabled) {
      vbar.style.display = "flex";
      $("#read-all").onclick = () => {
        let i = 0; const items = quiz.map(q => q.prompt.replace(/\s*\(.*\)\s*$/,''));
        const langs = quiz.map(q=>q.readLang);
        const next = () => { if (i >= items.length) return; VOICE.speak(items[i], langs[i]); i++; setTimeout(next, 1700); };
        next();
      };
    } else vbar.style.display = "none";

    quiz.forEach((q,i) => {
      const row = document.createElement("div");
      row.className = "q";

      const promptRow = document.createElement("div"); promptRow.className = "prompt-row";
      const p = document.createElement("div"); p.className = "prompt"; p.textContent = `${i+1}. ${q.prompt}`;

      const spk = document.createElement("button"); spk.className = "icon-btn"; spk.textContent = "🔊"; spk.title = "Read this question";
      spk.onclick = ()=> VOICE.speak(q.prompt.replace(/\s*\(.*\)\s*$/,''), q.readLang);

      const mic = document.createElement("button"); mic.className = "icon-btn"; mic.textContent = "🎤"; mic.title = srSupported ? "Dictate answer" : "Speech recognition not supported";
      const input = document.createElement("input"); input.type = "text"; input.placeholder = "Type or dictate the German form (e.g., ich bin / bist du?)";
      if (srSupported) {
        mic.onclick = ()=>{ const rec = new SR(); rec.lang = "de-DE"; rec.interimResults = false; rec.maxAlternatives = 1;
          mic.disabled = true; mic.textContent = "⏺️…";
          rec.onresult = e => { const said = e.results[0][0].transcript || ""; input.value = said; };
          rec.onerror = ()=>{}; rec.onend = ()=>{ mic.disabled=false; mic.textContent="🎤"; };
          try { rec.start(); } catch(e) { mic.disabled=false; mic.textContent="🎤"; }
        };
      } else mic.disabled = true;

      promptRow.appendChild(p); promptRow.appendChild(spk); promptRow.appendChild(mic);
      row.appendChild(promptRow); row.appendChild(input); qwrap.appendChild(row);

      input.addEventListener('focus', ()=>{ const a = $("#auto-read"); if(a && a.checked) VOICE.speak(q.prompt.replace(/\s*\(.*\)\s*$/,''), q.readLang); });
    });

    $("#submit").onclick = () => checkAnswers(quiz);
    startTimer();
  }

  function buildPoolForMode(modeKey, tense){
    if (modeKey === "HOMEWORK") {
      const open = ["D1","D2","D3"].filter(d => isUnlocked(d) || d==="D1");
      return poolFromDays(open, tense);
    } else if (modeKey === "FRIDAY") {
      return poolFromDays(["D1","D2","D3"], tense);
    } else {
      return poolFromDays([modeKey], tense);
    }
  }

  function poolFromDays(dayKeys, tense){
    const kinds = ["pos","neg","q"]; const pool = [];
    const persons = PERSONS;
    dayKeys.forEach(d => {
      const vlist = CONFIG.days[d]?.verbs || [];
      vlist.forEach(v => {
        const table = DB[v]; if (!table) return;
        persons.forEach((p, idx) => {
          const forms = getGermanForms(v, idx, tense);
          const targets = { pos: forms.pos, neg: forms.neg, q: forms.q };
          kinds.forEach(k => pool.push({ 
            prompt: englishPrompt(v, tense, p, k), 
            answer: targets[k],
            readLang: 'en' // prompts are English like original
          }));
        });
      });
    });
    return pool;
  }

  // ----- German forms (answer builder) -----
  function getGermanForms(verbKey, personIdx, tense){
    const entry = DB[verbKey];
    if (tense === "Present"){
      const form = entry.present[personIdx];
      const subj = PERSONS[personIdx].de;
      return { pos: `${subj} ${form}`, neg: `${subj} ${form} nicht`, q: `${cap(form)} ${subj}?` };
    } else if (tense === "Past"){
      const form = entry.past[personIdx];
      const subj = PERSONS[personIdx].de;
      return { pos: `${subj} ${form}`, neg: `${subj} ${form} nicht`, q: `${cap(form)} ${subj}?` };
    } else {
      // Future: werden + inf
      const werden = ["werde","wirst","wird","wird","werden","werdet","werden"][personIdx];
      const subj = PERSONS[personIdx].de;
      return { pos: `${subj} ${werden} ${entry.futureInf}`, neg: `${subj} ${werden} nicht ${entry.futureInf}`, q: `${cap(werden)} ${subj} ${entry.futureInf}?` };
    }
  }

  // ----- English prompts (same style) -----
  function englishPrompt(verb, tense, person, kind){
    const s = person.en, t = person.tag || "";
    if (verb === "sein") {
      if (tense === "Present") {
        if (kind==="pos") return `${cap(s)}${t} ${bePres(s)} (sein)`;
        if (kind==="neg") return `${cap(s)}${t} ${bePresNeg(s)} (sein)`;
        if (kind==="q")   return `${beQPres(person)} (sein)`;
      } else if (tense === "Past") {
        if (kind==="pos") return `${cap(s)}${t} ${bePast(s)} (sein)`;
        if (kind==="neg") return `${cap(s)}${t} ${bePastNeg(s)} (sein)`;
        if (kind==="q")   return `${beQPast(person)} (sein)`;
      } else {
        if (kind==="pos") return `${cap(s)}${t} will be (sein)`;
        if (kind==="neg") return `${cap(s)}${t} will not be (sein)`;
        if (kind==="q")   return `Will ${s}${t} be? (sein)`;
      }
    } else if (verb === "haben") {
      if (tense === "Present") {
        if (kind==="pos") return `${cap(s)}${t} ${havePres(s)} (haben)`;
        if (kind==="neg") return `${cap(s)}${t} ${havePresNeg(s)} (haben)`;
        if (kind==="q")   return `${haveQPres(person)} (haben)`;
      } else if (tense === "Past") {
        if (kind==="pos") return `${cap(s)}${t} had (haben)`;
        if (kind==="neg") return `${cap(s)}${t} did not have (haben)`;
        if (kind==="q")   return `Did ${s}${t} have? (haben)`;
      } else {
        if (kind==="pos") return `${cap(s)}${t} will have (haben)`;
        if (kind==="neg") return `${cap(s)}${t} will not have (haben)`;
        if (kind==="q")   return `Will ${s}${t} have? (haben)`;
      }
    } else if (verb === "gehen") {
      if (tense === "Present") {
        if (kind==="pos") return `${cap(s)}${t} ${goPres(s)} (gehen)`;
        if (kind==="neg") return `${cap(s)}${t} ${doNeg(s)} go (gehen)`;
        if (kind==="q")   return `${doQ(s)} ${s}${t} go? (gehen)`;
      } else if (tense === "Past") {
        if (kind==="pos") return `${cap(s)}${t} went (gehen)`;
        if (kind==="neg") return `${cap(s)}${t} did not go (gehen)`;
        if (kind==="q")   return `Did ${s}${t} go? (gehen)`;
      } else {
        if (kind==="pos") return `${cap(s)}${t} will go (gehen)`;
        if (kind==="neg") return `${cap(s)}${t} will not go (gehen)`;
        if (kind==="q")   return `Will ${s}${t} go? (gehen)`;
      }
    }
    return `${cap(s)}${t}`;
  }
  const cap = s => s ? s[0].toUpperCase()+s.slice(1) : s;
  const is3 = s => (s==="he"||s==="she"||s==="it");
  // be
  const bePres = s => s==="I" ? "am" : (s==="you"||s==="we"||s==="they") ? "are" : "is";
  const bePresNeg = s => s==="I" ? "am not" : bePres(s) + " not";
  const beQPres = p => { const s = p.en, t = p.tag||""; if(s==="I")return"Am I?"; if(s==="you")return`Are you${t}?`; if(s==="we")return"Are we?"; if(s==="they")return"Are they?"; return `Is ${s}?`; };
  const bePast = s => (s==="I"||s==="he"||s==="she"||s==="it") ? "was" : "were";
  const bePastNeg = s => bePast(s)+" not";
  const beQPast = p => { const s=p.en, t=p.tag||""; if(s==="I")return"Was I?"; if(s==="you")return`Were you${t}?`; if(s==="he"||s==="she"||s==="it")return`Was ${s}?`; return `Were ${s}?`; };
  // have
  const havePres = s => (s==="he"||s==="she"||s==="it") ? "has" : "have";
  const havePresNeg = s => `${(is3(s)?'does':'do')} not have`;
  const haveQPres = p => `${is3(p.en)?'Does':'Do'} ${p.en}${p.tag||""} have?`;
  // go/do aux
  const goPres = s => (is3(s) ? "goes" : "go");
  const doQ = s => is3(s) ? "Does" : "Do";
  const doNeg = s => is3(s) ? "does" : "do";

  // ----- Timer & scoring -----
  function startTimer(){
    startTime = performance.now();
    $("#timer").textContent = "Time: 0s";
    clearInterval(timerId);
    timerId = setInterval(()=>{
      const e = (performance.now() - startTime)/1000;
      $("#timer").textContent = `Time: ${e.toFixed(1)}s`;
    }, 100);
  }
  function stopTimer(){ clearInterval(timerId); }

  function checkAnswers(quiz){
    stopTimer();
    const inputs = $$("#questions .q input");
    let correct = 0; const items = [];
    inputs.forEach((inp,i)=>{
      const expected = quiz[i].answer;
      const ok = isCorrect(inp.value, expected);
      inp.classList.remove("good","bad"); inp.classList.add(ok ? "good" : "bad");
      if (ok) correct++;
      const li = document.createElement("li");
      li.className = ok ? "correct" : "incorrect";
      li.textContent = `${i+1}. ${quiz[i].prompt} → ${quiz[i].answer}`;
      items.push(li);
    });
    const elapsed = (performance.now() - startTime)/1000;
    const penalty = (quiz.length - correct) * CONFIG.PENALTY_SECONDS;
    const finalTime = elapsed + penalty;

    if (currentMode) saveBest(currentTense, currentMode, finalTime);

    const summary = document.createElement("div");
    summary.className = "result-summary";
    summary.innerHTML = [
      `<div class="final-time">🏁 Final Time: ${finalTime.toFixed(1)}s</div>`,
      `<div class="line">✅ Correct: ${correct}/${quiz.length}</div>`,
      penalty>0 ? `<div class="line">⏱️ Penalty: +${penalty}s (${CONFIG.PENALTY_SECONDS}s per incorrect)</div>` : ``
    ].join("");

    const ul = document.createElement("ul"); items.forEach(li => ul.appendChild(li));
    const results = $("#results"); results.innerHTML = ""; results.appendChild(summary); results.appendChild(ul);

    if (VOICE.enabled) VOICE.speak(`You got ${correct} out of ${quiz.length}. Final time ${finalTime.toFixed(1)} seconds.`, 'en');

    $("#back-button").style.display = "inline-block";
    $("#back-button").onclick = ()=>{ $("#game").style.display = "none"; $("#mode-list").style.display = "flex"; renderModes(); };
  }

  // ----- Marking -----
  // Normalize:
  // - lower-case
  // - collapse spaces
  // - fold ä→ae, ö→oe, ü→ue, ß→ss
  function normDE(s){
    const map = { "ä":"ae","ö":"oe","ü":"ue","ß":"ss" };
    return (s||"")
      .trim()
      .toLowerCase()
      .replace(/\s+/g," ")
      .replace(/[äöüß]/g, m => map[m]);
  }
  function isCorrect(given, expected){
    const gRaw = (given||"").trim();
    const eRaw = (expected||"").trim();

    // Questions must keep a trailing "?"
    const eIsQ = /\?$/.test(eRaw);
    if (eIsQ) {
      if (!/\?$/.test(gRaw)) return false;
      const gCore = normDE(gRaw.slice(0,-1));
      const eCore = normDE(eRaw.slice(0,-1));
      return gCore === eCore;
    }
    return normDE(gRaw) === normDE(eRaw);
  }

  // ----- Best per (tense, mode) -----
  function bestKey(tense, mode){ return `turbo_mtw_best_${CONFIG.title}_${tense}_${mode}`; }
  function getBest(tense, mode){ const v = localStorage.getItem(bestKey(tense, mode)); return v ? parseFloat(v) : null; }
  function saveBest(tense, mode, score){
    const cur = getBest(tense, mode);
    const best = (cur == null || score < cur) ? score : cur;
    localStorage.setItem(bestKey(tense, mode), best.toString());
  }

  function setTenseButtons(){
    $$(".tense-button").forEach(b=>{
      b.classList.toggle("active", b.dataset.tense === currentTense);
      b.onclick = ()=>{ currentTense = b.dataset.tense; $$(".tense-button").forEach(x=>x.classList.remove("active")); b.classList.add("active"); renderModes(); };
    });
  }

  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }

})();
