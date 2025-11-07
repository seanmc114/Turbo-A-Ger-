// Turbo: A+ Edition — German Translation Game (Suite look + Voice + Mic)
// - EN↔DE toggle, Present/Past/Future tenses
// - Pronouns required in German answers
// - Marking: case-insensitive; ä/ö/ü/ß ≡ ae/oe/ue/ss; spaces collapsed
// - Questions must end with "?"
(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // -------------------- CONFIG --------------------
  const QUESTIONS_PER_RUN = 10;
  const PENALTY_SECONDS = 30;

  // Direction modes
  const DIRS = { EN2DE: "EN→DE", DE2EN: "DE→EN" };
  let direction = "EN2DE";
  let currentTense = "Present";
  let startTime = 0, timerId = null, currentQuiz = [];

  // Persons: 7 slots for consistency with your older games
  const PERSONS = [
    { en: "I",      de: "ich"  },
    { en: "you (sg.)", de: "du"   },
    { en: "he",     de: "er"   },
    { en: "she",    de: "sie"  },
    { en: "we",     de: "wir"  },
    { en: "you (pl.)", de: "ihr"  },
    { en: "they",   de: "sie"  }
  ];

  // Verb DB: present & präteritum (past) carefully set; future = werden + INF
  // Each array is [ich, du, er, sie, wir, ihr, sie(pl)]
  const DB = {
    sein: {
      inf: "sein",
      present: ["bin","bist","ist","ist","sind","seid","sind"],
      past:    ["war","warst","war","war","waren","wart","waren"]
    },
    haben: {
      inf:"haben",
      present:["habe","hast","hat","hat","haben","habt","haben"],
      past:   ["hatte","hattest","hatte","hatte","hatten","hattet","hatten"]
    },
    gehen: {
      inf:"gehen",
      present:["gehe","gehst","geht","geht","gehen","geht","gehen"],
      past:   ["ging","gingst","ging","ging","gingen","gingt","gingen"]
    },
    kommen: {
      inf:"kommen",
      present:["komme","kommst","kommt","kommt","kommen","kommt","kommen"],
      past:   ["kam","kamst","kam","kam","kamen","kamt","kamen"]
    },
    machen: {
      inf:"machen",
      present:["mache","machst","macht","macht","machen","macht","machen"],
      past:   ["machte","machtest","machte","machte","machten","machtet","machten"]
    },
    spielen: {
      inf:"spielen",
      present:["spiele","spielst","spielt","spielt","spielen","spielt","spielen"],
      past:   ["spielte","spieltest","spielte","spielte","spielten","spieltet","spielten"]
    },
    lernen: {
      inf:"lernen",
      present:["lerne","lernst","lernt","lernt","lernen","lernt","lernen"],
      past:   ["lernte","lerntest","lernte","lernte","lernten","lerntet","lernten"]
    },
    wohnen: {
      inf:"wohnen",
      present:["wohne","wohnst","wohnt","wohnt","wohnen","wohnt","wohnen"],
      past:   ["wohnte","wohntest","wohnte","wohnte","wohnten","wohntet","wohnten"]
    },
    sprechen: {
      inf:"sprechen",
      present:["spreche","sprichst","spricht","spricht","sprechen","sprecht","sprechen"],
      past:   ["sprach","sprachst","sprach","sprach","sprachen","spracht","sprachen"]
    },
    essen: {
      inf:"essen",
      present:["esse","isst","isst","isst","essen","esst","essen"],
      past:   ["aß","aßest","aß","aß","aßen","aßt","aßen"] // 'ss' accepted too
    },
    trinken: {
      inf:"trinken",
      present:["trinke","trinkst","trinkt","trinkt","trinken","trinkt","trinken"],
      past:   ["trank","trankst","trank","trank","tranken","trankt","tranken"]
    }
  };
  const VERB_KEYS = Object.keys(DB);

  // -------------------- VOICE (TTS) --------------------
  const VOICE = {
    enabled: 'speechSynthesis' in window,
    english: null, german: null,
    init(){
      if(!this.enabled) return;
      const pick = () => {
        const voices = speechSynthesis.getVoices();
        this.english = voices.find(v=>/^en[-_]/i.test(v.lang)) || voices.find(v=>/en/i.test(v.lang)) || voices[0] || null;
        // Prefer de-DE; fall back to any 'German' name; else English
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

  // -------------------- MIC (Speech Recognition) --------------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srSupported = !!SR;

  // -------------------- UI INIT --------------------
  document.title = "Turbo: A+ Edition — German";
  $("h1").innerHTML = `<span class="turbo">TURBO</span>: A+ Edition — German`;

  // Tense buttons (default Present)
  $$("#tense-buttons .tense-button").forEach(btn=>{
    btn.onclick = ()=>{
      $$("#tense-buttons .tense-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTense = btn.dataset.tense || "Present";
    };
  });
  const presentBtn = $$("#tense-buttons .tense-button").find(b=>b.dataset.tense==="Present");
  if (presentBtn) presentBtn.classList.add("active");

  // Direction buttons in the classic "modes" list
  function renderLevelList(){
    const host = $("#level-list"); host.innerHTML = "";
    host.appendChild(makeModeBtn("EN2DE", `Start ${DIRS.EN2DE}`));
    host.appendChild(makeModeBtn("DE2EN", `Start ${DIRS.DE2EN}`));
  }
  function makeModeBtn(modeKey, label){
    const btn = document.createElement("button"); btn.className = "mode-btn";
    btn.textContent = label;
    btn.onclick = () => { direction = modeKey; startRun(); };
    return btn;
  }
  renderLevelList();

  // -------------------- QUIZ BUILD --------------------
  function startRun(){
    $("#results").innerHTML = "";
    $("#level-list").style.display = "none";
    $("#game").style.display = "block";
    $("#back-button").style.display = "none";
    $("#questions").innerHTML = "";

    currentQuiz = makeQuiz();
    renderQuestions(currentQuiz);
    attachSubmit(currentQuiz);
    setVoiceBar(currentQuiz);
    startTimer();
  }

  function makeQuiz(){
    const items = [];
    const kinds = ["pos","neg","q"]; // positive, negative, question
    VERB_KEYS.forEach(vk=>{
      for (let pi=0; pi<PERSONS.length; pi++){
        kinds.forEach(k=>{
          items.push(buildItem(vk, pi, k));
        });
      }
    });
    shuffle(items);
    return items.slice(0, QUESTIONS_PER_RUN);
  }

  function buildItem(verbKey, personIndex, kind){
    const verb = DB[verbKey];
    const person = PERSONS[personIndex];
    const en = person.en;
    const de = person.de;

    // ---- GERMAN answers ----
    let dePos="", deNeg="", deQ="";
    if (currentTense === "Present"){
      const form = verb.present[personIndex];
      dePos = `${de} ${form}`;
      deNeg = `${de} ${form} nicht`;
      deQ   = `${capFirst(form)} ${de}?`;
    } else if (currentTense === "Past"){
      const form = verb.past[personIndex];
      dePos = `${de} ${form}`;
      deNeg = `${de} ${form} nicht`;
      deQ   = `${capFirst(form)} ${de}?`;
    } else {
      const werdenForms = ["werde","wirst","wird","wird","werden","werdet","werden"];
      const w = werdenForms[personIndex];
      dePos = `${de} ${w} ${verb.inf}`;
      deNeg = `${de} ${w} nicht ${verb.inf}`;
      deQ   = `${capFirst(w)} ${de} ${verb.inf}?`;
    }

    // ---- ENGLISH answers ----
    const enBase = englishBase(verbKey);
    const enPast = englishPast(verbKey);
    const en3rd  = english3rd(verbKey);
    let enPos="", enNeg="", enQ="";
    if (currentTense === "Present"){
      const third = (en === "he" || en === "she");
      enPos = `${enSubject(en)} ${third ? en3rd : enBase}`;
      enNeg = `${enSubject(en)} ${enAuxDo(en)} not ${enBase}`;
      enQ   = `${enAuxDoQ(en)} ${enSubject(en)} ${enBase}?`;
    } else if (currentTense === "Past"){
      enPos = `${enSubject(en)} ${enPast}`;
      enNeg = `${enSubject(en)} did not ${enBase}`;
      enQ   = `Did ${enSubject(en)} ${enBase}?`;
    } else {
      enPos = `${enSubject(en)} will ${enBase}`;
      enNeg = `${enSubject(en)} will not ${enBase}`;
      enQ   = `Will ${enSubject(en)} ${enBase}?`;
    }

    // Direction
    let prompt="", answer="";
    if (direction === "EN2DE"){
      if (kind==="pos"){ prompt=enPos; answer=dePos; }
      if (kind==="neg"){ prompt=enNeg; answer=deNeg; }
      if (kind==="q"){   prompt=enQ;   answer=deQ;   }
    } else {
      if (kind==="pos"){ prompt=dePos; answer=enPos; }
      if (kind==="neg"){ prompt=deNeg; answer=enNeg; }
      if (kind==="q"){   prompt=deQ;   answer=enQ;   }
    }

    // For Read All: pick the language to voice based on prompt
    const speakLang = (direction==="EN2DE") ? 'en' : 'de';
    return { verbKey, personIndex, kind, prompt, answer, speakLang };
  }

  function renderQuestions(quiz){
    const wrap = $("#questions");
    quiz.forEach((q,i)=>{
      const row = document.createElement("div");
      row.className = "q";

      const promptRow = document.createElement("div");
      promptRow.className = "prompt-row";

      const label = document.createElement("div");
      label.className = "prompt";
      label.textContent = `${i+1}. ${q.prompt}`;

      const spk = document.createElement("button");
      spk.className = "icon-btn";
      spk.textContent = "🔊";
      spk.title = "Read this";
      spk.onclick = ()=> VOICE.speak(q.prompt, q.speakLang);

      const mic = document.createElement("button");
      mic.className = "icon-btn";
      mic.textContent = "🎤";
      mic.title = srSupported ? "Dictate your answer" : "Speech recognition not supported";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = (direction==="EN2DE")
        ? (q.kind==="q" ? "z.B. Gehe ich?" : "z.B. ich gehe / ich gehe nicht")
        : (q.kind==="q" ? "e.g. Do I go?" : "e.g. I go / I do not go");

      if (srSupported) {
        mic.onclick = ()=>{
          const rec = new SR();
          rec.lang = (direction==="EN2DE") ? "de-DE" : "en-GB";
          rec.interimResults = false; rec.maxAlternatives = 1;
          mic.disabled = true; mic.textContent = "⏺️…";
          rec.onresult = e => { const said = e.results[0][0].transcript || ""; input.value = said; };
          rec.onerror = ()=>{};
          rec.onend = ()=>{ mic.disabled=false; mic.textContent="🎤"; };
          try { rec.start(); } catch(e) { mic.disabled=false; mic.textContent="🎤"; }
        };
      } else mic.disabled = true;

      promptRow.appendChild(label);
      promptRow.appendChild(spk);
      promptRow.appendChild(mic);
      row.appendChild(promptRow);
      row.appendChild(input);
      wrap.appendChild(row);

      // auto-read on focus (if enabled)
      input.addEventListener('focus', ()=>{
        const a = $("#auto-read");
        if (a && a.checked) VOICE.speak(q.prompt, q.speakLang);
      });
    });
  }

  function attachSubmit(quiz){
    $("#submit").onclick = ()=>{
      stopTimer();
      const inputs = $$("#questions input");
      let correct = 0;
      const results = $("#results");
      results.innerHTML = "";
      const items = [];

      inputs.forEach((inp, i)=>{
        const expected = quiz[i].answer;
        const ok = isCorrect(inp.value, expected);
        inp.classList.remove("good","bad");
        inp.classList.add(ok ? "good" : "bad");
        if (ok) correct++;

        const li = document.createElement("li");
        li.className = ok ? "correct" : "incorrect";
        li.textContent = `${i+1}. ${quiz[i].prompt} → ${quiz[i].answer}`;
        items.push(li);
      });

      const elapsed = (performance.now() - startTime)/1000;
      const penalty = (quiz.length - correct) * PENALTY_SECONDS;
      const finalTime = elapsed + penalty;

      const summary = document.createElement("div");
      summary.className = "result-summary";
      summary.innerHTML = [
        `<div class="final-time">🏁 Final Time: ${finalTime.toFixed(1)}s</div>`,
        `<div class="line">✅ Correct: ${correct}/${quiz.length}</div>`,
        penalty>0 ? `<div class="line">⏱️ Penalty: +${penalty}s (${PENALTY_SECONDS}s per incorrect)</div>` : ``
      ].join("");

      const ul = document.createElement("ul");
      items.forEach(li => ul.appendChild(li));
      results.innerHTML = "";
      results.appendChild(summary);
      results.appendChild(ul);

      $("#back-button").style.display = "inline-block";
      $("#back-button").onclick = ()=>{
        $("#game").style.display = "none";
        $("#level-list").style.display = "flex";
        $("#results").innerHTML = "";
      };
    };
  }

  function setVoiceBar(quiz){
    const vbar = $("#voice-bar");
    if (VOICE.enabled) {
      vbar.style.display = "flex";
      $("#read-all").onclick = () => {
        let i = 0;
        const items = quiz.map(q => q.prompt);
        const langs = quiz.map(q => q.speakLang);
        const next = () => {
          if (i >= items.length) return;
          VOICE.speak(items[i], langs[i]);
          i++; setTimeout(next, 1700);
        };
        next();
      };
    } else vbar.style.display = "none";
  }

  // -------------------- TIMER --------------------
  function startTimer(){
    startTime = performance.now();
    $("#timer").textContent = "Time: 0.0s";
    clearInterval(timerId);
    timerId = setInterval(()=>{
      const e = (performance.now() - startTime)/1000;
      $("#timer").textContent = `Time: ${e.toFixed(1)}s`;
    }, 100);
  }
  function stopTimer(){ clearInterval(timerId); }

  // -------------------- HELPERS --------------------
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
  function capFirst(s){ return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function enSubject(en){
    // Collapse display tags
    if (en==="you (sg.)" || en==="you (pl.)") return "you";
    return en;
  }
  function enAuxDo(en){ return (en==="he"||en==="she") ? "does" : "do"; }
  function enAuxDoQ(en){ return (en==="he"||en==="she") ? "Does" : "Do"; }

  function englishBase(vk){
    switch(vk){
      case "sein": return "be";
      case "haben": return "have";
      case "gehen": return "go";
      case "kommen": return "come";
      case "machen": return "make";
      case "spielen": return "play";
      case "lernen": return "learn";
      case "wohnen": return "live";
      case "sprechen": return "speak";
      case "essen": return "eat";
      case "trinken": return "drink";
    }
    return vk;
  }
  function english3rd(vk){
    const base = englishBase(vk);
    if (base === "have") return "has";
    if (base === "go") return "goes";
    if (base.endsWith("y")) return base.slice(0,-1)+"ies";
    return base + "s";
  }
  function englishPast(vk){
    switch(vk){
      case "sein": return "was";
      case "haben": return "had";
      case "gehen": return "went";
      case "kommen": return "came";
      case "machen": return "made";
      case "spielen": return "played";
      case "lernen": return "learned";
      case "wohnen": return "lived";
      case "sprechen": return "spoke";
      case "essen": return "ate";
      case "trinken": return "drank";
    }
    return englishBase(vk) + "ed";
  }

  // Normalize for marking:
  // - lower-case
  // - collapse spaces
  // - umlaut/ß folding: ä->ae, ö->oe, ü->ue, ß->ss
  function norm(s){
    const map = { "ä":"ae","ö":"oe","ü":"ue","ß":"ss" };
    return (s||"")
      .trim()
      .toLowerCase()
      .replace(/\s+/g," ")
      .replace(/[äöüß]/g, m => map[m]);
  }

  // For questions, require trailing "?"
  function isCorrect(given, expected){
    const gRaw = (given||"").trim();
    const eRaw = (expected||"").trim();
    const g = norm(gRaw);
    const e = norm(eRaw);

    const isQ = /\?$/.test(eRaw);
    if (isQ) {
      if (!/\?$/.test(gRaw)) return false; // must include final ?
      const gCore = norm(gRaw.slice(0, -1));
      const eCore = norm(eRaw.slice(0, -1));
      return gCore === eCore;
    }
    return g === e;
  }

})();
