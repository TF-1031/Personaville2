
let selectedPersona = null;
const exportSelection = new Set();

function el(tag, attrs={}, children=[]){
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if(v===null || v===undefined || v===false) return;
    if(k==="class") node.className=v;
    else if(k==="html") node.innerHTML=v;
    else if(k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k,v===true ? "" : v);
  });
  [].concat(children).forEach(ch=>{
    if(ch===null || ch===undefined) return;
    node.appendChild(typeof ch==="string" ? document.createTextNode(ch) : ch);
  });
  return node;
}

function iconImage(path, alt, context={}, fallbackText="1:1"){
  if(!path) return el("span",{class:"icon-fallback"},[fallbackText]);
  return el("img",{
    src:path,
    alt:alt || "",
    loading:"lazy",
    onerror:(event)=>{
      recordIconLoadFailure(path, context);
      event.currentTarget.parentNode.replaceChildren(el("span",{class:"icon-fallback"},[fallbackText]));
      renderHealth();
    }
  });
}
function iconSlot(path, alt, context){
  return el("div",{class:"icon-slot"},[iconImage(path, alt, context)]);
}
function modifierChip(m){
  return el("span",{class:"chip mod"},[
    m.IconPath ? iconImage(m.IconPath, "", {type:"Modifier", id:m.ModifierID, name:m.ModifierName, file:m.IconFile}, "") : null,
    m.ModifierName
  ]);
}

function renderAll(){
  renderKpis();
  fillFilters();
  renderTiles();
  renderModifiers();
  renderHealth();
  renderBuildSummary();
  renderSourceBanner();
  renderPublishPanel();
  renderEditingStatus();
  renderPersonaEditor();
  renderSpeedOptionEditor();
  fillExportPicker();
  renderExportCartTray();
  document.getElementById("dbStatus").textContent = "Database loaded";
  document.getElementById("dbStatus").className = "pill gray";
  const download = document.getElementById("downloadUpdatedJson");
  if(download) download.disabled = !(DB.loadedFromWorkbook || EditingSession.isEditing);
}
function renderEditingStatus(){
  const status = document.getElementById("editingStatus");
  if(status){
    const dirty = editingHasUnsavedChanges();
    status.textContent = editingStatusText();
    status.className = `pill ${dirty ? "warn" : "ok"}`;
  }
  const state = document.getElementById("editingStateSummary");
  if(state){
    const changes = Object.values(editingSessionState().recordStates || {}).reduce((acc, value) => { acc[value] = (acc[value] || 0) + 1; return acc; }, {});
    state.innerHTML = "";
    state.appendChild(el("div",{class:"status-card kpi"},[el("div",{class:"num"},[editingSessionState().isEditing ? "Active" : "Not started"]), el("div",{class:"label"},["Editing Session"])]));
    state.appendChild(el("div",{class:"status-card kpi"},[el("div",{class:"num"},[String(changes.created || 0)]), el("div",{class:"label"},["Created records"])]));
    state.appendChild(el("div",{class:"status-card kpi"},[el("div",{class:"num"},[String(changes.modified || 0)]), el("div",{class:"label"},["Modified records"])]));
    state.appendChild(el("div",{class:"status-card kpi"},[el("div",{class:"num"},[String(changes.deleted || 0)]), el("div",{class:"label"},["Deleted records"])]));
  }
}

