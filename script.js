// Turbo: A+ Edition — German Translation Game (EN↔DE)
// Fits the provided index.html & style.css
// - Tenses: Present / Past (Präteritum) / Future (werden + INF)
// - Directions: EN→DE and DE→EN (toggle in the UI)
// - Pronouns required in German answers
// - Marking: case-insensitive, ä/ö/ü/ß ≡ ae/oe/ue/ss, spaces collapsed
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

  // Persons (7 slots to match your previous style)
  const PERSONS = [
    { en: "I",      de: "ich"  },
    { en: "you",    de: "du"   },           // you (sg.)
    { en: "he",     de: "er"   },
    { en: "she",    de: "sie"  },
    { en: "we",     de: "wir"  },
    { en: "you(pl)",de: "ihr"  },
    { en: "they",   de: "sie"  }
  ];

  // Verb database: present & präteritum (past) hard-coded for correctness; future = werden + INF
  // Each form array is [ich, du, er, sie, wir, ihr, sie(pl)]
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
      // Using ß forms (accepted as 'ss' too)
      past:   ["aß","aßest","aß","aß","aßen","aßt","aßen"]
    },
    trinken: {
      inf:"trinken",
      present:["trinke","trinkst","trinkt","trinkt","trinken","trinkt","trinken"],
      past:   ["trank","trankst","trank","trank","tranken","trankt","tranken"]
    }
  };

  const VERB_KEYS = Object.keys(DB);

  // -------------------- UI INIT --------------------
  document.title = "Turbo: A+ Edition — German";
  $("h1").innerHTML = `<span class="turbo">Turbo</span> A+ Edition — German`;

  // Build direction buttons inside #level-list
  function renderLevelList(){
    const host = $("#level-list");
    host.innerHTML = "";
    const dirWrap = document.createElement("div");
    dirWrap.style.margin = "12px 0";

    const en2deBtn = document.createElement("button");
    en2deBtn.textContent = `Start ${DIRS.EN2DE}`;
    en2deBtn.className = "level-btn";
    en2deBtn.onclick = ()=>{ direction = "EN2DE"; startRun(); };

    const de2enBtn = document.createElement("button");
    de2enBtn.textContent = `Start ${DIRS.DE2EN}`;
    de2enBtn.className = "level-btn";
    de2enBtn.onclick = ()=>{ direction = "DE2EN"; startRun(); };

    dirWrap.appendChild(en2deBtn);
    dirWrap.appendChild(de2enBtn);
    host.appendChild(dirWrap);
  }
  renderLevelList();

  // Tense buttons
  $$("#tense-buttons .tense-button").forEach(btn=>{
    btn.onclick = ()=>{
      $$("#tense-buttons .tense-button").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTense = btn.dataset.tense || "Present";
    };
  });
  // default active
  const presentBtn = $$("#tense-buttons .tense-button").find(b=>b.dataset.tense==="Present");
  if (presentBtn) presentBtn.classList.add("active");

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
    // Build pool of (verb, personIndex, kind)
    // kind: "pos" | "neg" | "q"
    const kinds = ["pos","neg","q"];

    // Generate a large pool then sample 10
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

    // --- Build German forms for expected answers ---
    let deAnswerPos = "", deAnswerNeg = "", deAnswerQ = "";

    if (currentTense === "Present"){
      const form = verb.present[personIndex];
      deAnswerPos = `${de} ${form}`;
      deAnswerNeg = `${de} ${form} nicht`;
      // Yes/no question: invert verb & subject
      deAnswerQ   = `${capFirst(form)} ${de}?`;
    } else if (currentTense === "Past"){
      const form = verb.past[personIndex];
      deAnswerPos = `${de} ${form}`;
      deAnswerNeg = `${de} ${form} nicht`;
      deAnswerQ   = `${capFirst(form)} ${de}?`;
    } else {
      // Future = werden + INF; negation before INF
      const werden = ["werde","wirst","wird","wird","werden","werdet","werden"][personIndex];
      deAnswerPos = `${de} ${werden} ${verb.inf}`;
      deAnswerNeg = `${de} ${werden} nicht ${verb.inf}`;
      deAnswerQ   = `${capFirst(werden)} ${de} ${verb.inf}?`;
    }

    // --- Build English prompts/answers ---
    const enVerb = englishBase(verbKey);  // infinitive in EN
    const enPast = englishPast(verbKey);
    const en3rd  = english3rd(verbKey);

    let enPrompt = "", enAnswerPos = "", enAnswerNeg = "", enAnswerQ = "";

    if (currentTense === "Present"){
      const goes = en3rd;
      enAnswerPos = `${enSubject(en)} ${en === "he" || en === "she" ? goes : enVerb}`;
      enAnswerNeg = `${enSubject(en)} ${enAuxDo(en)} not ${enVerb}`;
      enAnswerQ   = `${enAuxDoQ(en)} ${enSubject(en)} ${enVerb}?`;
    } else if (currentTense === "Past"){
      enAnswerPos = `${enSubject(en)} ${enPast}`;
      enAnswerNeg = `${enSubject(en)} did not ${enVerb}`;
      enAnswerQ   = `Did ${enSubject(en)} ${enVerb}?`;
    } else {
      enAnswerPos = `${enSubject(en)} will ${enVerb}`;
      enAnswerNeg = `${enSubject(en)} will not ${enVerb}`;
      enAnswerQ   = `Will ${enSubject(en)} ${enVerb}?`;
    }

    // Direction determines prompt vs expected
    let prompt = "", answer = "";
    if (direction === "EN2DE"){
      if (kind==="pos"){ prompt = `${enAnswerPos}`; answer = deAnswerPos; }
      if (kind==="neg"){ prompt = `${enAnswerNeg}`; answer = deAnswerNeg; }
      if (kind==="q"){   prompt = `${enAnswerQ}`;   answer = deAnswerQ;   }
    } else {
      if (kind==="pos"){ prompt = `${deAnswerPos}`; answer = enAnswerPos; }
      if (kind==="neg"){ prompt = `${deAnswerNeg}`; answer = enAnswerNeg; }
      if (kind==="q"){   prompt = `${deAnswerQ}`;   answer = enAnswerQ;   }
    }

    return { verbKey, personIndex, kind, prompt, answer };
  }

  function renderQuestions(quiz){
    const wrap = $("#questions");
    quiz.forEach((q,i)=>{
      const row = document.createElement("div");
      const label = document.createElement("div");
      label.textContent = `${i+1}. ${q.prompt}`;
      label.style.marginTop = "8px";

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = (direction==="EN2DE")
        ? (q.kind==="q" ? "z.B. Gehe ich?" : "z.B. ich gehe / ich gehe nicht")
        : (q.kind==="q" ? "e.g. Do I go?" : "e.g. I go / I do not go");

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
        results.appendChild(line);
      });

      const elapsed = (performance.now() - startTime)/1000;
      const penalty = (quiz.length - correct) * PENALTY_SECONDS;
      const finalTime = elapsed + penalty;

      const summary = document.createElement("div");
      summary.style.margin = "10px 0";
      summary.innerHTML = `<strong>🏁 Final Time:</strong> ${finalTime.toFixed(1)}s — ✅ ${correct}/${quiz.length}
        ${penalty>0 ? `<div>⏱️ Penalty: +${penalty}s (${PENALTY_SECONDS}s per incorrect)</div>` : ""}`;
      results.prepend(summary);

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

  function enSubject(en){
    // keep "you(pl)" as "you" in English answer
    return en === "you(pl)" ? "you" : en;
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
    // 3rd person present
    const base = englishBase(vk);
    if (base === "have") return "has";
    if (base === "go") return "goes";
    if (base === "do") return "does";
    if (base.endsWith("y")) return base.slice(0,-1)+"ies";
    return base + "s";
  }
  function englishPast(vk){
    switch(vk){
      case "sein": return "was";  // first/third singular; prompt/answer generation uses generic without number conflicts
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

  // Normalize strings for marking
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
    const g = norm(given);
    const e = norm(expected);

    const isQ = /\?$/.test(expected.trim());
    if (isQ) {
      if (!/\?$/.test(given.trim())) return false; // must end with "?"
      // compare with "?" kept:
      const gCore = norm(given.trim().slice(0, -1)); // remove final ?
      const eCore = norm(expected.trim().slice(0, -1));
      return gCore === eCore;
    }
    return g === e;
  }

})();
