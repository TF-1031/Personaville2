const ASSET_MANAGER_FILES = [
  {filename:"icon-3MonthsFree.png", path:"assets/icons/icon-3MonthsFree.png", category:"promotion icons"},
  {filename:"icon-PriceLock.png", path:"assets/icons/icon-PriceLock.png", category:"promotion icons"},
  {filename:"icon-Standard.png", path:"assets/icons/icon-Standard.png", category:"promotion icons"},
  {filename:"icon-Gig40.png", path:"assets/icons/icon-Gig40.png", category:"modifier icons"},
  {filename:"icon-Equipment.png", path:"assets/icons/icon-Equipment.png", category:"modifier icons"},
  {filename:"icon-Symmetrical.png", path:"assets/icons/icon-Symmetrical.png", category:"modifier icons"},
  {filename:"personaville-header.png", path:"assets/images/personaville-header.png", category:"hero images"}
];

const AssetManager = {view:"grid", category:"all", query:"", selected:"", staged:[]};
const ASSET_EXTENSIONS = ["png","jpg","jpeg","webp","svg"];
const ASSET_MAX_BYTES = 5 * 1024 * 1024;

function assetExt(name){ return String(name||"").split(".").pop().toLowerCase(); }
function assetType(name){ return assetExt(name).toUpperCase() || "Unknown"; }
function assetFolderFor(category){ return category === "hero images" || category === "supporting images" ? "assets/images/" : "assets/icons/"; }
function normalizeAssetFilename(name){ return String(name||"").trim().replace(/^.*[\\/]/, ""); }
function assetKey(asset){ return asset.stagedId || asset.path; }
function existingAssetNames(){ return new Set(ASSET_MANAGER_FILES.map(a=>a.filename.toLowerCase()).concat(AssetManager.staged.map(a=>a.filename.toLowerCase()))); }
function assetUsage(){
  const uses = new Map(); const add=(file, record)=>{ const f=normalizeIconFile(file).toLowerCase(); if(!f) return; if(!uses.has(f)) uses.set(f, []); uses.get(f).push(record); };
  DB.icons.forEach(i=>add(i.FileName,{type:"Icon table", id:i.IconID, name:i.IconName, field:"FileName"}));
  DB.personas.forEach(p=>add(p.PromoIcon,{type:"Persona", id:p.PersonaID, name:p.PersonaName, field:"PromoIcon"}));
  DB.modifiers.forEach(m=>add(m.IconFile,{type:"Modifier", id:m.ModifierID, name:m.ModifierName, field:"IconFile"}));
  return uses;
}
function assetRecords(){
  const usage = assetUsage();
  const listed = ASSET_MANAGER_FILES.concat(AssetManager.staged).map(asset=>({...asset, type:assetType(asset.filename), staged:Boolean(asset.stagedId), uses:usage.get(asset.filename.toLowerCase())||[]}));
  const known = new Set(listed.map(a=>a.filename.toLowerCase()));
  usage.forEach((records, filename)=>{ if(!known.has(filename)) listed.push({filename, path:assetFolderFor("promotion icons") + filename, category:"missing referenced assets", type:assetType(filename), missing:true, uses:records}); });
  return listed;
}
function filteredAssets(){ const q=AssetManager.query.toLowerCase(); return assetRecords().filter(a=>(AssetManager.category==="all" || a.category===AssetManager.category) && (!q || a.filename.toLowerCase().includes(q))); }
function renderAssetManager(){
  const root=document.getElementById("assetManagerRoot"); if(!root) return;
  const assets=filteredAssets(); const selected=assetRecords().find(a=>assetKey(a)===AssetManager.selected) || assets[0]; if(selected) AssetManager.selected=assetKey(selected);
  root.innerHTML="";
  const cats=["all","promotion icons","modifier icons","hero images","supporting images","missing referenced assets"];
  root.appendChild(el("div",{class:"asset-manager-toolbar"},[
    el("input",{class:"search",type:"search",placeholder:"Search filenames",value:AssetManager.query,oninput:e=>{AssetManager.query=e.target.value;renderAssetManager();}}),
    el("select",{onchange:e=>{AssetManager.category=e.target.value;renderAssetManager();}},cats.map(c=>el("option",{value:c,selected:c===AssetManager.category},[c]))),
    el("button",{class:`btn ${AssetManager.view==="grid"?"primary":""}`,type:"button",onclick:()=>{AssetManager.view="grid";renderAssetManager();}},["Grid"]),
    el("button",{class:`btn ${AssetManager.view==="list"?"primary":""}`,type:"button",onclick:()=>{AssetManager.view="list";renderAssetManager();}},["List"]),
    el("label",{class:"btn primary"},["Stage Upload", el("input",{type:"file",accept:".png,.jpg,.jpeg,.webp,.svg",hidden:true,onchange:stageAssetUpload})]),
    el("button",{class:"btn",type:"button",onclick:downloadAssetPublishingPackage,disabled:AssetManager.staged.length===0},["Download Publishing Package"])
  ]));
  root.appendChild(el("div",{class:"asset-manager-note"},["Uploads are staged in browser memory only. They are included in the downloadable publishing package and are not uploaded to GitHub. Direct authenticated publishing: Coming Soon."]));
  root.appendChild(el("div",{class:"asset-manager-summary"},[
    el("span",{class:"pill gray"},[`${assets.length} shown`]), el("span",{class:"pill gray"},[`${assetRecords().filter(a=>!a.missing&&!a.uses.length).length} unused`]), el("span",{class:"pill gray"},[`${assetRecords().filter(a=>a.missing).length} missing referenced`]), el("span",{class:"pill gray"},[`${AssetManager.staged.length} staged`])
  ]));
  const browser=el("div",{class:"asset-manager-browser"});
  const list=el("div",{class:`asset-list ${AssetManager.view}`});
  assets.forEach(a=>list.appendChild(assetCard(a)));
  browser.append(list, assetDetail(selected)); root.appendChild(browser);
}
function assetCard(a){ return el("button",{class:`asset-card ${AssetManager.view} ${assetKey(a)===AssetManager.selected?"selected":""} ${a.missing?"missing":""}`,type:"button",onclick:()=>{AssetManager.selected=assetKey(a);renderAssetManager();}},[
  assetThumb(a), el("strong",{},[a.filename]), el("span",{class:"muted"},[`${a.category} • ${a.type}`]), el("span",{class:`pill ${a.missing?"bad":a.uses.length?"ok":"gray"}`},[a.missing?"Missing":a.uses.length?`${a.uses.length} use${a.uses.length===1?"":"s"}`:"Unused"])
]); }
function assetThumb(a){ return el("div",{class:"asset-thumb"},[a.missing?el("span",{},["Missing"]):el("img",{src:a.objectUrl||a.path,alt:"",loading:"lazy",onload:e=>{const m=e.currentTarget.closest(".asset-card,.asset-detail"); const d=m?.querySelector("[data-dimensions]"); if(d) d.textContent=`${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight}`;},onerror:e=>{e.currentTarget.replaceWith(el("span",{},["Preview unavailable"]));}})]); }
function assetDetail(a){ if(!a) return el("aside",{class:"asset-detail empty-state-panel"},["No assets found."]); return el("aside",{class:"asset-detail"},[
  assetThumb(a), el("h3",{},[a.filename]), el("dl",{class:"asset-meta"},[el("dt",{},["Folder"]),el("dd",{},[a.path?.replace(a.filename,"")||assetFolderFor(a.category)]),el("dt",{},["Type"]),el("dd",{},[a.type]),el("dt",{},["Dimensions"]),el("dd",{"data-dimensions":""},[a.missing?"Missing":"Loading…"]),el("dt",{},["Status"]),el("dd",{},[a.missing?"Referenced by database but not found in the asset manifest":a.uses.length?"Used":"Unused"])]),
  el("h4",{},["Database usage"]), a.uses.length?el("ul",{class:"asset-usage"},a.uses.map(u=>el("li",{},[`${u.type} ${u.id}: ${u.name||"Unnamed"} (${u.field})`]))):el("p",{class:"muted"},["No database records use this asset."]),
  el("h4",{},["Assign filename"]), assignmentControls(a)
]); }
function assignmentControls(a){ if(a.missing) return el("p",{class:"muted"},["Add the missing file to assign it."]); const persona=el("select",{},DB.personas.map(p=>el("option",{value:p.PersonaID},[`${p.PersonaID} — ${p.PersonaName}`]))); const mod=el("select",{},DB.modifiers.map(m=>el("option",{value:m.ModifierID},[`${m.ModifierID} — ${m.ModifierName}`]))); return el("div",{class:"asset-assign"},[
  persona, el("button",{class:"btn",type:"button",onclick:()=>assignPersonaAsset(persona.value,a.filename)},["Assign to Persona PromoIcon"]),
  mod, el("button",{class:"btn",type:"button",onclick:()=>assignModifierAsset(mod.value,a.filename)},["Assign to Modifier IconFile"])
]); }
async function stageAssetUpload(e){ const file=e.target.files?.[0]; e.target.value=""; if(!file) return; const filename=normalizeAssetFilename(file.name); const ext=assetExt(filename); if(!ASSET_EXTENSIONS.includes(ext)) return alert("Use PNG, JPG, JPEG, WEBP, or SVG files only."); if(file.size>ASSET_MAX_BYTES) return alert("Asset is larger than the 5 MB browser staging limit."); const names=existingAssetNames(); const collision=names.has(filename.toLowerCase()); if(collision && !confirm(`Replace existing filename ${filename} in the publishing package? This does not change GitHub until you publish manually.`)) return; const category=ext==="svg"||filename.toLowerCase().startsWith("icon-")?"promotion icons":"supporting images"; const objectUrl=URL.createObjectURL(file); const dataUrl=await new Promise((res,rej)=>{const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file);}); AssetManager.staged=AssetManager.staged.filter(a=>a.filename.toLowerCase()!==filename.toLowerCase()); AssetManager.staged.push({stagedId:`staged:${Date.now()}:${filename}`, filename, path:assetFolderFor(category)+filename, category, size:file.size, objectUrl, dataUrl}); AssetManager.selected=AssetManager.staged.at(-1).stagedId; renderAssetManager(); }
function assignPersonaAsset(id, filename){ const p=DB.personas.find(x=>x.PersonaID===id); if(!p) return; savePersonaDraft({...p, PromoIcon:filename}, id, "Asset Manager"); renderAll(); renderAssetManager(); }
function assignModifierAsset(id, filename){ const m=DB.modifiers.find(x=>x.ModifierID===id); if(!m) return; saveModifierDraft({...m, IconFile:filename}, id); renderAll(); renderAssetManager(); }
function downloadAssetPublishingPackage(){ const pkg={createdAt:new Date().toISOString(), note:"Assets are staged from browser memory. Add each file to the listed path in GitHub, then publish the downloaded database JSON if assignments changed. Direct authenticated publishing is Coming Soon.", stagedAssets:AssetManager.staged.map(({filename,path,category,size,dataUrl})=>({filename,path,category,size,dataUrl})), database:activeDatabaseSnapshot()}; const blob=new Blob([JSON.stringify(pkg,null,2)],{type:"application/json"}); const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download="personaville-asset-publishing-package.json"; link.click(); URL.revokeObjectURL(link.href); }
