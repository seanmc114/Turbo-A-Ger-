// Turbo: A+ Edition — German (fits your original A+ HTML/CSS exactly)
// - Directions: EN→DE and DE→EN (two level buttons in #level-list)
// - Tenses: Present, Past (Präteritum), Future (werden + INF)
// - Pronouns required in German
// - Marking: case-insensitive; ä/ö/ü/ß ≡ ae/oe/ue/ss; spaces collapsed
// - For questions, a final "?" is required (no leading symbol needed)
// - Per-question 🔊 (TTS) and 🎤 (speech recognition)

(()=>{
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  // ---- CONFIG ----
  const QUESTIONS_PER_RUN = 10;
  const PENALTY_SECONDS = 30;
  const DIRS = { EN2DE:"EN→DE", DE2EN:"DE→EN" };

  let direction = "EN2DE";
  let currentTense = "Present";
  let startTime = 0, timerId = null, quiz = [];

  // Persons (7 slots to match your usual pattern)
  const PERSONS = [
    { en:"I",        de:"ich" },
    { en:"you",      de:"du"  },     // (sg)
    { en:"he",       de:"er"  },
    { en:"she",      de:"sie" },
    { en:"we",       de:"wir" },
    { en:"you (pl)", de:"ihr" },
    { en:"they",     de:"sie" }
  ];

  // Verb DB: present + präteritum; future = werden + INF
  // Each array: [ich, du, er, sie, wir, ihr, sie(pl)]
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
  const VERB_KEYS = Object.keys(DB);

  // ---- Voice (TTS) ----
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
    speak(text, which='en'){
      if(!this.on || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      const voice = which==='de' ? (this.de||this.en) : (this.en||this.de);
      if(voice) u.voice = voice;
      u.lang = voice?.lang || (which==='de' ? 'de-DE' : 'en-GB');
      try { speechSynthesis.cancel(); } catch(e){}
      speechSynthesis.speak(u);
    }
  };
  VOICE.init();

  // ---- Mic (ASR) ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const srOK = !!SR;

  // ---- Hook up your existing tense buttons / level list / game shell ----
  // (Keep your current index.html + style.css unchanged)  :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

  // Tense buttons
  $$("#tense-buttons .tense-button").forEach(btn=>{
    btn.onclick = ()=>{
      $$("#tense-buttons .tense-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTense = btn.dataset.tense || "Present";
      renderLevelList(); // updates the best-time line for that tense
    };
  });

  // Level list: just two starts (EN→DE, DE→EN) to match A+ simplicity
  function renderLevelList(){
    const box = $("#level-list");
    box.innerHTML = "";

    const b1 = document.createElement("button");
    b1.className = "level-btn";
    b1.textContent = `Start ${DIRS.EN2DE}`;
    b1.onclick = ()=>{ direction="EN2DE"; startRun(); };

    const b2 = document.createElement("button");
    b2.className = "level-btn";
    b2.textContent = `Start ${DIRS.DE2EN}`;
    b2.onclick = ()=>{ direction="DE2EN"; startRun(); };

    box.appendChild(b1);
    box.appendChild(b2);

    // Best times line (per tense+direction)
    const best = document.createElement("div");
    best.style.color = "#666";
    best.style.fontSize = "0.95rem";
    best.textContent = `Best — ${DIRS.EN2DE}: ${fmtBest(getBest(currentTense,"EN2DE"))} | ${DIRS.DE2EN}: ${fmtBest(getBest(currentTense,"DE2EN"))}`;
    box.appendChild(best);
  }
  renderLevelList();

  // ---- Run build ----
  function startRun(){
    $("#results").innerHTML = "";
    $("#questions").innerHTML = "";
    $("#game").style.display = "block";
    $("#back-button").style.display = "none";
    quiz = makeQuiz();
    renderQuestions(quiz);
    attachSubmit();
    startTimer();
  }

  function makeQuiz(){
    const pool = [];
    const kinds = ["pos","neg","q"]; // positive / negative / question
    VERB_KEYS.forEach(vk=>{
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

    // GERMAN
    let dePos, deNeg, deQ;
    if (currentTense==="Present"){
      const f=V.present[pi]; dePos=`${deS} ${f}`; deNeg=`${deS} ${f} nicht`; deQ=`${cap(f)} ${deS}?`;
    } else if (currentTense==="Past"){
      const f=V.past[pi]; dePos=`${deS} ${f}`; deNeg=`${deS} ${f} nicht`; deQ=`${cap(f)} ${deS}?`;
    } else {
      const W=["werde","wirst","wird","wird","werden","werdet","werden"][pi];
      dePos=`${deS} ${W} ${V.inf}`; deNeg=`${deS} ${W} nicht ${V.inf}`; deQ=`${cap(W)} ${deS} ${V.inf}?`;
    }

    // ENGLISH
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

    // Direction decides prompt & answer + read language
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

  function renderQuestions(items){
    const host = $("#questions");
    items.forEach((q,i)=>{
      const row = document.createElement("div");
      const prompt = document.createElement("div");
      prompt.textContent = `${i+1}. ${q.prompt}`;

      // inline 🔊 + 🎤 (keeps your A+ layout compact)
      const readBtn = document.createElement("button");
      readBtn.textContent = "🔊";
      readBtn.style.marginLeft = "6px";
      readBtn.title = "Read this";
      readBtn.onclick = ()=> VOICE.speak(q.prompt, q.readLang);

      const micBtn = document.createElement("button");
      micBtn.textContent = "🎤";
      micBtn.style.marginLeft = "6px";
      micBtn.title = srOK ? "Dictate your answer" : "Speech recognition not supported";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = direction==="EN2DE"
        ? (q.kind==="q" ? "z.B. Gehe ich?" : "z.B. ich gehe / ich gehe nicht")
        : (q.kind==="q" ? "e.g. Do I go?" : "e.g. I go / I do not go");

      if (srOK){
        micBtn.onclick = ()=>{
          const rec = new SR(); rec.lang = (direction==="EN2DE") ? "de-DE" : "en-GB";
          rec.interimResults = false; rec.maxAlternatives = 1;
          micBtn.disabled = true; micBtn.textContent = "⏺️…";
          rec.onresult = e => { input.value = e.results[0][0].transcript || ""; };
          rec.onerror = ()=>{};
          rec.onend = ()=>{ micBtn.disabled=false; micBtn.textContent="🎤"; };
          try{ rec.start(); } catch(e){ micBtn.disabled=false; micBtn.textContent="🎤"; }
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
      const res = $("#results"); res.innerHTML = "";

      inputs.forEach((inp,i)=>{
        const ok = isCorrect(inp.value, quiz[i].answer);
        if (ok) correct++;
        inp.classList.remove("good","bad");
        inp.classList.add(ok ? "good" : "bad");

        const line = document.createElement("div");
        line.className = "row " + (ok ? "ok" : "no");
        line.textContent = `${i+1}. ${quiz[i].prompt}  →  ${quiz[i].answer}`;
        res.appendChild(line);
      });

      const elapsed = (performance.now()-startTime)/1000;
      const penalty = (quiz.length - correct) * PENALTY_SECONDS;
      const finalTime = elapsed + penalty;

      const summary = document.createElement("div");
      summary.className = "summary";
      summary.innerHTML = `<strong>🏁 Final Time: ${finalTime.toFixed(1)}s</strong>
                           <div class="line">✅ Correct: ${correct}/${quiz.length}</div>
                           ${penalty>0 ? `<div class="line">⏱️ Penalty: +${penalty}s (${PENALTY_SECONDS}s each)</div>` : ""}`;
      res.prepend(summary);

      // best per tense+direction
      const prev = getBest(currentTense, direction);
      if (prev==null || finalTime < prev) saveBest(currentTense, direction, finalTime);

      $("#back-button").style.display = "inline-block";
      $("#back-button").onclick = ()=>{
        $("#game").style.display = "none";
        $("#results").innerHTML = "";
      };
    };
  }

  // ---- Timer ----
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

  // ---- Helpers ----
  function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } }
  function cap(s){ return s? s[0].toUpperCase()+s.slice(1):s; }
  function capWord(s){ return s? s[0].toUpperCase()+s.slice(1):s; }
  function capFirst(s){ return s? s[0].toUpperCase()+s.slice(1):s; }
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
      default: return enBase(vk) + "ed";
    }
  }

  // Normalizer (German-friendly): lower; spaces; ä/ö/ü/ß folding
  function normDE(s){
    const map = { "ä":"ae", "ö":"oe", "ü":"ue", "ß":"ss" };
    return (s||"").trim().toLowerCase().replace(/\s+/g," ").replace(/[äöüß]/g, m=>map[m]);
  }

  // Marking with required "?" for questions
  function isCorrect(given, expected){
    const gRaw=(given||"").trim(), eRaw=(expected||"").trim();
    const isQ = /\?$/.test(eRaw);
    if (isQ){
      if (!/\?$/.test(gRaw)) return false;
      return normDE(gRaw.slice(0,-1)) === normDE(eRaw.slice(0,-1));
    }
    return normDE(gRaw) === normDE(eRaw);
  }

  // Best-time per tense+direction (A+)
  function bestKey(tense, dir){ return `turbo_aplus_best_${tense}_${dir}`; }
  function getBest(tense, dir){ const v = localStorage.getItem(bestKey(tense, dir)); return v? parseFloat(v) : null; }
  function saveBest(tense, dir, val){ localStorage.setItem(bestKey(tense, dir), String(val)); }
  function fmtBest(v){ return v==null ? "—" : v.toFixed(1)+"s"; }

})();