let editorSelectedPersonaID = "";
function personaEditorRows(){
  const q = (document.getElementById("personaEditorSearch")?.value || "").toLowerCase().trim();
  return DB.personas.filter(p => !q || [p.PersonaID,p.PersonaName,p.FamilyGroup,p.PricingSet,p.Status].join(" ").toLowerCase().includes(q));
}
function personaEditorStateClass(p){
  if(String(p.Status || "").toLowerCase() === "deleted") return " deleted";
  const state = editingSessionState().recordStates?.[sheetRecordKey(SHEET_MAP.personas, p, 0)] || "";
  return state ? ` ${state}` : "";
}
function renderPersonaEditor(){
  const list = document.getElementById("personaEditorList");
  const form = document.getElementById("personaEditorForm");
  if(!list || !form) return;
  const rows = personaEditorRows();
  if(!editorSelectedPersonaID && rows[0]) editorSelectedPersonaID = rows[0].PersonaID;
  list.innerHTML = "";
  rows.forEach(p => list.appendChild(el("button",{class:`persona-editor-row${p.PersonaID===editorSelectedPersonaID?" active":""}${personaEditorStateClass(p)}`, type:"button", onclick:()=>{editorSelectedPersonaID=p.PersonaID; renderPersonaEditor();}},[
    el("strong",{},[p.PersonaName || "Untitled"]),
    el("span",{},[`${p.PersonaID || "No ID"} • ${p.Status || "No status"}`])
  ])));
  document.getElementById("personaEditorCount").textContent = `${rows.length} persona${rows.length===1?"":"s"}`;
  renderPersonaEditorForm(DB.personas.find(p => p.PersonaID === editorSelectedPersonaID) || null);
}
function editorField(name, value, errors={}){
  const required = PERSONA_REQUIRED_FIELDS.includes(name);
  const id = `personaEdit-${name}`;
  const input = ["Notes"].includes(name) ? el("textarea",{id, name, rows:"3"},[value || ""]) :
    ["EquipInc","SymSpeed"].includes(name) ? el("select",{id, name},[["TRUE","True"],["FALSE","False"]].map(([v,l])=>el("option",{value:v, selected:String(value).toUpperCase()===v},[l]))) :
    el("input",{id, name, value:value ?? ""});
  return el("label",{class:`editor-field ${errors[name]?"invalid":""}`},[
    el("span",{},[name, required ? el("b",{title:"Required"},[" *"]) : null]), input,
    errors[name] ? el("em",{},[errors[name]]) : null
  ]);
}
function renderPersonaEditorForm(persona, errors={}){
  const form = document.getElementById("personaEditorForm");
  form.innerHTML = "";
  if(!persona){ form.appendChild(emptyState("Select or create a persona.")); return; }
  const counts = personaRelationships(persona.PersonaID);
  form.dataset.originalPersonaId = persona.PersonaID || "";
  form.appendChild(el("div",{class:"editor-related-counts"},[
    el("span",{},[`Speeds: ${counts.speeds}`]), el("span",{},[`Modifiers: ${counts.modifiers}`]), el("span",{},[`Disclaimer links: ${counts.disclaimers}`])
  ]));
  PERSONA_EDITOR_FIELDS.forEach(field => form.appendChild(editorField(field, persona[field], errors)));
  renderSpeedOptionEditor();
}
function personaEditorDraft(){
  const form = document.getElementById("personaEditorForm");
  const draft = {};
  PERSONA_EDITOR_FIELDS.forEach(field => { draft[field] = form.elements[field]?.value ?? ""; });
  return draft;
}
function savePersonaEditor(){
  const form = document.getElementById("personaEditorForm");
  const original = form.dataset.originalPersonaId || "";
  const draft = personaEditorDraft();
  if(original && draft.PersonaID !== original && personaHasRelationships(original) && !window.confirm("This PersonaID has speed, modifier, or disclaimer relationships. Change it anyway?")) return;
  const validation = validatePersonaDraft(draft, original);
  if(!validation.valid){ renderPersonaEditorForm(draft, validation.errors); return; }
  const saved = savePersonaDraft(draft, original, "Browser Persona Editor");
  runDatabaseHealth();
  editorSelectedPersonaID = saved.PersonaID;
  renderAll();
  setAdminSection("health");
  setView("manage", {focus:false});
}
function createNewPersonaEditor(){
  startEditingSession();
  const id = nextSafePersonaID();
  editorSelectedPersonaID = id;
  renderPersonaEditorForm({PersonaID:id, Status:"Draft", EquipInc:"FALSE", SymSpeed:"FALSE"});
}
function duplicateSelectedPersonaEditor(){
  if(!editorSelectedPersonaID) return;
  const saved = duplicatePersona(editorSelectedPersonaID, "Browser Persona Editor");
  runDatabaseHealth();
  editorSelectedPersonaID = saved.PersonaID;
  renderAll();
}
function statusSelectedPersonaEditor(status){
  if(!editorSelectedPersonaID) return;
  setPersonaStatus(editorSelectedPersonaID, status, "Browser Persona Editor");
  runDatabaseHealth();
  renderAll();
}
function deleteSelectedPersonaEditor(){
  if(!editorSelectedPersonaID) return;
  if(!window.confirm("Mark this persona as Deleted in the working copy? It will not be permanently removed.")) return;
  markPersonaDeleted(editorSelectedPersonaID, "Browser Persona Editor");
  runDatabaseHealth();
  renderAll();
}

