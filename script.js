// Turbo: A+ Edition — German (EN↔DE) with 10 Levels, unlocks, scroll+feedback fixes
(()=>{
  const $  = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // -------------------- CONFIG --------------------
  const QUESTIONS_PER_RUN = 10;
  const PENALTY_SECONDS   = 30;

  // Unlock targets (seconds) to unlock the NEXT level after finishing THIS one
  const TARGETS = { L2:90, L3:85, L4:80, L5:75, L6:70, L7:65, L8:60, L9:55, L10:50 };

  // Two directions
  const DIRS = { EN2DE: "EN→DE", DE2EN: "DE→EN" };
  let direction    = "EN2DE";
  let currentTense = "Present";
  let currentLevel = "L1";

  let startTime = 0, timerId = null, quiz = [];

  // 10 LEVELS (verb pools)
  const LEVELS = {
    L1:  ["sein","haben","gehen"],
    L2:  ["kommen","machen"],
    L3:  ["spielen","lernen"],
    L4:  ["wohnen","sprechen"],
    L5:  ["essen","trinken"],
    L6:  ["sein","haben","gehen","kommen"],
    L7:  ["machen","spielen","lernen","wohnen"],
    L8:  ["sprechen","essen","trinken"],
    L9:  ["sein","haben","gehen","sprechen","kommen"],
    L10: ["sein","haben","gehen","kommen","machen","spielen","lernen","wohnen","sprechen","essen","trinken"]
  };

  // Persons (7 like your other games)
  const PERSONS = [
    { en:"I",        de:"ich" },
    { en:"you",      de:"du"  },     // (sg)
    { en:"he",       de:"er"  },
    { en:"she",      de:"sie" },
    { en:"we",       de:"wir" },
    { en:"you (pl)", de:"ihr" },
    { en:"they",     de:"sie" }
  ];

  // Verb DB (present + präteritum; future = werden + INF)
  // Arrays: [ich, du, er, sie, wir, ihr, sie(pl)]
  const DB = {
    sein:    { inf:"sein",    present:["bin","bist","ist","ist","sind","seid","sind"],    past:["war","warst","war","war","waren","wart","waren"] },
    haben:   { inf:"haben",   present:["habe","hast","hat","hat","haben","habt","haben"], past:["hatte","hattest","hatte","hatte","hatten","hattet","hatten"] },
    gehen:   { inf:"gehen",   present:["gehe","gehst","geht","geht","gehen","geht","gehen"], past:["ging","gingst","ging","ging","gingen","gingt","gingen"] },
    kommen:  { inf:"kommen",  present:["komme","kommst","kommt","kommt","kommen","kommt","kommen"], past:["kam","kamst","kam","kam","kamen","kamt","kamen"] },
    machen:  { inf:"machen",  present:["mache","machst","macht","macht","machen","macht","machen"], past:["machte","machtest","machte","machte","machten","machtet","machten"] },
    spielen: { inf:"spielen", present:["spiele","spielst","spielt","spielt","spielen","spielt","spielen"], past:["spielte","spieltest","spielte","spielte","spielten","spieltet","spielten"] },
    lernen:  { inf:"lernen",  present:["lerne","lernst","lernt","lernt","lernen","lernt","lernen"], past:["lernte","lerntest","lernte","lernte","lernten","lerntet","lernten"] },
    wohnen:  { inf:"wohnen",  present:["wohne","wohnst","wohnt","wohnt","wohnen","wohnt","wohnen"], past:["wohnte","wohntest","wohnte","wohnte","wohnten","wohntet","wohnten"] },
    sprechen:{ inf:"sprechen",present:["spreche","sprichst","spricht","spricht","sprechen","sprecht","sprechen"], past:["sprach","sprachst","sprach","sprach","sprachen","spracht","sprachen"] },
    essen:   { inf:"essen",   present:["esse","isst","isst","isst","essen","esst","essen"], past:["aß","aßest","aß","aß","aßen","aßt","aßen"] },
    trinken: { inf:"trinken", present:["trinke","trinkst","trinkt","trinkt","trinken","trinkt","trinken"], past:["trank","trankst","trank","trank","tranken","trankt","tranken"] }
  };

  // -------------------- VOICE (TTS) --------------------
  const VOICE = {
    on: 'speechSynthesis' in window,
    en: null, de: null,
    init(){
      if(!this.on) return;
      const pick=()=>{
        const v = speechSynthesis.getVoices();
        this.en = v.find(x=>/^en[-_]/i.test(x.lang)) || v.find(x=>/en/i.test(x.lang)) || v[0] || null;
        this.de = v.find(x=>/^de[-_]/i.test(x.lang)) || v.find(x=>/german/i.test(x.name)) || this.en;
      };
      pick(); window.speechSynthesis.onvoiceschanged = pick;
    },
    speak(text, lang='en'){
      if(!this.on || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      const voice = lang==='de' ? (this.de||this.en) : (this.en||this.de);
      if(voice) u.voice = voice;
      u.lang = voice?.lang || (lang==='de' ? 'de-DE' : 'en-GB');
      try { speechSynthesis.cancel(); } catch(e){}
      speechSynthesis.speak(u);
    }
  };
  VOICE.init();

  // -------------------- MIC (ASR) --------------------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srOK = !!SR;

  // -------------------- HOOK UI --------------------
  // Tense buttons
  $$("#tense-buttons .tense-button").forEach(btn=>{
    btn.onclick = ()=>{
      $$("#tense-buttons .tense-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTense = btn.dataset.tense || "Present";
      renderLevelList();
    };
  });

  // --- Unlock state ---
  const UNLOCK_KEY = lvl => `turbo_aplus_unlock_${lvl}`;
  function isUnlocked(lvl){
    if (lvl==="L1") return true; // only L1 open initially
    return localStorage.getItem(UNLOCK_KEY(lvl)) === "1";
  }
  function unlock(lvl){ localStorage.setItem(UNLOCK_KEY(lvl), "1"); }

  // Level + direction UI
  function renderLevelList(){
    const host = $("#level-list");
    host.innerHTML = "";

    // Direction row
    const dirRow = document.createElement("div");
    dirRow.style.display = "flex";
    dirRow.style.gap = "8px";
    dirRow.style.justifyContent = "center";
    const d1 = document.createElement("button");
    d1.className = "level-btn";
    d1.textContent = DIRS.EN2DE + (direction==="EN2DE" ? " ✓":"");
    d1.onclick = ()=>{ direction="EN2DE"; renderLevelList(); };
    const d2 = document.createElement("button");
    d2.className = "level-btn";
    d2.textContent = DIRS.DE2EN + (direction==="DE2EN" ? " ✓":"");
    d2.onclick = ()=>{ direction="DE2EN"; renderLevelList(); };
    dirRow.appendChild(d1); dirRow.appendChild(d2);
    host.appendChild(dirRow);

    // Grid of 10 levels
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fit, minmax(180px, 1fr))";
    grid.style.gap = "10px";
    grid.style.marginTop = "10px";

    Object.keys(LEVELS).forEach((lvl, idx)=>{
      const btn = document.createElement("button");
      btn.className = "level-btn";
      const best = getBest(currentTense, direction, lvl);
      const locked = !isUnlocked(lvl);
      btn.disabled = locked;
      const label = locked
        ? `${lvl} 🔒  (Beat ${TARGETS[lvl]||'—'}s in ${prevOf(lvl)} to unlock)`
        : `${lvl} — Best: ${fmtBest(best)}`;
      btn.textContent = label;
      btn.onclick = ()=>{ if (!locked){ currentLevel = lvl; startRun(); } };
      grid.appendChild(btn);
    });
    host.appendChild(grid);
  }
  renderLevelList();

  function prevOf(lvl){
    // returns the level that unlocks 'lvl'
    const order = Object.keys(LEVELS);
    const i = order.indexOf(lvl);
    return i>0 ? order[i-1] : "L1";
  }

  // -------------------- QUIZ BUILD --------------------
  function startRun(){
    $("#results").innerHTML = "";
    $("#questions").innerHTML = "";
    $("#game").style.display = "block";
    $("#back-button").style.display = "none";

    // force scrolling ON (in case any stylesheet disables it)
    document.documentElement.style.overflowY = 'auto';
    document.body.style.overflowY = 'auto';

    quiz = makeQuizFor(currentLevel);
    renderQuestions(quiz);
    attachSubmit();

    // make sure Q1 is visible + focused and page starts at the top
    try { window.scrollTo({ top: 0, behavior: "instant" }); } catch(e){ window.scrollTo(0,0); }
    const firstInput = $("#questions input");
    if (firstInput){ firstInput.focus(); firstInput.scrollIntoView({block:"start"}); }

    startTimer();
  }

  function makeQuizFor(levelKey){
    const pool = [];
    const verbs = LEVELS[levelKey] || LEVELS.L1;
    const kinds = ["pos","neg","q"];
    verbs.forEach(vk=>{
      for (let pi=0; pi<PERSONS.length; pi++){
        kinds.forEach(k=> pool.push(buildItem(vk, pi, k)));
      }
    });
    shuffle(pool);
    return pool.slice(0, QUESTIONS_PER_RUN);
  }

  function buildItem(vk, pi, kind){
    const V = DB[vk], P = PERSONS[pi];
    const enS = normalizeSubject(P.en), deS = P.de;

    // ----- German targets -----
    let dePos, deNeg, deQ;
    if (currentTense==="Present"){
      const f=V.present[pi]; dePos=`${deS} ${f}`; deNeg=`${deS} ${f} nicht`; deQ=`${cap(f)} ${deS}?`;
    } else if (currentTense==="Past"){
      const f=V.past[pi]; dePos=`${deS} ${f}`; deNeg=`${deS} ${f} nicht`; deQ=`${cap(f)} ${deS}?`;
    } else {
      const W=["werde","wirst","wird","wird","werden","werdet","werden"][pi];
      dePos=`${deS} ${W} ${V.inf}`; deNeg=`${deS} ${W} nicht ${V.inf}`; deQ=`${cap(W)} ${deS} ${V.inf}?`;
    }

    // ----- English targets -----
    const base = enBase(vk), past=enPast(vk), third=is3(enS);
    let enPos,enNeg,enQ;
    if (currentTense==="Present"){
      enPos = `${enS} ${third?thirdForm(base):base}`;
      enNeg = `${enS} ${third?"does":"do"} not ${base}`;
      enQ   = `${third?"Does":"Do"} ${enS} ${base}?`;
    } else if (currentTense==="Past"){
      enPos = `${enS} ${past}`;
      enNeg = `${enS} did not ${base}`;
      enQ   = `Did ${enS} ${base}?`;
    } else {
      enPos = `${enS} will ${base}`;
      enNeg = `${enS} will not ${base}`;
      enQ   = `Will ${enS} ${base}?`;
    }

    // Direction decides prompt / answer + TTS language
    let prompt, answer, readLang = (direction==="EN2DE") ? "en" : "de";
    if (direction==="EN2DE"){
      if(kind==="pos"){prompt=enPos; answer=dePos;}
      if(kind==="neg"){prompt=enNeg; answer=deNeg;}
      if(kind==="q"){  prompt=enQ;   answer=deQ;}
    } else {
      if(kind==="pos"){prompt=dePos; answer=enPos;}
      if(kind==="neg"){prompt=deNeg; answer=enNeg;}
      if(kind==="q"){  prompt=deQ;   answer=enQ;}
    }
    return {prompt, answer, kind, readLang};
  }

  // -------------------- RENDER --------------------
  function renderQuestions(items){
    const host = $("#questions");
    items.forEach((q,i)=>{
      const row = document.createElement("div");

      // prompt line + tiny buttons (🔊/🎤)
      const prompt = document.createElement("div");
      prompt.style.display = "flex";
      prompt.style.alignItems = "center";
      prompt.style.justifyContent = "center";
      prompt.style.gap = "6px";
      prompt.textContent = `${i+1}. ${q.prompt}`;

      const readBtn = document.createElement("button");
      readBtn.textContent = "🔊";
      readBtn.className = "icon";
      readBtn.title = "Read this";
      readBtn.onclick = ()=> VOICE.speak(q.prompt, q.readLang);

      const micBtn = document.createElement("button");
      micBtn.textContent = "🎤";
      micBtn.className = "icon";
      micBtn.title = srOK ? "Dictate your answer" : "Speech recognition not supported";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = direction==="EN2DE"
        ? (q.kind==="q" ? "z.B. Gehe ich?" : "z.B. ich gehe / ich gehe nicht")
        : (q.kind==="q" ? "e.g. Do I go?" : "e.g. I go / I do not go");

      if (srOK){
        micBtn.onclick = ()=>{
          const rec = new (window.SpeechRecognition||window.webkitSpeechRecognition)();
          rec.lang = (direction==="EN2DE") ? "de-DE" : "en-GB";
          rec.interimResults = false; rec.maxAlternatives = 1;
          micBtn.disabled = true; micBtn.textContent = "⏺️…";
          rec.onresult = e => { input.value = e.results[0][0].transcript || ""; };
          rec.onerror = ()=>{};
          rec.onend = ()=>{ micBtn.disabled=false; micBtn.textContent="🎤"; };
          try{ rec.start(); }catch(e){ micBtn.disabled=false; micBtn.textContent="🎤"; }
        };
      } else micBtn.disabled = true;

      prompt.appendChild(readBtn);
      prompt.appendChild(micBtn);

      row.appendChild(prompt);
      row.appendChild(input);
      host.appendChild(row);
    });
  }

  function attachSubmit(){
    $("#submit").onclick = ()=>{
      stopTimer();
      const inputs = $$("#questions input");
      let correct = 0;

      // Vertical feedback list (UL > LI)
      const results = $("#results");
      results.innerHTML = "";
      const ul = document.createElement("ul");

      inputs.forEach((inp,i)=>{
        const ok = isCorrect(inp.value, quiz[i].answer);
        if (ok) correct++;
        inp.classList.remove("good","bad");
        inp.classList.add(ok ? "good" : "bad");

        const li = document.createElement("li");
        li.className = ok ? "correct" : "incorrect";
        li.textContent = `${i+1}. ${quiz[i].prompt} → ${quiz[i].answer}`;
        ul.appendChild(li);
      });

      const elapsed = (performance.now()-startTime)/1000;
      const penalty = (quiz.length - correct) * PENALTY_SECONDS;
      const finalTime = elapsed + penalty;

      const summary = document.createElement("div");
      summary.className = "summary";
      summary.innerHTML = `<strong>🏁 Final Time: ${finalTime.toFixed(1)}s</strong>
                           <div class="line">✅ Correct: ${correct}/${quiz.length}</div>
                           ${penalty>0 ? `<div class="line">⏱️ Penalty: +${penalty}s (${PENALTY_SECONDS}s each)</div>` : ""}`;

      results.appendChild(summary);
      results.appendChild(ul);

      // Save best for this tense+direction+level
      const prev = getBest(currentTense, direction, currentLevel);
      if (prev==null || finalTime < prev) saveBest(currentTense, direction, currentLevel, finalTime);

      // Unlock next level if target met
      const nextLevel = nextOf(currentLevel);
      const target = TARGETS[nextLevel];
      if (nextLevel && target && finalTime <= target) {
        unlock(nextLevel);
      }

      $("#back-button").style.display = "inline-block";
      $("#back-button").onclick = ()=>{
        $("#game").style.display = "none";
        $("#results").innerHTML = "";
        renderLevelList(); // refresh locks/best times
      };
    };
  }

  // -------------------- TIMER --------------------
  function startTimer(){
    startTime = performance.now();
    $("#timer").textContent = "Time: 0.0s";
    clearInterval(timerId);
    timerId = setInterval(()=>{
      const e = (performance.now()-startTime)/1000;
      $("#timer").textContent = `Time: ${e.toFixed(1)}s`;
    }, 100);
  }
  function stopTimer(){ clearInterval(timerId); }

  // -------------------- HELPERS --------------------
  function nextOf(lvl){
    const order = Object.keys(LEVELS);
    const i = order.indexOf(lvl);
    return (i>=0 && i<order.length-1) ? order[i+1] : null;
  }
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
  function cap(s){ return s ? s[0].toUpperCase()+s.slice(1) : s; }
  function normalizeSubject(s){ return s==="you (pl)" ? "you" : s; }
  function is3(s){ return s==="he"||s==="she"||s==="it"; }
  function thirdForm(base){ if(base==="have")return"has"; if(base==="go")return"goes"; if(base.endsWith("y"))return base.slice(0,-1)+"ies"; return base+"s"; }
  function enBase(vk){
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
      default: return vk;
    }
  }
  function enPast(vk){
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
      default: return enBase(vk)+"ed";
    }
  }

  // Marking: lower-case, collapse spaces, fold ä/ö/ü/ß; require "?" if expected has it
  function normDE(s){
    const map = { "ä":"ae","ö":"oe","ü":"ue","ß":"ss" };
    return (s||"").trim().toLowerCase().replace(/\s+/g," ").replace(/[äöüß]/g, m=>map[m]);
  }
  function isCorrect(given, expected){
    const gRaw=(given||"").trim(), eRaw=(expected||"").trim();
    const isQ = /\?$/.test(eRaw);
    if (isQ){
      if (!/\?$/.test(gRaw)) return false;
      return normDE(gRaw.slice(0,-1)) === normDE(eRaw.slice(0,-1));
    }
    return normDE(gRaw) === normDE(eRaw);
  }

  // Best time storage — per tense + direction + level
  function bestKey(tense, dir, lvl){ return `turbo_aplus_best_${tense}_${dir}_${lvl}`; }
  function getBest(tense, dir, lvl){ const v = localStorage.getItem(bestKey(tense, dir, lvl)); return v? parseFloat(v) : null; }
  function saveBest(tense, dir, lvl, score){ localStorage.setItem(bestKey(tense, dir, lvl), String(score)); }
  function fmtBest(v){ return v==null ? "—" : v.toFixed(1)+"s"; }
})();
