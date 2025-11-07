// Turbo: A+ Edition — GERMAN (EN↔DE) with Mic + Read + High Scores
// Works with the provided A+ index.html/style.css (no edits needed)

(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // -------------------- CONFIG --------------------
  const QUESTIONS_PER_RUN = 10;
  const PENALTY_SECONDS = 30;

  const DIRS = { EN2DE: "EN→DE", DE2EN: "DE→EN" };
  let direction = "EN2DE";
  let currentTense = "Present";
  let startTime = 0, timerId = null, currentQuiz = [];

  // Persons (7 slots like your other games)
  const PERSONS = [
    { en: "I",        de: "ich" },
    { en: "you",      de: "du"  },           // you (sg.)
    { en: "he",       de: "er"  },
    { en: "she",      de: "sie" },
    { en: "we",       de: "wir" },
    { en: "you (pl)", de: "ihr" },
    { en: "they",     de: "sie" }
  ];

  // Verb DB: Present & Präteritum (Past). Future = werden + INF.
  // Arrays are [ich, du, er, sie, wir, ihr, sie(pl)]
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
      past:   ["aß","aßest","aß","aß","aßen","aßt","aßen"] // 'ss' accepted via normalizer
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
        this.german  = voices.find(v=>/^de[-_]/i.test(v.lang)) || voices.find(v=>/german/i.test(v.name)) || this.english;
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
  // Title stays: "Turbo: A+ Edition"
  // Build the two level buttons in #level-list
  function renderLevelList(){
    const host = $("#level-list");
    host.innerHTML = "";

    const en2deBtn = document.createElement("button");
    en2deBtn.className = "level-btn";
    en2deBtn.textContent = `Start ${DIRS.EN2DE}`;
    en2deBtn.onclick = ()=>{ direction = "EN2DE"; startRun(); };

    const de2enBtn = document.createElement("button");
    de2enBtn.className = "level-btn";
    de2enBtn.textContent = `Start ${DIRS.DE2EN}`;
    de2enBtn.onclick = ()=>{ direction = "DE2EN"; startRun(); };

    host.appendChild(en2deBtn);
    host.appendChild(de2enBtn);

    // Show best times per direction for the currently selected tense
    const bestWrap = document.createElement("div");
    bestWrap.style.marginTop = "6px";
    const b1 = getBest(currentTense, "EN2DE");
    const b2 = getBest(currentTense, "DE2EN");
    bestWrap.textContent = `Best — ${DIRS.EN2DE}: ${fmtBest(b1)}   |   ${DIRS.DE2EN}: ${fmtBest(b2)}`;
    host.appendChild(bestWrap);
  }
  renderLevelList();

  // Tense buttons
  $$("#tense-buttons .tense-button").forEach(btn=>{
    btn.onclick = ()=>{
      $$("#tense-buttons .tense-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTense = btn.dataset.tense || "Present";
      renderLevelList(); // refresh bests display for that tense
    };
  });

  // -------------------- QUIZ BUILD --------------------
  function startRun(){
    $("#results").innerHTML = "";
    $("#game").style.display = "block";
    $("#back-button").style.display = "none";
    $("#questions").innerHTML = "";

    currentQuiz = makeQuiz();
    renderQuestions(currentQuiz);
    attachSubmit(currentQuiz);
    startTimer();
  }

  function makeQuiz(){
    const items = [];
    const kinds = ["pos","neg","q"]; // positive / negative / question
    // Make a big pool, then sample 10
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
    const en = normalizeSubject(person.en); // for English side
    const de = person.de;                    // for German side

    // GERMAN answers
    let dePos="", deNeg="", deQ="";
    if (currentTense === "Present"){
      const f = verb.present[personIndex];
      dePos = `${de} ${f}`;
      deNeg = `${de} ${f} nicht`;
      deQ   = `${capFirst(f)} ${de}?`;
    } else if (currentTense === "Past"){
      const f = verb.past[personIndex];
      dePos = `${de} ${f}`;
      deNeg = `${de} ${f} nicht`;
      deQ   = `${capFirst(f)} ${de}?`;
    } else {
      const werdenForms = ["werde","wirst","wird","wird","werden","werdet","werden"];
      const w = werdenForms[personIndex];
      dePos = `${de} ${w} ${verb.inf}`;
      deNeg = `${de} ${w} nicht ${verb.inf}`;
      deQ   = `${capFirst(w)} ${de} ${verb.inf}?`;
    }

    // ENGLISH answers
    const base = englishBase(verbKey);
    const past = englishPast(verbKey);
    const third = isThird(en);
    let enPos="", enNeg="", enQ="";
    if (currentTense === "Present"){
      enPos = `${en} ${third ? thirdForm(base) : base}`;
      enNeg = `${en} ${third ? "does" : "do"} not ${base}`;
      enQ   = `${third ? "Does" : "Do"} ${en} ${base}?`;
    } else if (currentTense === "Past"){
      enPos = `${en} ${past}`;
      enNeg = `${en} did not ${base}`;
      enQ   = `Did ${en} ${base}?`;
    } else {
      enPos = `${en} will ${base}`;
      enNeg = `${en} will not ${base}`;
      enQ   = `Will ${en} ${base}?`;
    }

    // Direction decides prompt vs expected and read language
    let prompt="", answer="", readLang = (direction==="EN2DE" ? "en" : "de");
    if (direction === "EN2DE"){
      if (kind==="pos"){ prompt = enPos; answer = dePos; }
      if (kind==="neg"){ prompt = enNeg; answer = deNeg; }
      if (kind==="q"){   prompt = enQ;   answer = deQ;   }
    } else {
      if (kind==="pos"){ prompt = dePos; answer = enPos; }
      if (kind==="neg"){ prompt = deNeg; answer = enNeg; }
      if (kind==="q"){   prompt = deQ;   answer = enQ;   }
    }

    return { verbKey, personIndex, kind, prompt, answer, readLang };
  }

  function renderQuestions(quiz){
    const wrap = $("#questions");
    quiz.forEach((q,i)=>{
      const row = document.createElement("div");
      const label = document.createElement("div");

      // prompt + tiny read/mic buttons inline (keeps A+ look)
      const readBtn = document.createElement("button");
      readBtn.textContent = "🔊";
      readBtn.style.marginLeft = "6px";
      readBtn.title = "Read this";
      readBtn.onclick = ()=> VOICE.speak(q.prompt, q.readLang);

      const micBtn = document.createElement("button");
      micBtn.textContent = "🎤";
      micBtn.style.marginLeft = "6px";
      micBtn.title = srSupported ? "Dictate your answer" : "Speech recognition not supported";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = (direction==="EN2DE")
        ? (q.kind==="q" ? "z.B. Gehe ich?" : "z.B. ich gehe / ich gehe nicht")
        : (q.kind==="q" ? "e.g. Do I go?" : "e.g. I go / I do not go");

      if (srSupported) {
        micBtn.onclick = ()=>{
          const rec = new SR();
          rec.lang = (direction==="EN2DE") ? "de-DE" : "en-GB";
          rec.interimResults = false; rec.maxAlternatives = 1;
          micBtn.disabled = true; micBtn.textContent = "⏺️…";
          rec.onresult = e => { const said = e.results[0][0].transcript || ""; input.value = said; };
          rec.onerror = ()=>{};
          rec.onend = ()=>{ micBtn.disabled=false; micBtn.textContent="🎤"; };
          try { rec.start(); } catch(e) { micBtn.disabled=false; micBtn.textContent="🎤"; }
        };
      } else micBtn.disabled = true;

      label.textContent = `${i+1}. ${q.prompt}`;
      label.appendChild(readBtn);
      label.appendChild(micBtn);
      row.appendChild(label);
      row.appendChild(input);
      wrap.appendChild(row);
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
        if (ok) correct++;
        const line = document.createElement("div");
        line.style.margin = "6px 0";
        line.textContent = `${i+1}. ${quiz[i].prompt}  →  ${quiz[i].answer}`;
        line.style.background = ok ? "rgba(46,204,113,0.15)" : "rgba(231,76,60,0.15)";
        line.style.padding = "6px 8px";
        line.style.borderRadius = "8px";
        items.push(line);
      });

      const elapsed = (performance.now() - startTime)/1000;
      const penalty = (quiz.length - correct) * PENALTY_SECONDS;
      const finalTime = elapsed + penalty;

      const summary = document.createElement("div");
      summary.style.margin = "10px 0";
      summary.innerHTML = `<strong>🏁 Final Time:</strong> ${finalTime.toFixed(1)}s — ✅ ${correct}/${quiz.length}
        ${penalty>0 ? `<div>⏱️ Penalty: +${penalty}s (${PENALTY_SECONDS}s per incorrect)</div>` : ""}`;
      results.prepend(summary);
      items.forEach(li => results.appendChild(li));

      // Save best for this tense+direction
      const prevBest = getBest(currentTense, direction);
      if (prevBest == null || finalTime < prevBest) {
        saveBest(currentTense, direction, finalTime);
      }

      $("#back-button").style.display = "inline-block";
      $("#back-button").onclick = ()=>{
        $("#game").style.display = "none";
        $("#results").innerHTML = "";
      };
    };
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
  function isThird(en){ return en==="he" || en==="she" || en==="it"; }
  function normalizeSubject(en){ return en==="you (pl)" ? "you" : en; }
  function thirdForm(base){
    if (base === "have") return "has";
    if (base === "go") return "goes";
    if (base.endsWith("y")) return base.slice(0,-1)+"ies";
    return base + "s";
  }
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
  function englishPast(vk){
    switch(vk){
      case "sein": return "was"; // (generic singular; OK for quick translation)
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

  // Normalize (German marking):
  // - lowercase
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

  // For questions, the final ? is required (no leading symbol needed)
  function isCorrect(given, expected){
    const gRaw = (given||"").trim();
    const eRaw = (expected||"").trim();

    // In EN→DE mode we’re checking German by default; in DE→EN we compare English.
    // But the same normalization rules are fine for both (no diacritics in EN side).
    const isQ = /\?$/.test(eRaw);
    if (isQ) {
      if (!/\?$/.test(gRaw)) return false; // must end with '?'
      const gCore = normDE(gRaw.slice(0,-1));
      const eCore = normDE(eRaw.slice(0,-1));
      return gCore === eCore;
    }
    return normDE(gRaw) === normDE(eRaw);
  }

  // Best time storage per tense+direction
  function bestKey(tense, dir){ return `turbo_aplus_best_${tense}_${dir}`; }
  function getBest(tense, dir){ const v = localStorage.getItem(bestKey(tense, dir)); return v ? parseFloat(v) : null; }
  function saveBest(tense, dir, score){ localStorage.setItem(bestKey(tense, dir), String(score)); }
  function fmtBest(v){ return v==null ? "—" : v.toFixed(1)+"s"; }

})();