let editorSelectedSpeedKey = "";
function selectedPersonaSpeedRows(){
  return DB.speedOptions
    .filter(row => row.PersonaID === editorSelectedPersonaID)
    .sort((a,b)=>Number(speedDisplayOrder(a)||0)-Number(speedDisplayOrder(b)||0));
}
function speedOptionStateClass(speed){
  const state = editingSessionState().recordStates?.[sheetRecordKey(SHEET_MAP.speedOptions, speed, 0)] || "";
  return `${truthy(speed.Active) ? "" : " inactive"}${state ? ` ${state}` : ""}`;
}
function renderSpeedOptionEditor(){
  const list = document.getElementById("speedOptionEditorList");
  const form = document.getElementById("speedOptionEditorForm");
  const count = document.getElementById("speedOptionEditorCount");
  if(!list || !form) return;
  const rows = selectedPersonaSpeedRows();
  if(!rows.some(row => speedOptionKey(row) === editorSelectedSpeedKey)) editorSelectedSpeedKey = rows[0] ? speedOptionKey(rows[0]) : "";
  if(count) count.textContent = `${rows.length} speed option${rows.length===1?"":"s"}`;
  list.innerHTML = "";
  if(!editorSelectedPersonaID){
    list.appendChild(emptyState("Select a persona first."));
  }else{
    rows.forEach(speed => {
      const resolution = scheduleResolutionForSpeed(speed);
      list.appendChild(el("button",{class:`persona-editor-row speed-option-row${speedOptionKey(speed)===editorSelectedSpeedKey?" active":""}${speedOptionStateClass(speed)}`, type:"button", onclick:()=>{editorSelectedSpeedKey=speedOptionKey(speed); renderSpeedOptionEditor();}},[
        el("strong",{},[`${speed.SpeedOption || "No option"} • ${speed.DisplaySpeed || "No speed"}`]),
        el("span",{},[`${speed.ReferenceID || "No ReferenceID"} • ${truthy(speed.Active) ? "Active" : "Inactive"} • ${resolution.resolves ? "Pricing resolved" : "Pricing missing"}`])
      ]));
    });
  }
  renderSpeedOptionEditorForm(DB.speedOptions.find(row => speedOptionKey(row) === editorSelectedSpeedKey) || null);
}
function speedOptionField(name, value, errors={}){
  const required = SPEED_OPTION_REQUIRED_FIELDS.includes(name);
  const id = `speedEdit-${name}`;
  const input = name === "Active" ? el("select",{id, name},[["TRUE","True"],["FALSE","False"]].map(([v,l])=>el("option",{value:v, selected:String(value).toUpperCase()===v},[l]))) :
    name === "PricingType" ? el("select",{id, name},[...new Set(["Step Pricing","Flat Pricing","3 Months Free","3 Year Price Lock", ...DB.speedOptions.map(row => row.PricingType).filter(Boolean)])].map(v=>el("option",{value:v, selected:String(value)===String(v)},[v]))) :
    el("input",{id, name, value:value ?? ""});
  return el("label",{class:`editor-field ${errors[name]?"invalid":""}`},[
    el("span",{},[name, required ? el("b",{title:"Required"},[" *"]) : null]), input,
    errors[name] ? el("em",{},[errors[name]]) : null
  ]);
}
function renderSpeedOptionEditorForm(speed, errors={}){
  const form = document.getElementById("speedOptionEditorForm");
  form.innerHTML = "";
  if(!editorSelectedPersonaID){ form.appendChild(emptyState("Select a persona to edit its speed options.")); return; }
  if(!speed){ form.appendChild(emptyState("Create or select a speed option.")); return; }
  const draft = {...speed, DisplayOrder:speedDisplayOrder(speed)};
  const resolution = scheduleResolutionForSpeed(draft);
  const persona = DB.personas.find(row => row.PersonaID === draft.PersonaID);
  form.dataset.originalSpeedKey = speedOptionKey(speed);
  form.dataset.originalScheduleId = speed.ScheduleID || "";
  form.appendChild(el("div",{class:"editor-related-counts"},[
    el("span",{class:resolution.resolves ? "" : "bad"},[`Schedule: ${resolution.resolves ? `${resolution.count} pricing rows` : "unresolved"}`]),
    el("span",{},[`Pricing: ${resolution.summary}`]),
    el("span",{},[`Symmetrical speeds: ${truthy(persona?.SymSpeed) ? "visible / enabled" : "hidden unless upload differs"}`])
  ]));
  SPEED_OPTION_FIELDS.forEach(field => form.appendChild(speedOptionField(field, draft[field], errors)));
}
function speedOptionEditorDraft(){
  const form = document.getElementById("speedOptionEditorForm");
  const draft = {};
  SPEED_OPTION_FIELDS.forEach(field => { draft[field] = form.elements[field]?.value ?? ""; });
  return draft;
}
function saveSpeedOptionEditor(){
  const form = document.getElementById("speedOptionEditorForm");
  const original = form.dataset.originalSpeedKey || "";
  const originalScheduleID = form.dataset.originalScheduleId || "";
  const draft = speedOptionEditorDraft();
  const beforeResolution = original ? scheduleResolutionForSpeed(DB.speedOptions.find(row => speedOptionKey(row) === original) || {}) : {resolves:false};
  const afterResolution = scheduleResolutionForSpeed(draft);
  if(originalScheduleID && draft.ScheduleID !== originalScheduleID && beforeResolution.resolves && !afterResolution.resolves && !window.confirm("Changing ScheduleID breaks the attached pricing relationship. Save anyway?")) return;
  const validation = validateSpeedOptionDraft(draft, original);
  if(!validation.valid){ renderSpeedOptionEditorForm({...draft}, validation.errors); return; }
  const saved = saveSpeedOptionDraft(draft, original);
  runDatabaseHealth();
  editorSelectedSpeedKey = speedOptionKey(saved);
  renderAll();
}
function createSpeedOptionEditor(){
  if(!editorSelectedPersonaID) return;
  startEditingSession();
  const option = nextSpeedOptionForPersona(editorSelectedPersonaID);
  const persona = DB.personas.find(row => row.PersonaID === editorSelectedPersonaID);
  editorSelectedSpeedKey = "";
  renderSpeedOptionEditorForm({PersonaID:editorSelectedPersonaID, SpeedOption:option, ReferenceID:`${editorSelectedPersonaID}-${option}`, DisplayOrder:selectedPersonaSpeedRows().length + 1, Active:"TRUE", PricingType:displayPricingSet(persona?.PricingSet || "Standard")});
}
function duplicateSelectedSpeedOptionEditor(){
  if(!editorSelectedSpeedKey) return;
  const saved = duplicateSpeedOption(editorSelectedSpeedKey);
  runDatabaseHealth();
  editorSelectedSpeedKey = speedOptionKey(saved);
  renderAll();
}
function activeSelectedSpeedOptionEditor(active){
  if(!editorSelectedSpeedKey) return;
  setSpeedOptionActive(editorSelectedSpeedKey, active);
  runDatabaseHealth();
  renderAll();
}
function removeSelectedSpeedOptionEditor(){
  if(!editorSelectedSpeedKey) return;
  if(!window.confirm("Remove this speed option from the working copy? Pricing rows are not deleted.")) return;
  removeSpeedOption(editorSelectedSpeedKey);
  runDatabaseHealth();
  editorSelectedSpeedKey = "";
  renderAll();
}
function moveSelectedSpeedOptionEditor(direction){
  if(!editorSelectedSpeedKey) return;
  moveSpeedOption(editorSelectedSpeedKey, direction);
  runDatabaseHealth();
  renderAll();
}

function appVersion(){
  return "Personaville v1.0";
}
function formattedLastBuild(){
  if(!DB.lastBuildAt) return "Not available";
  const parsed = new Date(DB.lastBuildAt);
  if(!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
  return DB.lastBuildAt;
}
function renderSourceBanner(){
  const box = document.getElementById("sourceBanner");
  if(!box) return;
  const source = DB.loadedFromWorkbook ? "Uploaded Workbook" : "Bundled JSON";
  box.className = `source-banner ${DB.loadedFromWorkbook ? "workbook" : "bundled"}`;
  box.innerHTML = "";
  box.appendChild(el("span",{class:"source-dot"},["●"]));
  box.appendChild(el("strong",{},[`Using ${source}`]));
  box.appendChild(el("span",{},[` • ${DB.sourceFilename || "No database loaded"}`]));
}
function healthReady(){
  return currentBuildSummary().healthErrors === 0;
}
function renderPublishPanel(){
  const box = document.getElementById("publishPanel");
  if(!box) return;
  const built = Boolean(DB.personas.length || DB.speedOptions.length || DB.loadedFromWorkbook);
  const downloaded = !document.getElementById("downloadInstructions")?.hidden;
  const ready = built && healthReady();
  const steps = [
    ["Upload Workbook", DB.loadedFromWorkbook],
    ["Load workbook into browser memory", DB.loadedFromWorkbook],
    ["Review Database Health", built],
    ["Download Updated JSON", downloaded],
    ["Replace database/persona-db.json in GitHub", downloaded],
    ["GitHub Pages publishes automatically", downloaded]
  ];
  box.innerHTML = "";
  box.appendChild(el("div",{class:"publish-head"},[
    el("div",{},[el("h3",{},["Publish Workflow"]), el("p",{class:"muted"},["Follow these steps after updating the workbook."])]),
    el("div",{class:`publish-ready ${ready ? "ok" : "warn"}`},[ready ? "✔ Ready to Publish" : "⚠ Resolve Database Health issues before publishing."])
  ]));
  box.appendChild(el("ol",{class:"publish-steps"},steps.map(([label, done]) => el("li",{class:done ? "done" : ""},[
    el("span",{class:"step-check"},[done ? "✓" : ""]),
    el("span",{},[label])
  ]))));
}
function renderBuildSummary(){
  const box = document.getElementById("buildSummary");
  if(!box) return;
  if(!DB.loadedFromWorkbook){
    box.hidden = true;
    box.innerHTML = "";
    const instructions = document.getElementById("downloadInstructions");
    if(instructions) instructions.hidden = true;
    return;
  }
  const summary = currentBuildSummary();
  box.hidden = false;
  box.innerHTML = "";
  box.appendChild(el("div",{class:"build-summary-title"},["Upload Workbook completed successfully"]));
  box.appendChild(el("div",{class:"build-summary-grid"},[
    summaryMetric("personas", summary.personas),
    summaryMetric("speed options", summary.speedOptions),
    summaryMetric("pricing schedules", summary.pricingSchedules),
    summaryMetric("disclaimers", summary.disclaimers),
    summaryMetric("modifiers", summary.modifiers),
    summaryMetric("icons", summary.icons),
    summaryMetric("health errors", summary.healthErrors, summary.healthErrors ? "bad" : "ok"),
    summaryMetric("health warnings", summary.healthWarnings, summary.healthWarnings ? "warn" : "ok")
  ]));
}
function summaryMetric(label, value, status=""){
  return el("div",{class:`summary-metric ${status}`},[
    el("div",{class:"summary-value"},[String(value)]),
    el("div",{class:"summary-label"},[label])
  ]);
}
function renderKpis(){
  const summary = currentBuildSummary();
  const healthText = `${summary.healthOk} OK • ${summary.healthWarnings} Warnings • ${summary.healthErrors} Errors`;
  const kpis = [
    ["Current Personaville Version", appVersion()],
    ["Database Filename", DB.sourceFilename || "No database loaded"],
    ["Last Build", formattedLastBuild()],
    ["Personas", DB.personas.length],
    ["Speed Options", DB.speedOptions.length],
    ["Pricing Schedule Rows", DB.schedules.length],
    ["Modifiers", DB.modifiers.length],
    ["Disclaimers", DB.disclaimers.length],
    ["Icons", DB.icons.length],
    ["Database Health", healthText]
  ];
  const box = document.getElementById("kpis");
  box.innerHTML="";
  kpis.forEach(([label,value]) => box.appendChild(el("div",{class:"kpi status-card"},[
    el("div",{class:"num"},[String(value)]),
    el("div",{class:"label"},[label])
  ])));
}
function fillFilters(){
  const pricingBox = document.getElementById("pricingFilter");
  const familyBox = document.getElementById("familyFilter");
  const currentPricing = selectedPricingFilter();
  const currentFamilies = selectedFamilyFilters();
  if(pricingBox){
    pricingBox.innerHTML="";
    ["All", "Standard", "3 Months Free", "3 Year Price Lock"].forEach((label, index) => {
      const value = index === 0 ? "" : label;
      const id = `pricingFilter-${index}`;
      pricingBox.appendChild(el("label",{class:"choice-pill"},[
        el("input",{type:"radio", name:"pricingFilter", id, value, checked:value === currentPricing}),
        el("span",{},[label])
      ]));
    });
  }
  if(familyBox){
    familyBox.innerHTML="";
    familyBox.appendChild(el("button",{class:"choice-pill family-choice family-clear-choice", type:"button", onclick:clearFamilyGroupFilter},[
      el("span",{},["All Family Groups"])
    ]));
    getUnique(DB.personas,"FamilyGroup").forEach((family, index)=>{
      const id = `familyFilter-${index}`;
      familyBox.appendChild(el("label",{class:"choice-pill family-choice"},[
        el("input",{type:"checkbox", id, value:family, checked:currentFamilies.includes(family)}),
        el("span",{},[family])
      ]));
    });
  }
  updateFilterSummary();
}
function selectedPricingFilter(){
  return document.querySelector('input[name="pricingFilter"]:checked')?.value || "";
}
function selectedFamilyFilters(){
  return [...document.querySelectorAll('#familyFilter input[type="checkbox"]:checked')].map(input=>input.value);
}
function personaFiltersActive(){
  const query = document.getElementById("globalSearch")?.value || "";
  const families = selectedFamilyFilters();
  const pricing = selectedPricingFilter();
  return Boolean(query.trim() || families.length || pricing);
}
function visiblePersonas(){
  const query = document.getElementById("globalSearch")?.value || "";
  const families = selectedFamilyFilters();
  const pricing = selectedPricingFilter();
  if(!personaFiltersActive()) return [];
  return searchPersonas(query, families, pricing);
}
function updateFilterSummary(){
  const summary = document.getElementById("activeFilterSummary");
  if(!summary) return;
  const query = (document.getElementById("globalSearch")?.value || "").trim();
  const pricing = selectedPricingFilter();
  const families = selectedFamilyFilters();
  const parts = [];
  if(pricing) parts.push(`Pricing: ${pricing}`);
  if(families.length) parts.push(`Families: ${families.join(", ")}`);
  if(query) parts.push(`Search: “${query}”`);
  summary.textContent = parts.length ? parts.join(" • ") : "No filters applied";
}
function resetPersonaDetail(){
  selectedPersona=null;
  const p=document.getElementById("detailPanel");
  if(!p) return;
  p.className="detail empty";
  p.innerHTML="";
  p.appendChild(emptyState("Select a persona to view details."));
}
function clearFamilyGroupFilter(){
  document.querySelectorAll('#familyFilter input[type="checkbox"]').forEach(input => { input.checked = false; });
  renderTiles();
}
function clearPersonaFilters(){
  const search = document.getElementById("globalSearch");
  if(search) search.value = "";
  document.querySelectorAll('#familyFilter input[type="checkbox"]').forEach(input => { input.checked = false; });
  const allPricing = document.querySelector('input[name="pricingFilter"][value=""]');
  if(allPricing) allPricing.checked = true;
  resetPersonaDetail();
  renderTiles();
}
function renderTiles(){
  const active = personaFiltersActive();
  const personas = visiblePersonas();
  const count = document.getElementById("personaResultCount");
  if(count) count.textContent = personas.length ? `${personas.length} persona${personas.length === 1 ? "" : "s"} found` : "No personas found";
  updateFilterSummary();
  const d2 = document.getElementById("personaTiles");
  [d2].forEach(box => {
    if(!box) return;
    box.innerHTML="";
    if(!active){
      box.appendChild(emptyState("Search or choose a filter to view personas.", "Use Pricing Set, Family Group, or Search to narrow the library."));
      return;
    }
    if(!personas.length){
      const empty = emptyState("No personas match the current filters.");
      empty.appendChild(el("button",{class:"btn small empty-action", type:"button", onclick:clearPersonaFilters},["Clear Filters"]));
      box.appendChild(empty);
      return;
    }
    personas.forEach(p => box.appendChild(personaTile(p)));
  });
}
function emptyState(title, message){
  return el("div",{class:"empty-state-panel", role:"status"},[
    el("strong",{},[title]),
    message ? el("p",{class:"muted"},[message]) : null
  ]);
}
function personaTile(p){
  const checked = exportSelection.has(p.PersonaID);
  const chips=[];
  if(truthy(p.EquipInc)) chips.push(el("span",{class:"chip feature"},["✓ Equip Inc"]));
  if(truthy(p.SymSpeed)) chips.push(el("span",{class:"chip feature"},["✓ Sym Speed"]));
  (p.modifiers||[]).forEach(m => chips.push(modifierChip(m)));
  const rows = (p.speeds||[]).map(s => el("tr",{},[
    el("td",{class:"so", "aria-label":s.SpeedOption || "Speed option"},[compactSpeedOptionMarker()]),
    el("td",{},[s.DisplaySpeed || ""]),
    el("td",{class:"price schedule-summary"},[pricingSummaryNode(s)]),
    el("td",{},[money(s.RegularRate)])
  ]));
  return el("article",{
    class:`tile ${checked ? "selected" : ""}`,
    "data-persona-id":p.PersonaID,
    role:"button",
    tabindex:"0",
    "aria-label":`View details for ${p.PersonaName || "persona"}`,
    onclick:()=>selectPersona(p),
    onkeydown:event=>{
      if(event.key === "Enter" || event.key === " "){
        event.preventDefault();
        selectPersona(p);
      }
    }
  },[
    el("div",{class:"tile-select"},[
      el("label",{class:"select-persona", onclick:event=>event.stopPropagation()},[
        el("input",{type:"checkbox", value:p.PersonaID, checked, "aria-label":`Add ${p.PersonaName || "persona"} to Export Cart`, onchange:event=>toggleExportPersona(p.PersonaID, event.currentTarget.checked)}),
        el("span",{},["Add to Export Cart"])
      ])
    ]),
    el("div",{class:"tile-head"},[
      el("div",{},[
        el("h3",{},[p.PersonaName || "Untitled"]),
        el("div",{class:"meta"},[`Family Group: ${p.FamilyGroup || "—"} • ${p.PricingSet || ""}`])
      ]),
      iconSlot(p.IconPath, `${p.PersonaName || "Persona"} icon`, {type:"Persona", id:p.PersonaID, name:p.PersonaName, file:p.PromoIcon})
    ]),
    el("div",{class:"chips"},chips.length?chips:[el("span",{class:"chip gray"},["No modifiers"])]),
    el("table",{class:"speed-table"},[
      el("thead",{},[el("tr",{},[el("th",{},["Option"]),el("th",{},["Speed"]),el("th",{},["Pricing"]),el("th",{},["Reg. Rate"])])]),
      el("tbody",{},rows)
    ])
  ]);
}
function compactSpeedOptionMarker(){
  return "•";
}
function pricingSummaryNode(s){
  const rows = s.schedules || [];
  if(!rows.length) return el("span",{},[money(s.FirstPaidPrice)]);
  if(rows.length === 1 && !truthy(rows[0].DisplayAsFree)) return el("span",{},[money(rows[0].Price ?? s.FirstPaidPrice)]);

  return el("div",{class:"pricing-summary-list"},rows.map(pricingSummaryRow));
}
function pricingSummaryRow(row){
  const label = row.DisplayLabel || monthLabel(row);
  if(truthy(row.DisplayAsFree)){
    return el("div",{class:"pricing-summary-row"},[
      el("span",{class:"pricing-summary-price free"},["Free"]),
      el("span",{class:"pricing-summary-months"},[label])
    ]);
  }
  return el("div",{class:"pricing-summary-row"},[
    el("span",{class:"pricing-summary-price"},[money(row.Price)]),
    el("span",{class:"pricing-summary-months"},[label])
  ]);
}

function selectPersona(p){
  selectedPersona = p;
  renderDetail(p);
  if(typeof setView === "function") setView("personas", {focus:false});
}
function renderDetail(p){
  const panel = document.getElementById("detailPanel");
  panel.className="detail";
  const mods = (p.modifiers||[]).map(m=>m.ModifierName).join(" | ") || "None";
  panel.innerHTML="";
  panel.appendChild(el("div",{class:"detail-title"},[
    iconSlot(p.IconPath, `${p.PersonaName || "Persona"} icon`, {type:"Persona", id:p.PersonaID, name:p.PersonaName, file:p.PromoIcon}),
    el("h3",{},[p.PersonaName])
  ]));
  panel.appendChild(el("div",{class:"meta"},[`Persona ID: ${p.PersonaID} • Family Group: ${p.FamilyGroup}`]));
  const chips = el("div",{class:"chips"},[]);
  if(truthy(p.EquipInc)) chips.appendChild(el("span",{class:"chip feature"},["✓ Equip Inc"]));
  if(truthy(p.SymSpeed)) chips.appendChild(el("span",{class:"chip feature"},["✓ Sym Speed"]));
  (p.modifiers||[]).forEach(m=>chips.appendChild(modifierChip(m)));
  panel.appendChild(chips);
  panel.appendChild(el("div",{class:"detail-section"},[
    el("strong",{},["Ratecard modifiers: "]), mods
  ]));
  (p.speeds||[]).forEach(s => panel.appendChild(speedDetail(s)));
  panel.appendChild(el("div",{class:"detail-section"},[
    el("strong",{},["Notes"]),
    el("p",{class:"muted"},[p.Notes || "No additional notes."])
  ]));
  panel.appendChild(el("div",{class:"detail-section disclaimer"},[
    p.disclaimer?.DisclaimerText || "No disclaimer attached."
  ]));
}
function speedDetail(s){
  const cards = (s.schedules||[]).map(sc => {
    let amount;
    if(truthy(sc.DisplayAsFree)){
      amount = [
        el("span",{class:"free"},["Free"]),
        el("span",{class:"strike"},[money(sc.StrikeThroughPrice || s.FirstPaidPrice)])
      ];
    } else {
      amount = money(sc.Price);
    }
    const amountChildren = Array.isArray(amount) ? amount : [amount];
    return el("div",{class:"schedule-card"},[
      el("div",{class:"label"},[sc.DisplayLabel || monthLabel(sc)]),
      el("div",{class:"amount"},amountChildren)
    ]);
  });
  return el("div",{class:"detail-section"},[
    el("h4",{class:"speed-detail-heading"},[s.DisplaySpeed || s.SpeedOption || "Speed option"]),
    el("div",{class:"meta"},[`Reference ID: ${s.ReferenceID} • Up: ${s.UploadSpeed || s.UploadMbps || "—"} • Reg. Rate: ${money(s.RegularRate)}`]),
    el("div",{class:"schedule-grid"},cards)
  ]);
}
function monthLabel(sc){
  if(sc.StartMonth === sc.EndMonth) return `Month ${sc.StartMonth}`;
  return `Months ${sc.StartMonth}-${sc.EndMonth}`;
}
function renderModifiers(){
  const box = document.getElementById("modifierList");
  if(!box) return;
  box.innerHTML="";
  if(!DB.modifiers.length){
    box.appendChild(emptyState("No modifiers are available.", "Load the published database or upload a workbook to review modifiers."));
    return;
  }
  DB.modifiers.forEach(m => {
    const used = DB.personaModifiers.filter(pm=>pm.ModifierID===m.ModifierID && truthy(pm.Active)).length;
    box.appendChild(el("div",{class:"modifier"},[
      el("div",{class:"modifier-title"},[
        iconSlot(m.IconPath, `${m.ModifierName || "Modifier"} icon`, {type:"Modifier", id:m.ModifierID, name:m.ModifierName, file:m.IconFile}),
        el("h3",{},[m.ModifierName])
      ]),
      el("div",{class:"meta"},[`${m.Category || "Modifier"} • Used by ${used} personas`]),
      el("p",{class:"muted"},[m.Description || ""])
    ]));
  });
}
function renderHealth(){
  const box = document.getElementById("healthList");
  if(!box) return;
  box.innerHTML="";
  const rows = buildHealth();
  if(!rows.length){
    box.appendChild(emptyState("No health checks are available.", "Load the published database or upload a workbook to review database health."));
    return;
  }
  rows.forEach((h, index) => {
    const st = String(h.Status||"").toUpperCase();
    const failed = st && st !== "OK";
    const records = h.Records || [];
    const detailId = `health-detail-${index}`;
    const row = el("button",{
      class:`health-row ${failed ? "failed" : ""}`,
      type:"button",
      "aria-expanded":"false",
      "aria-controls":detailId,
      disabled:failed ? null : "disabled",
      onclick:()=>toggleHealthDetails(detailId, row)
    },[
      el("div",{class:"muted"},[h.Section || ""]),
      el("div",{},[h.Check || ""]),
      el("div",{class:st==="OK"?"status-ok":st==="WARN"?"status-warn":"status-bad"},[st || "—"]),
      el("div",{},[String(h.Count ?? "")]),
      el("div",{class:"health-details muted", title:h.Details || ""},[failed ? "Click to inspect offending records" : (h.Details || "—")])
    ]);
    box.appendChild(row);
    box.appendChild(healthDetailPanel(h, records, detailId));
  });
}
function toggleHealthDetails(detailId, row){
  const panel = document.getElementById(detailId);
  if(!panel || row.disabled) return;
  const open = panel.hidden;
  panel.hidden = !open;
  row.setAttribute("aria-expanded", String(open));
}
function healthDetailPanel(h, records, id){
  const failed = String(h.Status||"").toUpperCase() !== "OK";
  const panel = el("div",{class:"health-detail-panel", id},[]);
  panel.hidden = true;
  if(!failed){
    return panel;
  }
  panel.appendChild(el("h3",{},[`${h.Check || "Health check"} details`]));
  panel.appendChild(el("p",{class:"muted"},[records.length ? `${records.length} offending record${records.length===1?"":"s"}.` : "No record-level details were provided for this failed check."]));
  if(!records.length){
    panel.appendChild(el("pre",{},[h.Details || "No details available."]));
    return panel;
  }
  records.forEach(record => {
    const fields = record.Fields || {};
    panel.appendChild(el("div",{class:"health-record"},[
      el("div",{class:"health-record-title"},[record.Record || "Unknown record"]),
      el("div",{class:"health-record-reason"},[record.Reason || "No reason provided."]),
      el("dl",{class:"health-record-fields"},Object.entries(fields).flatMap(([key,value]) => [
        el("dt",{},[key]),
        el("dd",{},[String(value ?? "")])
      ]))
    ]));
  });
  return panel;
}
function fillExportPicker(){
  const sel = document.getElementById("exportPersona");
  if(!sel) return;
  sel.innerHTML="";
  if(!DB.personas.length){
    sel.appendChild(el("option",{value:""},["No personas available"]));
  }
  DB.personas.forEach(p => sel.appendChild(el("option",{value:p.PersonaID},[p.PersonaName])));
  syncExportSelectionUI();
  renderPrintArea();
  renderExportCartList();
}
function selectedExportPersonas(){
  return [...exportSelection]
    .map(id => DB.personas.find(p => p.PersonaID === id))
    .filter(Boolean);
}
function currentExportPersona(){
  const sel = document.getElementById("exportPersona");
  return DB.personas.find(x=>x.PersonaID===sel?.value) || DB.personas[0];
}
function toggleExportPersona(personaID, checked){
  if(!personaID) return;
  if(checked) exportSelection.add(personaID);
  else exportSelection.delete(personaID);
  syncExportSelectionUI();
  renderPrintArea();
  renderExportCartTray();
  renderTiles();
}
function removeExportPersona(personaID){
  exportSelection.delete(personaID);
  syncExportSelectionUI();
  renderPrintArea();
  renderExportCartTray();
  renderTiles();
}
function selectAllVisiblePersonas(){
  visiblePersonas().forEach(p => { if(p.PersonaID) exportSelection.add(p.PersonaID); });
  syncExportSelectionUI();
  renderPrintArea();
  renderExportCartTray();
  renderTiles();
}
function clearExportSelection(){
  exportSelection.clear();
  syncExportSelectionUI();
  renderPrintArea();
  renderExportCartTray();
  renderTiles();
}
function syncExportSelectionUI(){
  const count = exportSelection.size;
  const label = count === 1 ? "1 persona in Export Cart" : `${count} personas in Export Cart`;
  const countEl = document.getElementById("selectedCount");
  if(countEl) countEl.textContent = label;
  const pageCount = document.getElementById("exportCartCount");
  if(pageCount) pageCount.textContent = label;
  document.querySelectorAll(".select-persona input[type='checkbox']").forEach(input => {
    input.checked = exportSelection.has(input.closest("article")?.dataset?.personaId || input.value);
  });
}

function renderExportCartTray(){
  const tray = document.getElementById("exportCartTray");
  if(!tray) return;
  const count = exportSelection.size;
  tray.hidden = count === 0;
  document.body.classList.toggle("has-export-cart-tray", count > 0);
  if(!count) return;
  const countText = `${count} persona${count === 1 ? "" : "s"}`;
  const message = `${countText} added to Export Cart`;
  tray.innerHTML = "";
  tray.appendChild(el("div",{class:"export-cart-tray-copy", role:"status", "aria-live":"polite"},[
    el("strong",{},[countText]),
    el("span",{},[message])
  ]));
  tray.appendChild(el("div",{class:"export-cart-tray-actions"},[
    el("button",{class:"btn primary", type:"button", onclick:()=>{ if(typeof setView === "function") setView("export"); }},["Open Export Cart"]),
    el("button",{class:"btn", type:"button", onclick:clearExportSelection},["Clear Selection"])
  ]));
}
function renderExportCartList(){
  const list = document.getElementById("exportCartList");
  const empty = document.getElementById("exportCartEmpty");
  const actions = document.getElementById("exportCartActions");
  if(!list) return;
  const personas = selectedExportPersonas();
  list.innerHTML = "";
  if(empty) empty.hidden = personas.length > 0;
  if(actions) actions.hidden = personas.length === 0;
  personas.forEach((p, index) => list.appendChild(el("li",{class:"export-cart-item"},[
    el("div",{},[
      el("strong",{},[p.PersonaName || "Untitled persona"]),
      el("div",{class:"meta"},[`${index + 1}. ${p.FamilyGroup || "—"} • ${p.PricingSet || "—"}`])
    ]),
    el("button",{class:"btn small", type:"button", "aria-label":`Remove ${p.PersonaName || "persona"} from Export Cart`, onclick:()=>removeExportPersona(p.PersonaID)},["Remove"])
  ])));
}

function renderPrintArea(){
  renderExportCartList();
  const area = document.getElementById("printArea");
  if(!area) return;
  area.innerHTML="";
  const selected = selectedExportPersonas();
  if(selected.length){
    selected.forEach((p, index) => area.appendChild(printablePersonaCard(p, index, selected.length)));
    return;
  }
  const p = currentExportPersona();
  if(!p){
    area.appendChild(el("div",{class:"print-card empty-state"},["No personas are available to export."]));
    return;
  }
  area.appendChild(el("div",{class:"print-card empty-state"},[
    el("strong",{},["No personas selected for multi-export."]),
    el("p",{class:"muted"},["Use the tile checkboxes or Select All Visible to print multiple personas. The single-persona preview remains below."])
  ]));
  area.appendChild(printablePersonaCard(p, 0, 1));
}
function printablePersonaCard(p, index=0, total=1){
  const safeName = p.PersonaName || "Untitled persona";
  const card = el("section",{class:"print-card print-persona-page"},[]);
  const inner = el("div",{class:"print-card-inner"},[]);
  card.appendChild(el("header",{class:"print-page-header"},[
    el("div",{},[
      el("div",{class:"print-page-kicker"},[`Persona ${index + 1} of ${total}`]),
      el("h1",{},[safeName])
    ]),
    el("div",{class:"print-page-meta"},[
      el("span",{},[`Family Group: ${p.FamilyGroup || "—"}`]),
      el("span",{},[`Pricing Set: ${p.PricingSet || "—"}`]),
      el("span",{class:"internal-ref"},[`PersonaID: ${p.PersonaID || "—"}`])
    ])
  ]));
  card.appendChild(inner);
  card.appendChild(el("footer",{class:"print-page-footer"},[
    el("span",{},["Personaville"]),
    el("span",{},[p.PersonaID ? `${safeName} • ${p.PersonaID}` : safeName]),
    el("span",{},[`Generated ${new Date().toLocaleDateString()}`]),
    el("span",{class:"print-page-number"},[])
  ]));
  inner.appendChild(el("div",{class:"print-title"},[
    iconSlot(p.IconPath, `${safeName} icon`, {type:"Persona", id:p.PersonaID, name:p.PersonaName, file:p.PromoIcon}),
    el("h2",{},[safeName])
  ]));
  inner.appendChild(el("div",{class:"meta"},[`Family Group: ${p.FamilyGroup || "—"} • Pricing Set: ${p.PricingSet || "—"}`]));
  const chips = el("div",{class:"chips"},[]);
  if(truthy(p.EquipInc)) chips.appendChild(el("span",{class:"chip feature"},["✓ Equip Inc"]));
  if(truthy(p.SymSpeed)) chips.appendChild(el("span",{class:"chip feature"},["✓ Sym Speed"]));
  (p.modifiers||[]).forEach(m=>chips.appendChild(modifierChip(m)));
  inner.appendChild(chips);
  p.speeds.forEach(s => inner.appendChild(speedDetail(s)));
  inner.appendChild(el("div",{class:"detail-section disclaimer"},[p.disclaimer?.DisclaimerText || ""]));
  return card;
}

function selectedSummaryText(){
  const personas = selectedExportPersonas();
  const list = personas.length ? personas : [currentExportPersona()].filter(Boolean);
  if(!list.length) return "";
  const lines=[];
  list.forEach((p, index)=>{
    if(index) lines.push("", "---", "");
    lines.push(p.PersonaName,`Family Group: ${p.FamilyGroup}`,`Pricing Set: ${p.PricingSet}`,"");
    p.speeds.forEach(s=>lines.push(`${s.SpeedOption} ${s.DisplaySpeed} - ${money(s.FirstPaidPrice)} - Reg. ${money(s.RegularRate)}`));
  });
  return lines.join("\n");
}
function copySelectedSummary(){
  const summary = selectedSummaryText();
  if(!summary) return;
  navigator.clipboard.writeText(summary);
  const countEl = document.getElementById("selectedCount");
  if(countEl) countEl.textContent = "Summary copied";
}

function downloadSelectedSummary(){
  const summary = selectedSummaryText();
  if(!summary) return;
  const blob = new Blob([summary], {type:"text/plain"});
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `${exportPdfDocumentTitle()}-Summary.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  const countEl = document.getElementById("selectedCount");
  if(countEl) countEl.textContent = "Summary downloaded";
}

function filenameSafeText(value){
  return String(value || "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

function exportTimestamp(date=new Date()){
  const pad = value => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

let normalDocumentTitle = null;
let activePrintContainer = null;
function exportPdfDocumentTitle(date=new Date()){
  const personas = selectedExportPersonas();
  const timestamp = exportTimestamp(date);
  const personaNames = personas.map(persona => filenameSafeText(persona.PersonaName)).filter(Boolean);
  if(personas.length === 1 && personaNames[0]) return personaNames[0];
  if(personaNames.length) return `Personaville-${personas.length}-Personas-${timestamp}`;
  return `Personaville-Export-${timestamp}`;
}
function removeDedicatedPrintDocument(){
  if(activePrintContainer){
    activePrintContainer.remove();
    activePrintContainer = null;
  }
}
function selectedPersonaPrintLayouts(personas){
  const source = document.createElement("div");
  personas.forEach((persona, index) => source.appendChild(printablePersonaCard(persona, index, personas.length)));
  return Array.from(source.querySelectorAll(".print-persona-page"), card => card.cloneNode(true));
}
function createDedicatedPrintDocument(personas){
  removeDedicatedPrintDocument();
  const container = document.createElement("div");
  container.className = "persona-print-document";
  container.setAttribute("aria-hidden", "true");
  selectedPersonaPrintLayouts(personas).forEach(card => container.appendChild(card));
  document.body.appendChild(container);
  activePrintContainer = container;
  return container;
}
function printCombinedExportPdf(){
  const personas = selectedExportPersonas();
  if(!personas.length) return;
  normalDocumentTitle = document.title;
  document.title = exportPdfDocumentTitle();
  createDedicatedPrintDocument(personas);
  window.print();
}
function restorePrintDocumentTitle(){
  if(normalDocumentTitle === null) return;
  document.title = normalDocumentTitle;
  normalDocumentTitle = null;
}

function resetPrintScaling(){
  document.querySelectorAll(".print-persona-page").forEach(card => {
    card.style.removeProperty("--print-scale");
  });
}
function fitPrintCardsToLetter(){
  resetPrintScaling();
  const maxScale = 1;
  const minScale = 0.82;
  document.querySelectorAll(".print-persona-page").forEach(card => {
    const inner = card.querySelector(".print-card-inner");
    if(!inner) return;
    const availableHeight = card.clientHeight || 0;
    const availableWidth = card.clientWidth || 0;
    const heightScale = availableHeight ? availableHeight / inner.scrollHeight : maxScale;
    const widthScale = availableWidth ? availableWidth / inner.scrollWidth : maxScale;
    const scale = Math.max(minScale, Math.min(maxScale, heightScale, widthScale));
    card.style.setProperty("--print-scale", String(scale));
  });
}
